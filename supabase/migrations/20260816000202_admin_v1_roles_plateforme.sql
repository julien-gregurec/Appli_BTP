-- ADMIN-V1 : source de vérité et moindre privilège pour l'administration ELSATIA.
-- Les rôles tenant restent dans utilisateurs_entreprises/postes. Les rôles
-- plateforme restent exclusivement dans plateforme_admins et sont liés à un
-- utilisateur Auth précis, jamais à une metadata modifiable par le client.

alter table public.plateforme_admins
  add column if not exists utilisateur_id uuid references auth.users(id) on delete restrict,
  add column if not exists actif boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists plateforme_admins_utilisateur_unique
  on public.plateforme_admins(utilisateur_id)
  where utilisateur_id is not null;

-- Rattachement initial des autorisations historiques au compte Auth existant.
update public.plateforme_admins pa
set utilisateur_id = au.id,
    updated_at = now()
from auth.users au
where pa.utilisateur_id is null
  and lower(au.email) = lower(pa.email);

revoke all on table public.plateforme_admins from public, anon, authenticated;

create or replace function public.plateforme_role_courant()
returns text
language sql security definer stable set search_path = public as $$
  select pa.role
  from public.plateforme_admins pa
  where pa.utilisateur_id = auth.uid()
    and pa.actif
  limit 1;
$$;

create or replace function public.est_plateforme_admin()
returns boolean
language sql security definer stable set search_path = public as $$
  select public.plateforme_role_courant() is not null;
$$;

create or replace function public.plateforme_a_permission(p_permission text)
returns boolean
language sql security definer stable set search_path = public as $$
  select case public.plateforme_role_courant()
    when 'total' then p_permission = any(array[
      'consulter_plateforme','consulter_support','repondre_support',
      'reinitialiser_compte','consulter_facturation','gerer_facturation',
      'consulter_tarification','gerer_tarification','gerer_equipe',
      'creer_entreprise','intervenir_tenant','gerer_remises','gerer_boutique'
    ])
    when 'support' then p_permission = any(array[
      'consulter_plateforme','consulter_support','repondre_support','reinitialiser_compte'
    ])
    when 'facturation' then p_permission = any(array[
      'consulter_plateforme','consulter_facturation','gerer_facturation','consulter_tarification'
    ])
    when 'lecture' then p_permission = any(array[
      'consulter_plateforme','consulter_tarification'
    ])
    else false
  end;
$$;

create or replace function public.plateforme_exiger_permission(p_permission text)
returns void
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.plateforme_a_permission(p_permission) then
    raise exception 'Permission plateforme refusée : %', p_permission using errcode = '42501';
  end if;
end;
$$;

-- Compatibilité avec les RPC historiques déjà sécurisées par liste de rôles.
create or replace function public.plateforme_exiger_role(variadic p_roles text[])
returns void
language plpgsql security definer stable set search_path = public as $$
declare v_role text := public.plateforme_role_courant();
begin
  if v_role is null or not (v_role = any(p_roles)) then
    raise exception 'Rôle plateforme insuffisant' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.plateforme_role_courant() from public, anon;
revoke all on function public.est_plateforme_admin() from public, anon;
revoke all on function public.plateforme_a_permission(text) from public, anon;
revoke all on function public.plateforme_exiger_permission(text) from public, anon;
revoke all on function public.plateforme_exiger_role(text[]) from public, anon;
grant execute on function public.plateforme_role_courant() to authenticated;
grant execute on function public.est_plateforme_admin() to authenticated;
grant execute on function public.plateforme_a_permission(text) to authenticated;

