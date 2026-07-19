-- Applique réellement les rôles de l'équipe plateforme.
--
-- Constat : plateforme_admins porte bien une colonne « role »
-- (total | support | facturation | lecture), mais est_plateforme_admin()
-- se contente de vérifier la présence de l'email et ignore le rôle.
-- Conséquence : une personne ajoutée en « lecture » ou « support » pouvait
-- malgré tout modifier les abonnements, les tarifs, signaler des impayés
-- ou créer des entreprises.
--
-- Matrice appliquée ici :
--   lecture      : consultation seule
--   support      : consultation + support + entrée en entreprise (déjà en place)
--   facturation  : consultation + abonnements, tarifs, impayés, règlements
--   total        : tout, y compris créer une entreprise et gérer l'équipe

-- ─────────────────────────────────────────────────────────────
-- Garde-fou réutilisable
-- ─────────────────────────────────────────────────────────────
create or replace function public.plateforme_role_courant()
returns text
language sql security definer stable set search_path = public as $$
  select role from public.plateforme_admins where email = auth.email();
$$;

create or replace function public.plateforme_exiger_role(variadic p_roles text[])
returns void
language plpgsql security definer set search_path = public as $$
declare v_role text;
begin
  v_role := public.plateforme_role_courant();
  if v_role is null then
    raise exception 'Accès réservé à la plateforme';
  end if;
  if not (v_role = any(p_roles)) then
    raise exception 'Action réservée aux rôles % (votre rôle : %)', array_to_string(p_roles, ', '), v_role;
  end if;
end; $$;

-- ─────────────────────────────────────────────────────────────
-- Abonnements, tarifs, impayés, règlements → total + facturation
-- (corps identiques à l'existant, seule la ligne de contrôle change)
-- ─────────────────────────────────────────────────────────────
create or replace function public.plateforme_modifier_abonnement(
  p_entreprise_id uuid, p_statut text, p_echeance date, p_note text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  if p_statut not in ('essai', 'actif', 'suspendu', 'annule') then raise exception 'Statut invalide'; end if;
  update public.entreprises
  set abonnement_statut = p_statut,
      abonnement_echeance = p_echeance,
      abonnement_note = p_note,
      impaye_signale_at = case when p_statut = 'actif' then null else impaye_signale_at end,
      suspension_prevue_at = case when p_statut = 'actif' then null else suspension_prevue_at end,
      impaye_message = case when p_statut = 'actif' then null else impaye_message end,
      updated_at = now()
  where id = p_entreprise_id;
end;
$$;

create or replace function public.plateforme_modifier_tarif_poste(p_poste_id uuid, p_code_offre text, p_tarif numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  if p_tarif is null or p_tarif < 0 then raise exception 'Tarif invalide'; end if;
  update public.postes set code_offre = coalesce(nullif(btrim(p_code_offre), ''), 'standard'),
                           tarif_compte_mensuel = round(p_tarif, 2)
  where id = p_poste_id;
  if not found then raise exception 'Poste introuvable'; end if;
end; $$;

create or replace function public.plateforme_signaler_impaye(
  p_entreprise_id uuid,
  p_message text default null
) returns timestamptz
language plpgsql security definer set search_path = public as $$
declare v_echeance timestamptz := now() + interval '10 days';
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  update public.entreprises
  set impaye_signale_at = now(),
      suspension_prevue_at = v_echeance,
      impaye_message = coalesce(nullif(btrim(p_message), ''), 'Règlement non reçu'),
      abonnement_note = coalesce(nullif(btrim(p_message), ''), abonnement_note),
      updated_at = now()
  where id = p_entreprise_id and abonnement_statut <> 'annule';
  if not found then raise exception 'Entreprise introuvable ou abonnement annulé'; end if;
  return v_echeance;
end;
$$;

create or replace function public.plateforme_enregistrer_reglement(
  p_entreprise_id uuid,
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  update public.entreprises
  set abonnement_statut = case when abonnement_statut = 'suspendu' then 'actif' else abonnement_statut end,
      impaye_signale_at = null,
      suspension_prevue_at = null,
      impaye_message = null,
      dernier_reglement_at = now(),
      abonnement_note = coalesce(nullif(btrim(p_note), ''), abonnement_note),
      updated_at = now()
  where id = p_entreprise_id;
  if not found then raise exception 'Entreprise introuvable'; end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Support → total + support
-- ─────────────────────────────────────────────────────────────
create or replace function public.plateforme_support_repondre(p_entreprise_id uuid, p_contenu text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.plateforme_exiger_role('total', 'support');
  if length(trim(coalesce(p_contenu, ''))) = 0 then raise exception 'Message vide'; end if;
  insert into public.support_messages (entreprise_id, cote, auteur_id, auteur_nom, contenu, lu_par_plateforme)
  values (p_entreprise_id, 'plateforme', auth.uid(), coalesce(auth.email(), 'Support plateforme'), trim(p_contenu), true);
end;
$$;

-- ─────────────────────────────────────────────────────────────
-- Création d'entreprise → total uniquement
-- ─────────────────────────────────────────────────────────────
create or replace function public.plateforme_creer_entreprise(p_nom text, p_siret text default null, p_ville text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_modele record;
begin
  perform public.plateforme_exiger_role('total');
  if nullif(btrim(p_nom), '') is null then raise exception 'Nom obligatoire'; end if;
  insert into public.entreprises(nom, raison_sociale, siret, ville, abonnement_statut, abonnement_note)
  values(btrim(p_nom), btrim(p_nom), nullif(btrim(p_siret), ''), nullif(btrim(p_ville), ''), 'essai', 'Créée par la plateforme')
  returning id into v_id;
  for v_modele in select cle from public.modeles_roles_predefinis order by ordre loop
    perform public.appliquer_modele_role_predefini_interne(v_id, v_modele.cle, true);
  end loop;
  return v_id;
end; $$;

-- ─────────────────────────────────────────────────────────────
-- Droits d'exécution (inchangés pour les fonctions recréées)
-- ─────────────────────────────────────────────────────────────
revoke all on function public.plateforme_role_courant() from public, anon;
revoke all on function public.plateforme_exiger_role(text[]) from public, anon;
grant execute on function public.plateforme_role_courant() to authenticated;

revoke all on function public.plateforme_modifier_abonnement(uuid, text, date, text) from public, anon;
revoke all on function public.plateforme_modifier_tarif_poste(uuid, text, numeric) from public, anon;
revoke all on function public.plateforme_signaler_impaye(uuid, text) from public, anon;
revoke all on function public.plateforme_enregistrer_reglement(uuid, text) from public, anon;
revoke all on function public.plateforme_support_repondre(uuid, text) from public, anon;
revoke all on function public.plateforme_creer_entreprise(text, text, text) from public, anon;

grant execute on function public.plateforme_modifier_abonnement(uuid, text, date, text) to authenticated;
grant execute on function public.plateforme_modifier_tarif_poste(uuid, text, numeric) to authenticated;
grant execute on function public.plateforme_signaler_impaye(uuid, text) to authenticated;
grant execute on function public.plateforme_enregistrer_reglement(uuid, text) to authenticated;
grant execute on function public.plateforme_support_repondre(uuid, text) to authenticated;
grant execute on function public.plateforme_creer_entreprise(text, text, text) to authenticated;

notify pgrst, 'reload schema';