-- Journal minimal des mutations plateforme. Il ne contient ni secret ni payload
-- métier ; les journaux spécialisés (tarifs et accès support) restent inchangés.
create table if not exists public.plateforme_journal_actions (
  id uuid primary key default gen_random_uuid(),
  acteur_id uuid references auth.users(id) on delete set null,
  acteur_email text,
  action text not null,
  cible_type text,
  cible_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists plateforme_journal_actions_date_idx
  on public.plateforme_journal_actions(created_at desc);
alter table public.plateforme_journal_actions enable row level security;
drop policy if exists plateforme_journal_actions_total on public.plateforme_journal_actions;
create policy plateforme_journal_actions_total on public.plateforme_journal_actions
  for select to authenticated using(public.plateforme_a_permission('gerer_equipe'));
revoke all on table public.plateforme_journal_actions from public, anon, authenticated;
grant select on table public.plateforme_journal_actions to authenticated;

create or replace function public.plateforme_journaliser(
  p_action text, p_cible_type text default null, p_cible_id text default null,
  p_details jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.plateforme_role_courant() is null then
    raise exception 'Accès plateforme requis' using errcode = '42501';
  end if;
  insert into public.plateforme_journal_actions(
    acteur_id, acteur_email, action, cible_type, cible_id, details
  ) values (
    auth.uid(), auth.email(), p_action, p_cible_type, p_cible_id,
    coalesce(p_details, '{}'::jsonb)
  );
end;
$$;
revoke all on function public.plateforme_journaliser(text,text,text,jsonb) from public, anon, authenticated;

-- Équipe plateforme : seul total peut consulter ou modifier les rôles. Le compte
-- Auth doit exister avant l'attribution, ce qui lie la permission à son UUID.
drop function if exists public.plateforme_lister_admins();
create function public.plateforme_lister_admins()
returns table(email text, role text, nom text, ajoute_par text, actif boolean, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  perform public.plateforme_exiger_permission('gerer_equipe');
  return query
  select pa.email, pa.role, pa.nom, pa.ajoute_par, pa.actif, pa.created_at
  from public.plateforme_admins pa
  order by pa.actif desc, pa.created_at;
end;
$$;

create or replace function public.plateforme_ajouter_admin(
  p_email text, p_nom text default null, p_role text default 'total'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(p_email));
  v_uid uuid;
  v_role_existant text;
begin
  perform public.plateforme_exiger_permission('gerer_equipe');
  if p_role not in ('total','support','facturation','lecture') then
    raise exception 'Rôle invalide';
  end if;
  select id into v_uid from auth.users where lower(email) = v_email;
  if v_uid is null then
    raise exception 'Créez et validez d''abord le compte Auth correspondant';
  end if;
  select role into v_role_existant from public.plateforme_admins where utilisateur_id = v_uid;
  if v_uid = auth.uid() and v_role_existant is not null and v_role_existant <> p_role then
    raise exception 'Vous ne pouvez pas modifier votre propre rôle plateforme';
  end if;
  insert into public.plateforme_admins(email, utilisateur_id, role, nom, ajoute_par, actif, updated_at)
  values(v_email, v_uid, p_role, nullif(btrim(coalesce(p_nom,'')),''), auth.email(), true, now())
  on conflict(email) do update set
    utilisateur_id = excluded.utilisateur_id,
    role = excluded.role,
    nom = coalesce(excluded.nom, public.plateforme_admins.nom),
    actif = true,
    updated_at = now();
  perform public.plateforme_journaliser(
    case when v_role_existant is null then 'role_plateforme_ajoute' else 'role_plateforme_modifie' end,
    'utilisateur', v_uid::text,
    jsonb_build_object('role', p_role)
  );
end;
$$;

create or replace function public.plateforme_retirer_admin(p_email text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(btrim(p_email));
  v_uid uuid;
  v_role text;
begin
  perform public.plateforme_exiger_permission('gerer_equipe');
  select utilisateur_id, role into v_uid, v_role
  from public.plateforme_admins where lower(email) = v_email and actif;
  if v_uid is null then raise exception 'Compte plateforme introuvable'; end if;
  if v_uid = auth.uid() then raise exception 'Vous ne pouvez pas désactiver votre propre compte'; end if;
  if v_role = 'total' and (
    select count(*) from public.plateforme_admins where actif and role = 'total'
  ) <= 1 then
    raise exception 'Impossible de désactiver le dernier compte total';
  end if;
  update public.plateforme_admins set actif = false, updated_at = now() where utilisateur_id = v_uid;
  perform public.plateforme_journaliser('role_plateforme_desactive', 'utilisateur', v_uid::text, jsonb_build_object('ancien_role', v_role));
end;
$$;

revoke all on function public.plateforme_lister_admins() from public, anon, authenticated;
revoke all on function public.plateforme_ajouter_admin(text,text,text) from public, anon, authenticated;
revoke all on function public.plateforme_retirer_admin(text) from public, anon, authenticated;
grant execute on function public.plateforme_lister_admins() to authenticated;
grant execute on function public.plateforme_ajouter_admin(text,text,text) to authenticated;
grant execute on function public.plateforme_retirer_admin(text) to authenticated;

-- L'ouverture d'un tenant donne accès aux politiques métier : elle est donc
-- réservée au rôle total, avec motif et session journalisée.
create or replace function public.est_acces_support_actif(p_entreprise_id uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists(
    select 1
    from public.plateforme_acces_entreprises s
    join public.plateforme_admins pa on pa.utilisateur_id = auth.uid() and pa.actif
    where s.plateforme_user_id = auth.uid()
      and s.entreprise_id = p_entreprise_id
      and s.termine_at is null
      and pa.role = 'total'
  );
$$;

create or replace function public.plateforme_entrer_entreprise(p_entreprise_id uuid, p_motif text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_entreprise_precedente uuid;
  v_session public.plateforme_acces_entreprises;
begin
  perform public.plateforme_exiger_permission('intervenir_tenant');
  if length(btrim(coalesce(p_motif,''))) < 5 then raise exception 'Indiquez un motif d''intervention précis'; end if;
  if not exists(select 1 from public.entreprises where id = p_entreprise_id) then raise exception 'Entreprise introuvable'; end if;
  select * into v_session from public.plateforme_acces_entreprises
  where plateforme_user_id = auth.uid() and termine_at is null for update;
  if v_session.id is not null then
    v_entreprise_precedente := v_session.entreprise_precedente_id;
    update public.plateforme_acces_entreprises
    set termine_at = now(), termine_motif = 'Changement d''entreprise' where id = v_session.id;
  else
    select entreprise_active_id into v_entreprise_precedente from public.utilisateurs where id = auth.uid();
  end if;
  insert into public.plateforme_acces_entreprises(
    plateforme_user_id, entreprise_id, entreprise_precedente_id, motif
  ) values(auth.uid(), p_entreprise_id, v_entreprise_precedente, btrim(p_motif));
  update public.utilisateurs set entreprise_active_id = p_entreprise_id where id = auth.uid();
end;
$$;

-- Lecture synthétique : tous les rôles voient l'état général. Les identifiants
-- d'adhésion et données financières détaillées sont masqués hors besoin métier.
drop function if exists public.plateforme_entreprises();
create function public.plateforme_entreprises()
returns table(
  id uuid,nom text,code_adhesion text,reference_interne text,
  abonnement_statut text,abonnement_echeance date,abonnement_note text,
  impaye_signale_at timestamptz,suspension_prevue_at timestamptz,
  impaye_message text,dernier_reglement_at timestamptz,
  abonnement_offre text,abonnement_periodicite text,abonnement_essai_fin date,
  abonnement_annulation_prevue_at timestamptz,stripe_customer_id text,
  stripe_subscription_id text,derniere_facture_url text,
  derniere_facture_pdf text,derniere_facture_statut text,
  remise_stripe_coupon_id text,remise_description text,remise_appliquee_at timestamptz,
  option_ia_statut text,option_ia_essai_fin timestamptz,option_ia_palier text,
  nb_membres bigint,nb_membres_actifs bigint,created_at timestamptz
)
language plpgsql security definer stable set search_path = public as $$
declare
  v_role text := public.plateforme_role_courant();
  v_finance boolean;
  v_support boolean;
begin
  perform public.plateforme_exiger_permission('consulter_plateforme');
  v_finance := v_role in ('total','facturation');
  v_support := v_role in ('total','support');
  return query
  select e.id,e.nom,
    case when v_support then e.code_adhesion else null end,
    e.reference_interne,e.abonnement_statut,e.abonnement_echeance,
    case when v_finance then e.abonnement_note else null end,
    case when v_finance then e.impaye_signale_at else null end,
    case when v_finance then e.suspension_prevue_at else null end,
    case when v_finance then e.impaye_message else null end,
    case when v_finance then e.dernier_reglement_at else null end,
    e.abonnement_offre,e.abonnement_periodicite,e.abonnement_essai_fin,
    case when v_finance then e.abonnement_annulation_prevue_at else null end,
    case when v_finance then e.stripe_customer_id else null end,
    case when v_finance then e.stripe_subscription_id else null end,
    case when v_finance then e.derniere_facture_url else null end,
    case when v_finance then e.derniere_facture_pdf else null end,
    case when v_finance then e.derniere_facture_statut else null end,
    case when v_finance then e.remise_stripe_coupon_id else null end,
    case when v_finance then e.remise_description else null end,
    case when v_finance then e.remise_appliquee_at else null end,
    e.option_ia_statut,e.option_ia_essai_fin,e.option_ia_palier,
    (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id=e.id),
    (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id=e.id and ue.statut='actif'),
    e.created_at
  from public.entreprises e order by e.created_at desc;
end;
$$;
revoke all on function public.plateforme_entreprises() from public, anon, authenticated;
grant execute on function public.plateforme_entreprises() to authenticated;

-- Support dédié : aucun accès direct au tenant n'est requis pour lire/répondre.
drop function if exists public.plateforme_support_fils();
create function public.plateforme_support_fils()
returns table(entreprise_id uuid,entreprise_nom text,dernier_contenu text,dernier_cote text,dernier_at timestamptz,non_lus bigint,total bigint)
language plpgsql security definer stable set search_path = public as $$
begin
  perform public.plateforme_exiger_permission('consulter_support');
  return query
  select e.id,e.nom,
    (select sm.contenu from public.support_messages sm where sm.entreprise_id=e.id order by sm.created_at desc limit 1),
    (select sm.cote from public.support_messages sm where sm.entreprise_id=e.id order by sm.created_at desc limit 1),
    (select max(sm.created_at) from public.support_messages sm where sm.entreprise_id=e.id),
    (select count(*) from public.support_messages sm where sm.entreprise_id=e.id and sm.cote='entreprise' and not sm.lu_par_plateforme),
    (select count(*) from public.support_messages sm where sm.entreprise_id=e.id)
  from public.entreprises e
  where exists(select 1 from public.support_messages sm where sm.entreprise_id=e.id)
  order by (select max(sm.created_at) from public.support_messages sm where sm.entreprise_id=e.id) desc;
end;
$$;

drop function if exists public.plateforme_support_messages(uuid);
create function public.plateforme_support_messages(p_entreprise_id uuid)
returns table(id uuid,cote text,auteur_nom text,contenu text,created_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  perform public.plateforme_exiger_permission('consulter_support');
  update public.support_messages set lu_par_plateforme=true
  where entreprise_id=p_entreprise_id and cote='entreprise' and not lu_par_plateforme;
  return query select m.id,m.cote,m.auteur_nom,m.contenu,m.created_at
  from public.support_messages m where m.entreprise_id=p_entreprise_id order by m.created_at;
end;
$$;

create or replace function public.plateforme_support_repondre(p_entreprise_id uuid,p_contenu text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.plateforme_exiger_permission('repondre_support');
  if length(btrim(coalesce(p_contenu,'')))=0 then raise exception 'Message vide'; end if;
  insert into public.support_messages(entreprise_id,cote,auteur_id,auteur_nom,contenu,lu_par_plateforme)
  values(p_entreprise_id,'plateforme',auth.uid(),coalesce(auth.email(),'Support plateforme'),btrim(p_contenu),true);
end;
$$;

create or replace function public.plateforme_verifier_et_journaliser_reinitialisation(
  p_entreprise_id uuid,p_email text,p_motif text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_utilisateur_id uuid;v_id uuid;
begin
  perform public.plateforme_exiger_permission('reinitialiser_compte');
  if length(btrim(coalesce(p_motif,'')))<5 then raise exception 'Indiquez un motif d''au moins 5 caractères';end if;
  select u.id into v_utilisateur_id
  from auth.users au join public.utilisateurs u on u.id=au.id
  join public.utilisateurs_entreprises ue on ue.utilisateur_id=u.id and ue.entreprise_id=p_entreprise_id
  where lower(au.email)=lower(btrim(p_email));
  if v_utilisateur_id is null then raise exception 'Aucun compte avec cette adresse dans cette entreprise';end if;
  insert into public.plateforme_reinitialisations_mot_de_passe(entreprise_id,utilisateur_id,email,motif,demande_par)
  values(p_entreprise_id,v_utilisateur_id,lower(btrim(p_email)),btrim(p_motif),coalesce(auth.email(),'inconnu'))
  returning id into v_id;
  return v_id;
end;
$$;

-- Facturation : lecture et mutations réservées à facturation/total.
create or replace function public.plateforme_snapshot_facturation(
  p_mois date default date_trunc('month',current_date)::date
) returns integer language plpgsql security definer set search_path=public as $$
declare v_nb integer;
begin
  perform public.plateforme_exiger_permission('gerer_facturation');
  if p_mois<>date_trunc('month',p_mois)::date then raise exception 'Le mois doit commencer le premier jour';end if;
  insert into public.facturation_comptes_mensuelle(
    entreprise_id,employe_id,poste_id,mois,statut_compte,libelle_poste,code_offre,montant_ht,motif,
    nb_appareils_mois,depassement_appareils_facture,montant_depassement_appareils_ht
  )
  select e.entreprise_id,e.id,e.poste_id,p_mois,e.compte_application_statut,p.nom,p.code_offre,
    coalesce(p.tarif_compte_mensuel,0),'snapshot_mensuel',coalesce(a.nb_appareils,0),coalesce(a.nb_appareils,0)>2,
    case when coalesce(a.nb_appareils,0)>2 then coalesce(p.tarif_compte_mensuel,0) else 0 end
  from public.employes e left join public.postes p on p.id=e.poste_id
  left join lateral(
    select count(*)::integer nb_appareils from public.appareils_comptes ac
    where ac.entreprise_id=e.entreprise_id and ac.utilisateur_id=e.utilisateur_id
      and ac.premiere_activite_at<(p_mois+interval '1 month')
      and(ac.revoque_at is null or ac.revoque_at>=p_mois::timestamptz)
  )a on true
  where e.utilisateur_id is not null and e.compte_application_statut in('actif','pause','ferme')
    and coalesce(e.compte_application_ouvert_at,e.created_at)<(p_mois+interval '1 month')
    and(e.compte_application_ferme_at is null or e.compte_application_ferme_at>=p_mois::timestamptz)
  on conflict(entreprise_id,employe_id,mois) do update set
    nb_appareils_mois=greatest(facturation_comptes_mensuelle.nb_appareils_mois,excluded.nb_appareils_mois),
    depassement_appareils_facture=facturation_comptes_mensuelle.depassement_appareils_facture or excluded.depassement_appareils_facture,
    montant_depassement_appareils_ht=greatest(facturation_comptes_mensuelle.montant_depassement_appareils_ht,excluded.montant_depassement_appareils_ht);
  get diagnostics v_nb=row_count;
  perform public.plateforme_journaliser('snapshot_facturation','mois',p_mois::text,jsonb_build_object('lignes',v_nb));
  return v_nb;
end;
$$;

create or replace function public.plateforme_releve_facturation(p_mois date)
returns table(entreprise_id uuid,entreprise_nom text,mois date,nombre_comptes bigint,montant_ht numeric,detail jsonb)
language plpgsql security definer stable set search_path=public as $$
begin
  perform public.plateforme_exiger_permission('consulter_facturation');
  if p_mois<>date_trunc('month',p_mois)::date then raise exception 'Le mois doit commencer le premier jour';end if;
  return query select e.id,e.nom,p_mois,
    coalesce(sum(case when f.id is null then 0 else 1+case when f.depassement_appareils_facture then 1 else 0 end end),0)::bigint,
    coalesce(sum(f.montant_ht+f.montant_depassement_appareils_ht),0),
    coalesce(jsonb_agg(jsonb_build_object(
      'employe_id',f.employe_id,'employe',concat_ws(' ',em.prenom,em.nom),'poste',f.libelle_poste,
      'offre',f.code_offre,'statut',f.statut_compte,'montant_compte_ht',f.montant_ht,
      'nb_appareils',f.nb_appareils_mois,'depassement_appareils',f.depassement_appareils_facture,
      'montant_depassement_ht',f.montant_depassement_appareils_ht,
      'montant_ht',f.montant_ht+f.montant_depassement_appareils_ht,'motif',f.motif
    ) order by em.nom,em.prenom) filter(where f.id is not null),'[]'::jsonb)
  from public.entreprises e
  left join public.facturation_comptes_mensuelle f on f.entreprise_id=e.id and f.mois=p_mois
  left join public.employes em on em.id=f.employe_id
  group by e.id,e.nom order by e.nom;
end;
$$;

create or replace function public.plateforme_appliquer_remise(p_entreprise_id uuid,p_coupon_id text,p_description text)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.plateforme_exiger_permission('gerer_remises');
  update public.entreprises set remise_stripe_coupon_id=p_coupon_id,remise_description=p_description,
    remise_appliquee_at=now(),updated_at=now() where id=p_entreprise_id;
  perform public.plateforme_journaliser('remise_appliquee','entreprise',p_entreprise_id::text,jsonb_build_object('description',p_description));
end;
$$;

create or replace function public.plateforme_retirer_remise(p_entreprise_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.plateforme_exiger_permission('gerer_remises');
  update public.entreprises set remise_stripe_coupon_id=null,remise_description=null,
    remise_appliquee_at=null,updated_at=now() where id=p_entreprise_id;
  perform public.plateforme_journaliser('remise_retiree','entreprise',p_entreprise_id::text);
end;
$$;

create or replace function public.plateforme_modifier_abonnement(
  p_entreprise_id uuid,p_statut text,p_echeance date,p_note text
) returns void
language plpgsql security definer set search_path=public as $$
begin
  perform public.plateforme_exiger_permission('gerer_facturation');
  if p_statut not in('essai','actif','suspendu','annule') then raise exception 'Statut invalide';end if;
  update public.entreprises set abonnement_statut=p_statut,abonnement_echeance=p_echeance,
    abonnement_note=p_note,
    impaye_signale_at=case when p_statut='actif' then null else impaye_signale_at end,
    suspension_prevue_at=case when p_statut='actif' then null else suspension_prevue_at end,
    impaye_message=case when p_statut='actif' then null else impaye_message end,
    updated_at=now() where id=p_entreprise_id;
  if not found then raise exception 'Entreprise introuvable';end if;
  perform public.plateforme_journaliser('abonnement_modifie','entreprise',p_entreprise_id::text,jsonb_build_object('statut',p_statut,'echeance',p_echeance));
end;
$$;

create or replace function public.plateforme_modifier_tarif_poste(p_poste_id uuid,p_code_offre text,p_tarif numeric)
returns void language plpgsql security definer set search_path=public as $$
declare v_entreprise_id uuid;
begin
  perform public.plateforme_exiger_permission('gerer_facturation');
  if p_tarif is null or p_tarif<0 then raise exception 'Tarif invalide';end if;
  update public.postes set code_offre=coalesce(nullif(btrim(p_code_offre),''),'standard'),
    tarif_compte_mensuel=round(p_tarif,2) where id=p_poste_id returning entreprise_id into v_entreprise_id;
  if not found then raise exception 'Poste introuvable';end if;
  perform public.plateforme_journaliser('type_compte_poste_modifie','poste',p_poste_id::text,jsonb_build_object('entreprise_id',v_entreprise_id,'code_offre',p_code_offre,'tarif',p_tarif));
end;
$$;

create or replace function public.plateforme_signaler_impaye(p_entreprise_id uuid,p_message text default null)
returns timestamptz language plpgsql security definer set search_path=public as $$
declare v_echeance timestamptz:=now()+interval '10 days';
begin
  perform public.plateforme_exiger_permission('gerer_facturation');
  update public.entreprises set impaye_signale_at=now(),suspension_prevue_at=v_echeance,
    impaye_message=coalesce(nullif(btrim(p_message),''),'Règlement non reçu'),
    abonnement_note=coalesce(nullif(btrim(p_message),''),abonnement_note),updated_at=now()
  where id=p_entreprise_id and abonnement_statut<>'annule';
  if not found then raise exception 'Entreprise introuvable ou abonnement annulé';end if;
  perform public.plateforme_journaliser('impaye_signale','entreprise',p_entreprise_id::text,jsonb_build_object('suspension_prevue_at',v_echeance));
  return v_echeance;
end;
$$;

create or replace function public.plateforme_enregistrer_reglement(p_entreprise_id uuid,p_note text default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  perform public.plateforme_exiger_permission('gerer_facturation');
  update public.entreprises set abonnement_statut=case when abonnement_statut='suspendu' then 'actif' else abonnement_statut end,
    impaye_signale_at=null,suspension_prevue_at=null,impaye_message=null,dernier_reglement_at=now(),
    abonnement_note=coalesce(nullif(btrim(p_note),''),abonnement_note),updated_at=now()
  where id=p_entreprise_id;
  if not found then raise exception 'Entreprise introuvable';end if;
  perform public.plateforme_journaliser('reglement_enregistre','entreprise',p_entreprise_id::text);
end;
$$;

create or replace function public.plateforme_creer_entreprise(p_nom text,p_siret text default null,p_ville text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_modele record;
begin
  perform public.plateforme_exiger_permission('creer_entreprise');
  if nullif(btrim(p_nom),'') is null then raise exception 'Nom obligatoire';end if;
  insert into public.entreprises(nom,raison_sociale,siret,ville,abonnement_statut,abonnement_note)
  values(btrim(p_nom),btrim(p_nom),nullif(btrim(p_siret),''),nullif(btrim(p_ville),''),'essai','Créée par la plateforme') returning id into v_id;
  for v_modele in select cle from public.modeles_roles_predefinis order by ordre loop
    perform public.appliquer_modele_role_predefini_interne(v_id,v_modele.cle,true);
  end loop;
  perform public.plateforme_journaliser('entreprise_creee','entreprise',v_id::text);
  return v_id;
end;
$$;

create or replace function public.plateforme_postes_tarifs()
returns table(entreprise_id uuid,poste_id uuid,nom text,code_offre text,tarif_compte_mensuel numeric,nb_comptes_facturables bigint)
language plpgsql security definer stable set search_path=public as $$
begin
  perform public.plateforme_exiger_permission('consulter_facturation');
  return query select p.entreprise_id,p.id,p.nom,p.code_offre,p.tarif_compte_mensuel,
    (select count(*) from public.employes e where e.poste_id=p.id and e.compte_application_statut in('actif','pause'))
  from public.postes p order by p.entreprise_id,p.nom;
end;
$$;

-- Cette RPC historique contient des indicateurs d'usage et une estimation de
-- facturation. Elle ne doit pas hériter du simple statut « membre plateforme ».
create or replace function public.plateforme_usage_entreprises()
returns table(
  entreprise_id uuid,nb_fiches_employes bigint,nb_comptes_actives bigint,
  nb_comptes_pause bigint,nb_comptes_facturables bigint,
  nb_invitations_envoyees bigint,nb_applications_installees bigint,
  nb_connectes_30j bigint,derniere_connexion timestamptz,options_actives text[],
  estimation_mensuelle_ht numeric,detail_comptes jsonb
)
language plpgsql security definer stable set search_path=public as $$
begin
  perform public.plateforme_exiger_permission('consulter_facturation');
  return query select e.id,
    (select count(*) from public.employes em where em.entreprise_id=e.id and em.statut<>'sorti'),
    (select count(*) from public.employes em where em.entreprise_id=e.id and em.compte_application_statut='actif'),
    (select count(*) from public.employes em where em.entreprise_id=e.id and em.compte_application_statut='pause'),
    (select count(*) from public.employes em where em.entreprise_id=e.id and em.compte_application_statut in('actif','pause')),
    (select count(*) from public.employes em where em.entreprise_id=e.id and em.invitation_envoyee_at is not null),
    (select count(*) from public.employes em where em.entreprise_id=e.id and em.application_installee_at is not null),
    (select count(*) from public.employes em where em.entreprise_id=e.id and em.derniere_connexion_at>=now()-interval '30 days'),
    (select max(em.derniere_connexion_at) from public.employes em where em.entreprise_id=e.id),
    coalesce((select array_agg(distinct replace(pp.cle_permission,'acces_','') order by replace(pp.cle_permission,'acces_',''))
      from public.permissions_poste pp where pp.entreprise_id=e.id and pp.autorise and pp.cle_permission like 'acces_%'),array[]::text[]),
    coalesce((select sum(p.tarif_compte_mensuel) from public.employes em left join public.postes p on p.id=em.poste_id
      where em.entreprise_id=e.id and em.compte_application_statut in('actif','pause')),0),
    coalesce((select jsonb_agg(x order by x->>'poste') from(
      select jsonb_build_object(
        'poste',coalesce(p.nom,'Sans poste'),'comptes',count(*),
        'tarif_unitaire',coalesce(p.tarif_compte_mensuel,0),
        'total',count(*)*coalesce(p.tarif_compte_mensuel,0)
      ) x
      from public.employes em left join public.postes p on p.id=em.poste_id
      where em.entreprise_id=e.id and em.compte_application_statut in('actif','pause')
      group by p.nom,p.tarif_compte_mensuel
    ) s),'[]'::jsonb)
  from public.entreprises e;
end;
$$;

create or replace function public.plateforme_besoins()
returns table(entreprise_id uuid,nb_employes integer,besoins text[],attentes text[],commentaire text,offre_recommandee text,created_at timestamptz)
language plpgsql security definer stable set search_path=public as $$
begin
  perform public.plateforme_exiger_permission('consulter_facturation');
  return query select eb.entreprise_id,eb.nb_employes,eb.besoins,eb.attentes,eb.commentaire,eb.offre_recommandee,eb.created_at
  from public.entreprise_besoins eb;
end;
$$;

drop function if exists public.plateforme_usage_appareils();
create function public.plateforme_usage_appareils()
returns table(entreprise_id uuid,nb_appareils_actifs bigint,nb_comptes_plus_de_deux bigint,maximum_appareils_compte bigint,montant_depassements_ht numeric)
language plpgsql security definer stable set search_path=public as $$
begin
  perform public.plateforme_exiger_permission('consulter_facturation');
  return query with par_compte as(
    select a.entreprise_id,a.utilisateur_id,count(*)::bigint nombre,coalesce(max(p.tarif_compte_mensuel),0)::numeric tarif
    from public.appareils_comptes a
    left join public.employes em on em.entreprise_id=a.entreprise_id and em.utilisateur_id=a.utilisateur_id and em.compte_application_statut in('actif','pause')
    left join public.postes p on p.id=em.poste_id where a.revoque_at is null group by a.entreprise_id,a.utilisateur_id
  ) select e.id,
    coalesce((select sum(pc.nombre) from par_compte pc where pc.entreprise_id=e.id),0)::bigint,
    coalesce((select count(*) from par_compte pc where pc.entreprise_id=e.id and pc.nombre>2),0)::bigint,
    coalesce((select max(pc.nombre) from par_compte pc where pc.entreprise_id=e.id),0)::bigint,
    coalesce((select sum(pc.tarif) from par_compte pc where pc.entreprise_id=e.id and pc.nombre>2),0)::numeric
  from public.entreprises e;
end;
$$;

create or replace function public.utilisation_stockage_entreprise(p_entreprise_id uuid)
returns table(octets_utilises bigint,fichiers bigint)
language plpgsql security definer stable set search_path=public,storage as $$
begin
  if coalesce(auth.role(),'')<>'service_role'
    and not public.est_membre_actif(p_entreprise_id)
    and not public.plateforme_a_permission('consulter_facturation') then
    raise exception 'Accès refusé au relevé de stockage' using errcode='42501';
  end if;
  return query select coalesce(sum(case when o.metadata->>'size'~'^[0-9]+$' then(o.metadata->>'size')::bigint else 0 end),0)::bigint,count(*)::bigint
  from storage.objects o where o.bucket_id=any(array['chantier-documents','entreprise-assets','documents-employes','notes-frais','factures-fournisseurs','fiches-techniques','bulletins-paie','pointage-preuves','notes-frais-exports']::text[])
    and split_part(o.name,'/',1)=p_entreprise_id::text;
end;
$$;

-- Les rôles de démonstration exposent la structure détaillée d'un tenant.
drop function if exists public.plateforme_roles_entreprise(uuid);
create function public.plateforme_roles_entreprise(p_entreprise_id uuid)
returns table(poste_id uuid,poste_nom text,permissions text[],nb_employes bigint)
language plpgsql security definer stable set search_path=public as $$
begin
  perform public.plateforme_exiger_permission('intervenir_tenant');
  return query select p.id,p.nom,
    coalesce((select array_agg(pp.cle_permission order by pp.cle_permission) from public.permissions_poste pp where pp.poste_id=p.id and pp.entreprise_id=p_entreprise_id and pp.autorise),array[]::text[]),
    (select count(*) from public.employes e where e.poste_id=p.id and e.entreprise_id=p_entreprise_id and e.statut not in('sorti','suspendu'))
  from public.postes p where p.entreprise_id=p_entreprise_id order by p.nom;
end;
$$;

-- RLS plateforme : les tables financières ne sont pas ouvertes à tous les rôles.
drop policy if exists abonnement_evenements_admin_select on public.abonnement_evenements;
create policy abonnement_evenements_admin_select on public.abonnement_evenements
  for select to authenticated using(public.plateforme_a_permission('consulter_facturation'));

drop policy if exists abonnement_stockage_releves_lecture on public.abonnement_stockage_releves;
create policy abonnement_stockage_releves_lecture on public.abonnement_stockage_releves
  for select to authenticated using(
    public.est_membre_actif(entreprise_id) or public.plateforme_a_permission('consulter_facturation')
  );

drop policy if exists "abonnement entreprise lecture gestion" on public.abonnements_entreprises;
create policy "abonnement entreprise lecture gestion" on public.abonnements_entreprises for select using(
  (public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id,'gerer_parametres'))
  or public.plateforme_a_permission('consulter_facturation')
);
drop policy if exists "options entreprise lecture gestion" on public.options_abonnement_entreprises;
create policy "options entreprise lecture gestion" on public.options_abonnement_entreprises for select using(
  (public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id,'gerer_parametres'))
  or public.plateforme_a_permission('consulter_facturation')
);
drop policy if exists "factures abonnement lecture gestion" on public.factures_abonnement;
create policy "factures abonnement lecture gestion" on public.factures_abonnement for select using(
  (public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id,'gerer_parametres'))
  or public.plateforme_a_permission('consulter_facturation')
);
drop policy if exists "historique tarif lecture plateforme" on public.historique_tarification;
create policy "historique tarif lecture plateforme" on public.historique_tarification for select using(
  public.plateforme_a_permission('consulter_tarification') or
  (entreprise_id is not null and public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id,'gerer_parametres'))
);

drop policy if exists "plans lecture publique" on public.plans_abonnement;
create policy "plans lecture publique" on public.plans_abonnement for select using(
  actif or public.plateforme_a_permission('consulter_tarification')
);
drop policy if exists "options lecture publique" on public.catalogue_options_abonnement;
create policy "options lecture publique" on public.catalogue_options_abonnement for select using(
  actif or public.plateforme_a_permission('consulter_tarification')
);
drop policy if exists "services lecture publique" on public.catalogue_services_mise_en_service;
create policy "services lecture publique" on public.catalogue_services_mise_en_service for select using(
  actif or public.plateforme_a_permission('consulter_tarification')
);

drop policy if exists boutique_produits_lecture on public.boutique_produits;
create policy boutique_produits_lecture on public.boutique_produits for select to authenticated
  using(actif or public.plateforme_a_permission('gerer_boutique'));
drop policy if exists boutique_produits_gestion on public.boutique_produits;
create policy boutique_produits_gestion on public.boutique_produits for all to authenticated
  using(public.plateforme_a_permission('gerer_boutique'))
  with check(public.plateforme_a_permission('gerer_boutique'));

drop policy if exists boutique_commandes_lecture on public.boutique_commandes;
create policy boutique_commandes_lecture on public.boutique_commandes for select to authenticated
  using(public.est_membre_actif(entreprise_id) or public.plateforme_a_permission('consulter_facturation'));
drop policy if exists boutique_lignes_lecture on public.boutique_lignes_commande;
create policy boutique_lignes_lecture on public.boutique_lignes_commande for select to authenticated using(exists(
  select 1 from public.boutique_commandes c where c.id=commande_id and(
    public.est_membre_actif(c.entreprise_id) or public.plateforme_a_permission('consulter_facturation')
  )
));

drop policy if exists feature_flags_select on public.entreprise_feature_flags;
create policy feature_flags_select on public.entreprise_feature_flags for select to authenticated
  using(public.est_membre_actif(entreprise_id) or public.plateforme_a_permission('intervenir_tenant'));
drop policy if exists feature_flags_manage on public.entreprise_feature_flags;
create policy feature_flags_manage on public.entreprise_feature_flags for all to authenticated
  using(public.plateforme_a_permission('intervenir_tenant') or(public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id,'gerer_parametres')))
  with check(public.plateforme_a_permission('intervenir_tenant') or(public.est_membre_actif(entreprise_id) and public.a_permission(entreprise_id,'gerer_parametres')));

drop policy if exists plateforme_reinit_mdp_lecture on public.plateforme_reinitialisations_mot_de_passe;
create policy plateforme_reinit_mdp_lecture on public.plateforme_reinitialisations_mot_de_passe
  for select to authenticated using(public.plateforme_a_permission('reinitialiser_compte'));

-- La gestion du catalogue tarifaire est total uniquement. La lecture reste
-- disponible selon les politiques de consultation existantes.
create or replace function public.plateforme_creer_version_tarif(
  p_code text,p_nom text,p_prix_mensuel_ht numeric,p_prix_annuel_ht numeric,
  p_utilisateurs_inclus integer,p_administrateurs_inclus integer,
  p_operations_ia_incluses integer,p_stockage_go_inclus numeric,
  p_valide_du date,p_motif text
) returns uuid
language plpgsql security definer set search_path=public as $$
declare v_precedent plans_abonnement%rowtype;v_id uuid;v_version integer;
begin
  perform public.plateforme_exiger_permission('gerer_tarification');
  if p_code not in('mini','pro','business','entreprise','sur_mesure') then raise exception 'Code offre invalide';end if;
  if p_code='sur_mesure' and(p_prix_mensuel_ht is not null or p_prix_annuel_ht is not null) then raise exception 'L offre Sur mesure ne doit pas avoir de prix public';end if;
  if p_code<>'sur_mesure' and(p_prix_mensuel_ht is null or p_prix_annuel_ht is null or p_prix_mensuel_ht<0 or p_prix_annuel_ht<0) then raise exception 'Prix public invalide';end if;
  select * into v_precedent from public.plans_abonnement where code=p_code and actif order by version desc limit 1 for update;
  select coalesce(max(version),0)+1 into v_version from public.plans_abonnement where code=p_code;
  update public.plans_abonnement set actif=false,valide_au=p_valide_du-1 where code=p_code and actif;
  insert into public.plans_abonnement(code,version,nom,prix_mensuel_ht,prix_annuel_ht,utilisateurs_inclus,
    administrateurs_inclus,operations_ia_incluses,stockage_go_inclus,fonctionnalites,actif,devis_obligatoire,valide_du,created_by)
  values(p_code,v_version,p_nom,p_prix_mensuel_ht,p_prix_annuel_ht,p_utilisateurs_inclus,p_administrateurs_inclus,
    p_operations_ia_incluses,p_stockage_go_inclus,coalesce(v_precedent.fonctionnalites,'[]'::jsonb),true,p_code='sur_mesure',p_valide_du,auth.uid())
  returning id into v_id;
  insert into public.historique_tarification(utilisateur_id,action,ancien,nouveau,motif)
  values(auth.uid(),'nouvelle_version_tarifaire',to_jsonb(v_precedent),jsonb_build_object('plan_id',v_id,'code',p_code,'version',v_version),p_motif);
  return v_id;
end;
$$;

-- Droits d'exécution des RPC remplacées.
revoke all on function public.est_acces_support_actif(uuid) from public, anon;
revoke all on function public.plateforme_entrer_entreprise(uuid,text) from public, anon;
revoke all on function public.plateforme_support_fils() from public, anon;
revoke all on function public.plateforme_support_messages(uuid) from public, anon;
revoke all on function public.plateforme_support_repondre(uuid,text) from public, anon;
revoke all on function public.plateforme_verifier_et_journaliser_reinitialisation(uuid,text,text) from public, anon;
revoke all on function public.plateforme_snapshot_facturation(date) from public, anon;
revoke all on function public.plateforme_releve_facturation(date) from public, anon;
revoke all on function public.plateforme_appliquer_remise(uuid,text,text) from public, anon;
revoke all on function public.plateforme_retirer_remise(uuid) from public, anon;
revoke all on function public.plateforme_roles_entreprise(uuid) from public, anon;
revoke all on function public.plateforme_creer_version_tarif(text,text,numeric,numeric,integer,integer,integer,numeric,date,text) from public, anon;
revoke all on function public.plateforme_usage_appareils() from public, anon, authenticated;
revoke all on function public.plateforme_usage_entreprises() from public, anon, authenticated;

grant execute on function public.est_acces_support_actif(uuid) to authenticated;
grant execute on function public.plateforme_entrer_entreprise(uuid,text) to authenticated;
grant execute on function public.plateforme_support_fils() to authenticated;
grant execute on function public.plateforme_support_messages(uuid) to authenticated;
grant execute on function public.plateforme_support_repondre(uuid,text) to authenticated;
grant execute on function public.plateforme_verifier_et_journaliser_reinitialisation(uuid,text,text) to authenticated;
grant execute on function public.plateforme_snapshot_facturation(date) to authenticated;
grant execute on function public.plateforme_releve_facturation(date) to authenticated;
grant execute on function public.plateforme_appliquer_remise(uuid,text,text) to authenticated;
grant execute on function public.plateforme_retirer_remise(uuid) to authenticated;
grant execute on function public.plateforme_roles_entreprise(uuid) to authenticated;
grant execute on function public.plateforme_creer_version_tarif(text,text,numeric,numeric,integer,integer,integer,numeric,date,text) to authenticated;
grant execute on function public.plateforme_usage_appareils() to authenticated;
grant execute on function public.plateforme_usage_entreprises() to authenticated;

notify pgrst,'reload schema';
