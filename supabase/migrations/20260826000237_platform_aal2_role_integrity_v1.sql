-- Impose AAL2 aux mutations plateforme sensibles, applique la matrice de rôles
-- et verrouille le cycle de vie des identités administrateur.

-- Source de confiance unique : le claim `aal` du JWT vérifié par Supabase/PostgREST.
-- Aucun paramètre client, header libre, email ou metadata utilisateur n'est consulté.
create or replace function public.plateforme_exiger_session_aal2()
returns void
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if auth.uid() is null or coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Authentification forte AAL2 requise';
  end if;
end;
$$;
revoke all on function public.plateforme_exiger_session_aal2() from public, anon, authenticated;
-- Toutes les mutations du cycle administrateur partagent ce verrou transactionnel.
-- Les deux clés sont des constantes réservées au domaine ELSATIA/administrateurs.
create or replace function public.plateforme_verrouiller_mutations_admin()
returns void
language sql
security definer
volatile
set search_path = public
as $$
  select pg_advisory_xact_lock(21453, 1001);
$$;
revoke all on function public.plateforme_verrouiller_mutations_admin() from public, anon, authenticated;
alter table public.plateforme_admins
  add column if not exists revocation_origine text,
  add column if not exists role_updated_at timestamptz,
  add column if not exists role_updated_by uuid references auth.users(id) on delete set null;
-- Les identités déjà classées révoquées par la migration 236 sont des reprises
-- techniques : elles reçoivent une date, sans inventer d'auteur humain.
update public.plateforme_admins
set revocation_at = coalesce(revocation_at, updated_at, created_at, now()),
    revocation_origine = case
      when revocation_par is not null then 'utilisateur'
      else 'migration_technique'
    end,
    updated_at = now()
where statut_identite = 'revoquee';
update public.plateforme_admins
set revocation_origine = null
where statut_identite <> 'revoquee';
alter table public.plateforme_admins
  drop constraint if exists plateforme_admins_statut_coherent_check;
alter table public.plateforme_admins
  add constraint plateforme_admins_statut_coherent_check
  check (
    (
      statut_identite = 'en_attente'
      and utilisateur_id is null
      and not actif
      and activation_at is null
      and revocation_at is null
      and revocation_par is null
      and revocation_origine is null
    )
    or (
      statut_identite = 'rattachee_non_confirmee'
      and utilisateur_id is not null
      and not actif
      and activation_at is null
      and revocation_at is null
      and revocation_par is null
      and revocation_origine is null
    )
    or (
      statut_identite = 'active'
      and utilisateur_id is not null
      and actif
      and activation_at is not null
      and revocation_at is null
      and revocation_par is null
      and revocation_origine is null
    )
    or (
      statut_identite = 'revoquee'
      and not actif
      and revocation_at is not null
      and revocation_origine in ('utilisateur', 'migration_technique')
      and (
        (revocation_origine = 'utilisateur' and revocation_par is not null)
        or (revocation_origine = 'migration_technique' and revocation_par is null)
      )
    )
  );
-- L'email déclaré est immuable. Une identité active garde son UID jusqu'à sa
-- révocation. Les retours d'état contournant le cycle officiel sont refusés.
create or replace function public.plateforme_verifier_transition_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    raise exception 'Email d''identité administrateur immuable';
  end if;

  if old.statut_identite = 'active'
     and new.utilisateur_id is distinct from old.utilisateur_id then
    raise exception 'Révoquez puis détachez l''identité avant de modifier son UID';
  end if;

  if old.statut_identite = 'en_attente'
     and new.statut_identite not in ('en_attente', 'rattachee_non_confirmee', 'revoquee') then
    raise exception 'Transition d''identité administrateur interdite';
  elsif old.statut_identite = 'rattachee_non_confirmee'
     and new.statut_identite not in ('rattachee_non_confirmee', 'active', 'revoquee') then
    raise exception 'Transition d''identité administrateur interdite';
  elsif old.statut_identite = 'active'
     and new.statut_identite not in ('active', 'revoquee') then
    raise exception 'Transition d''identité administrateur interdite';
  elsif old.statut_identite = 'revoquee'
     and new.statut_identite not in ('revoquee', 'rattachee_non_confirmee') then
    raise exception 'Une identité révoquée doit être rattachée puis réactivée';
  end if;

  return new;
end;
$$;
drop trigger if exists plateforme_admins_transition_integre on public.plateforme_admins;
create trigger plateforme_admins_transition_integre
before update on public.plateforme_admins
for each row execute function public.plateforme_verifier_transition_admin();
revoke all on function public.plateforme_verifier_transition_admin() from public, anon, authenticated;
-- Ajout ou mise à jour d'une identité non active uniquement. Le changement de rôle
-- d'une identité rattachée/active passe par la RPC dédiée ci-dessous.
create or replace function public.plateforme_ajouter_admin(
  p_email text,
  p_nom text default null,
  p_role text default 'total'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_etat text;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  perform public.plateforme_verrouiller_mutations_admin();
  perform public.plateforme_exiger_role('total');

  if v_email = '' or position('@' in v_email) = 0 then raise exception 'Email invalide'; end if;
  if p_role not in ('total','support','facturation','lecture') then raise exception 'Rôle invalide'; end if;

  select statut_identite into v_etat
  from public.plateforme_admins
  where email = v_email
  for update;

  if found then
    if v_etat not in ('en_attente', 'revoquee') then
      raise exception 'Identité déjà rattachée : utilisez la modification de rôle dédiée';
    end if;
    update public.plateforme_admins
    set role = p_role,
        nom = coalesce(nullif(trim(coalesce(p_nom,'')),''), nom),
        role_updated_at = now(),
        role_updated_by = auth.uid(),
        updated_at = now()
    where email = v_email;
  else
    insert into public.plateforme_admins(
      email, role, nom, ajoute_par, utilisateur_id, actif, statut_identite,
      role_updated_at, role_updated_by, updated_at
    ) values (
      v_email, p_role, nullif(trim(coalesce(p_nom,'')),''), auth.email(),
      null, false, 'en_attente', now(), auth.uid(), now()
    );
  end if;
end;
$$;
create or replace function public.plateforme_modifier_role_admin(
  p_email text,
  p_role text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_utilisateur_id uuid;
  v_role_actuel text;
  v_etat text;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  perform public.plateforme_verrouiller_mutations_admin();
  perform public.plateforme_exiger_role('total');

  if p_role not in ('total','support','facturation','lecture') then raise exception 'Rôle invalide'; end if;
  select utilisateur_id, role, statut_identite
  into v_utilisateur_id, v_role_actuel, v_etat
  from public.plateforme_admins
  where email = v_email
  for update;
  if not found then raise exception 'Administrateur introuvable'; end if;
  if v_utilisateur_id = auth.uid() then raise exception 'Auto-modification de rôle interdite'; end if;

  if v_etat = 'active' and v_role_actuel = 'total' and p_role <> 'total'
     and (select count(*) from public.plateforme_admins
          where role = 'total' and actif and statut_identite = 'active') <= 1 then
    raise exception 'Impossible de retirer le rôle du dernier administrateur total actif';
  end if;

  update public.plateforme_admins
  set role = p_role,
      role_updated_at = now(),
      role_updated_by = auth.uid(),
      updated_at = now()
  where email = v_email;
end;
$$;
create or replace function public.plateforme_rattacher_admin(
  p_email text,
  p_utilisateur_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_auth_email text;
  v_email_confirme timestamptz;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  perform public.plateforme_verrouiller_mutations_admin();
  perform public.plateforme_exiger_role('total');

  if p_utilisateur_id is null or p_utilisateur_id = auth.uid() then
    raise exception 'Auto-rattachement interdit';
  end if;
  select lower(email), email_confirmed_at
  into v_auth_email, v_email_confirme
  from auth.users where id = p_utilisateur_id;
  if v_auth_email is null or v_auth_email <> v_email or v_email_confirme is null then
    raise exception 'Compte Auth absent, différent ou email non vérifié';
  end if;

  update public.plateforme_admins
  set utilisateur_id = p_utilisateur_id,
      actif = false,
      statut_identite = 'rattachee_non_confirmee',
      activation_at = null,
      activation_par = null,
      revocation_at = null,
      revocation_par = null,
      revocation_origine = null,
      updated_at = now()
  where email = v_email and statut_identite in ('en_attente','revoquee');
  if not found then raise exception 'Identité administrateur absente ou état incompatible'; end if;
end;
$$;
create or replace function public.plateforme_activer_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_utilisateur_id uuid;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  perform public.plateforme_verrouiller_mutations_admin();
  perform public.plateforme_exiger_role('total');

  select utilisateur_id into v_utilisateur_id
  from public.plateforme_admins
  where email = v_email and statut_identite = 'rattachee_non_confirmee'
  for update;
  if v_utilisateur_id is null then raise exception 'Identité non rattachée'; end if;
  if v_utilisateur_id = auth.uid() then raise exception 'Auto-activation interdite'; end if;
  if not exists(
    select 1 from auth.users
    where id = v_utilisateur_id
      and lower(email) = v_email
      and email_confirmed_at is not null
  ) then raise exception 'Compte Auth différent ou email non vérifié'; end if;

  -- Politique distincte de l'AAL2 appelant : la cible doit aussi avoir configuré
  -- au moins un facteur MFA vérifié avant son activation.
  if not exists(
    select 1 from auth.mfa_factors
    where user_id = v_utilisateur_id and status = 'verified'
  ) then raise exception 'MFA du compte cible requis'; end if;

  update public.plateforme_admins
  set actif = true,
      statut_identite = 'active',
      activation_at = now(),
      activation_par = auth.uid(),
      revocation_at = null,
      revocation_par = null,
      revocation_origine = null,
      updated_at = now()
  where email = v_email;
end;
$$;
create or replace function public.plateforme_retirer_admin(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_utilisateur_id uuid;
  v_role text;
  v_etat text;
begin
  -- Un premier contrôle empêche un appelant non autorisé d'occuper le verrou. Le
  -- second, après l'attente, couvre une révocation concurrente de l'appelant.
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  perform public.plateforme_verrouiller_mutations_admin();
  perform public.plateforme_exiger_role('total');

  select utilisateur_id, role, statut_identite
  into v_utilisateur_id, v_role, v_etat
  from public.plateforme_admins where email = v_email for update;
  if not found then raise exception 'Administrateur introuvable'; end if;
  if v_etat = 'revoquee' then raise exception 'Administrateur déjà révoqué'; end if;
  if v_utilisateur_id = auth.uid() then raise exception 'Vous ne pouvez pas révoquer votre propre compte'; end if;
  if v_role = 'total' and v_etat = 'active' and (
    select count(*) from public.plateforme_admins
    where role = 'total' and actif and statut_identite = 'active'
  ) <= 1 then
    raise exception 'Impossible de révoquer le dernier administrateur total actif';
  end if;

  update public.plateforme_admins
  set actif = false,
      statut_identite = 'revoquee',
      revocation_at = now(),
      revocation_par = auth.uid(),
      revocation_origine = 'utilisateur',
      updated_at = now()
  where email = v_email;

  update public.plateforme_acces_entreprises
  set termine_at = now(), termine_motif = 'Révocation administrateur'
  where plateforme_user_id = v_utilisateur_id and termine_at is null;
end;
$$;
create or replace function public.plateforme_detacher_admin_revoque(p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(p_email));
  v_utilisateur_id uuid;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  perform public.plateforme_verrouiller_mutations_admin();
  perform public.plateforme_exiger_role('total');

  select utilisateur_id into v_utilisateur_id
  from public.plateforme_admins
  where email = v_email and statut_identite = 'revoquee'
  for update;
  if not found then raise exception 'Identité non révoquée'; end if;
  if v_utilisateur_id is null then raise exception 'Identité déjà détachée'; end if;
  if v_utilisateur_id = auth.uid() then raise exception 'Auto-détachement interdit'; end if;
  if exists(
    select 1 from public.plateforme_acces_entreprises
    where plateforme_user_id = v_utilisateur_id and termine_at is null
  ) then raise exception 'Une session support est encore active'; end if;

  update public.plateforme_admins
  set utilisateur_id = null, updated_at = now()
  where email = v_email;
end;
$$;
-- L'ouverture support exige un rôle total/support actif et une session AAL2.
create or replace function public.plateforme_entrer_entreprise(
  p_entreprise_id uuid,
  p_motif text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entreprise_precedente uuid;
  v_session public.plateforme_acces_entreprises;
begin
  perform public.plateforme_exiger_role('total', 'support');
  perform public.plateforme_exiger_session_aal2();

  if length(btrim(coalesce(p_motif, ''))) < 5 then
    raise exception 'Indiquez un motif d''intervention précis';
  end if;
  if not exists(select 1 from public.entreprises where id = p_entreprise_id) then
    raise exception 'Entreprise introuvable';
  end if;

  select * into v_session
  from public.plateforme_acces_entreprises
  where plateforme_user_id = auth.uid() and termine_at is null
  for update;

  if v_session.id is not null then
    v_entreprise_precedente := v_session.entreprise_precedente_id;
    update public.plateforme_acces_entreprises
    set termine_at = now(), termine_motif = 'Changement d''entreprise'
    where id = v_session.id;
  else
    select entreprise_active_id into v_entreprise_precedente
    from public.utilisateurs where id = auth.uid();
  end if;

  insert into public.plateforme_acces_entreprises(
    plateforme_user_id, entreprise_id, entreprise_precedente_id, motif, expire_at
  ) values (
    auth.uid(), p_entreprise_id, v_entreprise_precedente, btrim(p_motif),
    now() + interval '4 hours'
  );
  update public.utilisateurs
  set entreprise_active_id = p_entreprise_id
  where id = auth.uid();
end;
$$;
-- Répondre au support est une action support : AAL2 et session explicite sur la
-- même entreprise sont tous deux requis.
create or replace function public.plateforme_support_repondre(
  p_entreprise_id uuid,
  p_contenu text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.plateforme_exiger_role('total', 'support');
  perform public.plateforme_exiger_session_aal2();
  if not public.est_acces_support_actif(p_entreprise_id) then
    raise exception 'Session support explicite requise';
  end if;
  if length(trim(coalesce(p_contenu, ''))) = 0 then raise exception 'Message vide'; end if;
  insert into public.support_messages(
    entreprise_id, cote, auteur_id, auteur_nom, contenu, lu_par_plateforme
  ) values (
    p_entreprise_id, 'plateforme', auth.uid(),
    coalesce(auth.email(), 'Support plateforme'), trim(p_contenu), true
  );
end;
$$;
-- Le catalogue des fils est une vue support, non une consultation générale.
-- La 202 a défini cette fonction avec non_lus/total en bigint ; le passage à
-- integer change le type des colonnes OUT, ce que CREATE OR REPLACE refuse
-- (ERROR 42P13). On la supprime d'abord, comme le fait déjà la migration 239.
-- Aucun objet dépendant : DROP simple, jamais CASCADE.
drop function if exists public.plateforme_support_fils();
create or replace function public.plateforme_support_fils()
returns table(
  entreprise_id uuid,
  entreprise_nom text,
  dernier_contenu text,
  dernier_cote text,
  dernier_at timestamptz,
  non_lus integer,
  total integer
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  perform public.plateforme_exiger_role('total', 'support');
  perform public.plateforme_exiger_session_aal2();
  return query
  select e.id,e.nom,
    (select m.contenu from public.support_messages m
     where m.entreprise_id=e.id order by m.created_at desc limit 1),
    (select m.cote from public.support_messages m
     where m.entreprise_id=e.id order by m.created_at desc limit 1),
    (select max(m.created_at) from public.support_messages m where m.entreprise_id=e.id),
    (select count(*)::int from public.support_messages m
     where m.entreprise_id=e.id and m.cote='entreprise' and not m.lu_par_plateforme),
    (select count(*)::int from public.support_messages m where m.entreprise_id=e.id)
  from public.entreprises e
  where exists(select 1 from public.support_messages m where m.entreprise_id=e.id)
  order by (select max(m.created_at) from public.support_messages m
            where m.entreprise_id=e.id) desc;
end;
$$;
-- Lire un fil et le marquer comme lu exige une session support sur l'entreprise.
create or replace function public.plateforme_support_messages(p_entreprise_id uuid)
returns table(id uuid,cote text,auteur_nom text,contenu text,created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.plateforme_exiger_role('total', 'support');
  perform public.plateforme_exiger_session_aal2();
  if not public.est_acces_support_actif(p_entreprise_id) then
    raise exception 'Session support explicite requise';
  end if;
  update public.support_messages sm
  set lu_par_plateforme=true
  where sm.entreprise_id=p_entreprise_id
    and sm.cote='entreprise'
    and not sm.lu_par_plateforme;
  return query
  select m.id,m.cote,m.auteur_nom,m.contenu,m.created_at
  from public.support_messages m
  where m.entreprise_id=p_entreprise_id
  order by m.created_at;
end;
$$;
-- Les mutations de facturation restent accessibles aux rôles total/facturation,
-- mais requièrent désormais AAL2. Une session total AAL1 ne doit pas contourner
-- la politique simplement parce qu'une fonction est également ouverte au rôle
-- facturation.
create or replace function public.plateforme_modifier_abonnement(
  p_entreprise_id uuid,
  p_statut text,
  p_echeance date,
  p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
  if p_statut not in ('essai', 'actif', 'suspendu', 'annule') then
    raise exception 'Statut invalide';
  end if;
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
create or replace function public.plateforme_modifier_tarif_poste(
  p_poste_id uuid,
  p_code_offre text,
  p_tarif numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
  if p_tarif is null or p_tarif < 0 then raise exception 'Tarif invalide'; end if;
  update public.postes
  set code_offre = coalesce(nullif(btrim(p_code_offre), ''), 'standard'),
      tarif_compte_mensuel = round(p_tarif, 2)
  where id = p_poste_id;
  if not found then raise exception 'Poste introuvable'; end if;
end;
$$;
create or replace function public.plateforme_signaler_impaye(
  p_entreprise_id uuid,
  p_message text default null
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_echeance timestamptz := now() + interval '10 days';
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
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
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
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
create or replace function public.plateforme_appliquer_remise(
  p_entreprise_id uuid,
  p_coupon_id text,
  p_description text,
  p_motif_interne text default null,
  p_duree_mois integer default null,
  p_type text default null,
  p_valeur numeric default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ancien record;
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
  select remise_stripe_coupon_id, remise_description
  into v_ancien
  from public.entreprises
  where id = p_entreprise_id;
  update public.entreprises
  set remise_stripe_coupon_id = p_coupon_id,
      remise_description = p_description,
      remise_motif_interne = p_motif_interne,
      remise_duree_mois = p_duree_mois,
      remise_type = p_type,
      remise_valeur = p_valeur,
      remise_cree_par = auth.uid(),
      remise_appliquee_at = now(),
      updated_at = now()
  where id = p_entreprise_id;
  insert into public.historique_tarification(
    entreprise_id,utilisateur_id,action,ancien,nouveau,motif
  ) values (
    p_entreprise_id,auth.uid(),'remise_appliquee',
    jsonb_build_object(
      'remise_stripe_coupon_id',v_ancien.remise_stripe_coupon_id,
      'remise_description',v_ancien.remise_description
    ),
    jsonb_build_object(
      'remise_stripe_coupon_id',p_coupon_id,
      'remise_description',p_description,
      'duree_mois',p_duree_mois
    ),
    null
  );
end;
$$;
create or replace function public.plateforme_retirer_remise(p_entreprise_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ancien record;
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
  select remise_stripe_coupon_id, remise_description
  into v_ancien
  from public.entreprises
  where id = p_entreprise_id;
  update public.entreprises
  set remise_stripe_coupon_id = null,
      remise_description = null,
      remise_motif_interne = null,
      remise_duree_mois = null,
      remise_type = null,
      remise_valeur = null,
      remise_cree_par = null,
      remise_appliquee_at = null,
      updated_at = now()
  where id = p_entreprise_id;
  insert into public.historique_tarification(
    entreprise_id,utilisateur_id,action,ancien,nouveau,motif
  ) values (
    p_entreprise_id,auth.uid(),'remise_retiree',
    jsonb_build_object(
      'remise_stripe_coupon_id',v_ancien.remise_stripe_coupon_id,
      'remise_description',v_ancien.remise_description
    ),
    null,
    null
  );
end;
$$;
-- Une version tarifaire modifie le catalogue global : total + AAL2 uniquement.
create or replace function public.plateforme_creer_version_tarif(
  p_code text,
  p_nom text,
  p_prix_mensuel_ht numeric,
  p_prix_annuel_ht numeric,
  p_utilisateurs_inclus integer,
  p_administrateurs_inclus integer,
  p_operations_ia_incluses integer,
  p_stockage_go_inclus numeric,
  p_valide_du date,
  p_motif text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_precedent public.plans_abonnement%rowtype;
  v_id uuid;
  v_version integer;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  if p_code not in ('mini','pro','business','entreprise','sur_mesure') then
    raise exception 'Code offre invalide';
  end if;
  if p_prix_mensuel_ht < 0 or p_prix_annuel_ht < 0 then raise exception 'Prix invalide'; end if;
  select * into v_precedent
  from public.plans_abonnement
  where code = p_code and actif
  order by version desc limit 1 for update;
  select coalesce(max(version),0) + 1
  into v_version
  from public.plans_abonnement
  where code = p_code;
  update public.plans_abonnement
  set actif = false, valide_au = p_valide_du - 1
  where code = p_code and actif;
  insert into public.plans_abonnement(
    code,version,nom,prix_mensuel_ht,prix_annuel_ht,utilisateurs_inclus,
    administrateurs_inclus,operations_ia_incluses,stockage_go_inclus,
    fonctionnalites,actif,devis_obligatoire,valide_du,created_by
  ) values (
    p_code,v_version,p_nom,p_prix_mensuel_ht,p_prix_annuel_ht,p_utilisateurs_inclus,
    p_administrateurs_inclus,p_operations_ia_incluses,p_stockage_go_inclus,
    coalesce(v_precedent.fonctionnalites,'[]'::jsonb),true,
    p_code='sur_mesure',p_valide_du,auth.uid()
  ) returning id into v_id;
  insert into public.historique_tarification(utilisateur_id,action,ancien,nouveau,motif)
  values (
    auth.uid(),'nouvelle_version_tarifaire',to_jsonb(v_precedent),
    jsonb_build_object('plan_id',v_id,'code',p_code,'version',v_version),p_motif
  );
  return v_id;
end;
$$;
create or replace function public.plateforme_snapshot_facturation(
  p_mois date default date_trunc('month',current_date)::date
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nb integer;
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
  if p_mois <> date_trunc('month',p_mois)::date then
    raise exception 'Le mois doit commencer le premier jour';
  end if;
  insert into public.facturation_comptes_mensuelle(
    entreprise_id,employe_id,poste_id,mois,statut_compte,libelle_poste,code_offre,
    montant_ht,motif,nb_appareils_mois,depassement_appareils_facture,
    montant_depassement_appareils_ht
  )
  select e.entreprise_id,e.id,e.poste_id,p_mois,e.compte_application_statut,p.nom,p.code_offre,
    coalesce(p.tarif_compte_mensuel,0),'snapshot_mensuel',coalesce(a.nb_appareils,0),
    coalesce(a.nb_appareils,0)>2,
    case when coalesce(a.nb_appareils,0)>2 then coalesce(p.tarif_compte_mensuel,0) else 0 end
  from public.employes e
  left join public.postes p on p.id=e.poste_id
  left join lateral (
    select count(*)::integer nb_appareils
    from public.appareils_comptes ac
    where ac.entreprise_id=e.entreprise_id
      and ac.utilisateur_id=e.utilisateur_id
      and ac.premiere_activite_at<(p_mois+interval '1 month')
      and (ac.revoque_at is null or ac.revoque_at>=p_mois::timestamptz)
  ) a on true
  where e.utilisateur_id is not null
    and e.compte_application_statut in ('actif','pause','ferme')
    and coalesce(e.compte_application_ouvert_at,e.created_at)<(p_mois+interval '1 month')
    and (e.compte_application_ferme_at is null or e.compte_application_ferme_at>=p_mois::timestamptz)
  on conflict(entreprise_id,employe_id,mois) do update
  set nb_appareils_mois=greatest(
        public.facturation_comptes_mensuelle.nb_appareils_mois,
        excluded.nb_appareils_mois
      ),
      depassement_appareils_facture=(
        public.facturation_comptes_mensuelle.depassement_appareils_facture
        or excluded.depassement_appareils_facture
      ),
      montant_depassement_appareils_ht=greatest(
        public.facturation_comptes_mensuelle.montant_depassement_appareils_ht,
        excluded.montant_depassement_appareils_ht
      );
  get diagnostics v_nb = row_count;
  return v_nb;
end;
$$;
-- La création d'une entreprise est une mutation plateforme globale.
create or replace function public.plateforme_creer_entreprise(
  p_nom text,
  p_siret text default null,
  p_ville text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_modele record;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  if nullif(btrim(p_nom), '') is null then raise exception 'Nom obligatoire'; end if;
  insert into public.entreprises(
    nom,raison_sociale,siret,ville,abonnement_statut,abonnement_note
  ) values (
    btrim(p_nom),btrim(p_nom),nullif(btrim(p_siret),''),nullif(btrim(p_ville),''),
    'essai','Créée par la plateforme'
  ) returning id into v_id;
  for v_modele in
    select cle from public.modeles_roles_predefinis order by ordre
  loop
    perform public.appliquer_modele_role_predefini_interne(v_id,v_modele.cle,true);
  end loop;
  return v_id;
end;
$$;
-- La réinitialisation assistée est réservée à total/support, en AAL2 et dans
-- une session support active ciblant explicitement l'entreprise concernée.
create or replace function public.plateforme_verifier_et_journaliser_reinitialisation(
  p_entreprise_id uuid,
  p_email text,
  p_motif text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_utilisateur_id uuid;
  v_id uuid;
begin
  perform public.plateforme_exiger_role('total', 'support');
  perform public.plateforme_exiger_session_aal2();
  if not public.est_acces_support_actif(p_entreprise_id) then
    raise exception 'Session support explicite requise';
  end if;
  if length(btrim(coalesce(p_motif,''))) < 5 then
    raise exception 'Indiquez un motif d''au moins 5 caractères';
  end if;
  select u.id into v_utilisateur_id
  from auth.users au
  join public.utilisateurs u on u.id = au.id
  join public.utilisateurs_entreprises ue
    on ue.utilisateur_id = u.id and ue.entreprise_id = p_entreprise_id
  where lower(au.email) = lower(btrim(p_email));
  if v_utilisateur_id is null then
    raise exception 'Aucun compte avec cette adresse dans cette entreprise';
  end if;
  insert into public.plateforme_reinitialisations_mot_de_passe(
    entreprise_id,utilisateur_id,email,motif,demande_par
  ) values (
    p_entreprise_id,v_utilisateur_id,lower(btrim(p_email)),btrim(p_motif),
    coalesce(auth.email(),'inconnu')
  ) returning id into v_id;
  return v_id;
end;
$$;
-- Une consultation par le rôle lecture ne doit déclencher aucune suspension.
-- Les suspensions restent pilotées par les mécanismes dédiés existants.
create or replace function public.plateforme_entreprises()
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
  remise_motif_interne text,remise_duree_mois integer,remise_cree_par uuid,
  remise_type text,remise_valeur numeric,
  nb_membres bigint,nb_membres_actifs bigint,created_at timestamptz
)
language plpgsql
security definer
stable
set search_path = public
as $$
begin
  if not public.est_plateforme_admin() then
    raise exception 'Accès réservé à la plateforme';
  end if;
  return query
  select e.id,e.nom,e.code_adhesion,e.reference_interne,
         e.abonnement_statut,e.abonnement_echeance,e.abonnement_note,
         e.impaye_signale_at,e.suspension_prevue_at,e.impaye_message,e.dernier_reglement_at,
         e.abonnement_offre,e.abonnement_periodicite,e.abonnement_essai_fin,
         e.abonnement_annulation_prevue_at,e.stripe_customer_id,e.stripe_subscription_id,
         e.derniere_facture_url,e.derniere_facture_pdf,e.derniere_facture_statut,
         e.remise_stripe_coupon_id,e.remise_description,e.remise_appliquee_at,
         e.remise_motif_interne,e.remise_duree_mois,e.remise_cree_par,
         e.remise_type,e.remise_valeur,
         (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id=e.id),
         (select count(*) from public.utilisateurs_entreprises ue
          where ue.entreprise_id=e.id and ue.statut='actif'),
         e.created_at
  from public.entreprises e
  order by e.created_at desc;
end;
$$;
-- Les quatre mutations multi-app sont strictement total + AAL2.
create or replace function public.plateforme_activer_application_entreprise(
  p_entreprise_id uuid,
  p_application_code text,
  p_valide_du timestamptz default null,
  p_valide_jusqu_au timestamptz default null,
  p_source text default null,
  p_reference_externe text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  insert into public.acces_applications_entreprises(
    entreprise_id,application_code,autorise,source,reference_externe,valide_du,valide_jusqu_au
  ) values (
    p_entreprise_id,p_application_code,true,p_source,p_reference_externe,p_valide_du,p_valide_jusqu_au
  )
  on conflict(entreprise_id,application_code) do update
    set autorise=true, source=excluded.source, reference_externe=excluded.reference_externe,
        valide_du=excluded.valide_du, valide_jusqu_au=excluded.valide_jusqu_au;
  insert into public.historique_acces_applications(
    cible_type,cible_id,application_code,action,auteur_email,auteur_utilisateur_id
  ) values (
    'entreprise',p_entreprise_id,p_application_code,'activation',auth.email(),auth.uid()
  );
end;
$$;
create or replace function public.plateforme_desactiver_application_entreprise(
  p_entreprise_id uuid,
  p_application_code text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  update public.acces_applications_entreprises set autorise=false
  where entreprise_id=p_entreprise_id and application_code=p_application_code and autorise;
  if not found then raise exception 'Aucun accès actif à désactiver'; end if;
  insert into public.historique_acces_applications(
    cible_type,cible_id,application_code,action,auteur_email,auteur_utilisateur_id
  ) values (
    'entreprise',p_entreprise_id,p_application_code,'desactivation',auth.email(),auth.uid()
  );
end;
$$;
create or replace function public.plateforme_habiliter_utilisateur_application(
  p_utilisateur_id uuid,
  p_entreprise_id uuid,
  p_application_code text,
  p_role_code text,
  p_valide_du timestamptz default null,
  p_valide_jusqu_au timestamptz default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  insert into public.habilitations_applications_utilisateurs(
    entreprise_id,utilisateur_id,application_code,role_code,autorise,valide_du,valide_jusqu_au,attribue_par
  ) values (
    p_entreprise_id,p_utilisateur_id,p_application_code,p_role_code,true,
    p_valide_du,p_valide_jusqu_au,auth.uid()
  )
  on conflict(entreprise_id,utilisateur_id,application_code) do update
    set role_code=excluded.role_code, autorise=true, valide_du=excluded.valide_du,
        valide_jusqu_au=excluded.valide_jusqu_au, attribue_par=excluded.attribue_par;
  insert into public.historique_acces_applications(
    cible_type,cible_id,application_code,action,auteur_email,auteur_utilisateur_id
  ) values (
    'utilisateur',p_utilisateur_id,p_application_code,
    'habilitation:'||p_role_code,auth.email(),auth.uid()
  );
end;
$$;
create or replace function public.plateforme_retirer_habilitation_application(
  p_utilisateur_id uuid,
  p_entreprise_id uuid,
  p_application_code text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  update public.habilitations_applications_utilisateurs set autorise=false
  where entreprise_id=p_entreprise_id
    and utilisateur_id=p_utilisateur_id
    and application_code=p_application_code
    and autorise;
  if not found then raise exception 'Aucune habilitation active à retirer'; end if;
  insert into public.historique_acces_applications(
    cible_type,cible_id,application_code,action,auteur_email,auteur_utilisateur_id
  ) values (
    'utilisateur',p_utilisateur_id,p_application_code,
    'retrait_habilitation',auth.email(),auth.uid()
  );
end;
$$;
-- Préflight versionné, en lecture seule, réservé à la maintenance. Le fichier
-- docs/operations/PLATFORM_SECURITY_PREFLIGHT.sql contient la variante exécutable
-- avant l'application des migrations 236/237 sur un environnement distant.
create or replace function public.plateforme_preflight_integrite()
returns table(controle text, anomalies bigint, bloquant boolean)
language sql
security definer
stable
set search_path = public
as $$
  select 'applications_historique_inconnues', count(*), true
  from public.historique_acces_applications h
  left join public.applications_elsatia a on a.code = h.application_code
  where a.code is null
  union all
  select 'administrateurs_etat_incoherent', count(*), true
  from public.plateforme_admins pa
  where not (
    (statut_identite='en_attente' and utilisateur_id is null and not actif and activation_at is null and revocation_at is null)
    or (statut_identite='rattachee_non_confirmee' and utilisateur_id is not null and not actif and activation_at is null and revocation_at is null)
    or (statut_identite='active' and utilisateur_id is not null and actif and activation_at is not null and revocation_at is null)
    or (statut_identite='revoquee' and not actif and revocation_at is not null)
  )
  union all
  select 'administrateurs_actifs_sans_uid', count(*), true
  from public.plateforme_admins where actif and utilisateur_id is null
  union all
  select 'uid_administrateurs_dupliques', count(*), true
  from (
    select utilisateur_id from public.plateforme_admins
    where utilisateur_id is not null group by utilisateur_id having count(*) > 1
  ) d
  union all
  select 'sessions_support_ouvertes_sans_admin_actif', count(*), true
  from public.plateforme_acces_entreprises s
  left join public.plateforme_admins pa
    on pa.utilisateur_id=s.plateforme_user_id and pa.actif and pa.statut_identite='active'
  where s.termine_at is null and pa.utilisateur_id is null
  union all
  select 'historique_support_utilisateur_absent', count(*), true
  from public.plateforme_acces_entreprises s
  left join public.utilisateurs u on u.id=s.plateforme_user_id
  where u.id is null
  union all
  select 'administrateur_total_actif_absent',
         case when exists(
           select 1 from public.plateforme_admins
           where role='total' and actif and statut_identite='active'
         ) then 0 else 1 end,
         true;
$$;
revoke all on function public.plateforme_preflight_integrite() from public, anon, authenticated;
grant execute on function public.plateforme_preflight_integrite() to service_role;
-- Exposition des seules RPC applicatives nécessaires. Les helpers internes et le
-- préflight ne sont jamais exécutables par un utilisateur authentifié ordinaire.
revoke all on function public.plateforme_modifier_role_admin(text,text) from public, anon;
grant execute on function public.plateforme_modifier_role_admin(text,text) to authenticated;
revoke all on function public.plateforme_ajouter_admin(text,text,text) from public, anon;
revoke all on function public.plateforme_rattacher_admin(text,uuid) from public, anon;
revoke all on function public.plateforme_activer_admin(text) from public, anon;
revoke all on function public.plateforme_retirer_admin(text) from public, anon;
revoke all on function public.plateforme_detacher_admin_revoque(text) from public, anon;
revoke all on function public.plateforme_entrer_entreprise(uuid,text) from public, anon;
revoke all on function public.plateforme_support_fils() from public, anon;
revoke all on function public.plateforme_support_messages(uuid) from public, anon;
revoke all on function public.plateforme_support_repondre(uuid,text) from public, anon;
revoke all on function public.plateforme_modifier_abonnement(uuid,text,date,text) from public, anon;
revoke all on function public.plateforme_modifier_tarif_poste(uuid,text,numeric) from public, anon;
revoke all on function public.plateforme_signaler_impaye(uuid,text) from public, anon;
revoke all on function public.plateforme_enregistrer_reglement(uuid,text) from public, anon;
revoke all on function public.plateforme_appliquer_remise(uuid,text,text,text,integer,text,numeric) from public, anon;
revoke all on function public.plateforme_retirer_remise(uuid) from public, anon;
revoke all on function public.plateforme_creer_version_tarif(text,text,numeric,numeric,integer,integer,integer,numeric,date,text) from public, anon;
revoke all on function public.plateforme_snapshot_facturation(date) from public, anon;
revoke all on function public.plateforme_creer_entreprise(text,text,text) from public, anon;
revoke all on function public.plateforme_verifier_et_journaliser_reinitialisation(uuid,text,text) from public, anon;
revoke all on function public.plateforme_entreprises() from public, anon;
grant execute on function public.plateforme_ajouter_admin(text,text,text) to authenticated;
grant execute on function public.plateforme_rattacher_admin(text,uuid) to authenticated;
grant execute on function public.plateforme_activer_admin(text) to authenticated;
grant execute on function public.plateforme_retirer_admin(text) to authenticated;
grant execute on function public.plateforme_detacher_admin_revoque(text) to authenticated;
grant execute on function public.plateforme_entrer_entreprise(uuid,text) to authenticated;
grant execute on function public.plateforme_support_fils() to authenticated;
grant execute on function public.plateforme_support_messages(uuid) to authenticated;
grant execute on function public.plateforme_support_repondre(uuid,text) to authenticated;
grant execute on function public.plateforme_modifier_abonnement(uuid,text,date,text) to authenticated;
grant execute on function public.plateforme_modifier_tarif_poste(uuid,text,numeric) to authenticated;
grant execute on function public.plateforme_signaler_impaye(uuid,text) to authenticated;
grant execute on function public.plateforme_enregistrer_reglement(uuid,text) to authenticated;
grant execute on function public.plateforme_appliquer_remise(uuid,text,text,text,integer,text,numeric) to authenticated;
grant execute on function public.plateforme_retirer_remise(uuid) to authenticated;
grant execute on function public.plateforme_creer_version_tarif(text,text,numeric,numeric,integer,integer,integer,numeric,date,text) to authenticated;
grant execute on function public.plateforme_snapshot_facturation(date) to authenticated;
grant execute on function public.plateforme_creer_entreprise(text,text,text) to authenticated;
grant execute on function public.plateforme_verifier_et_journaliser_reinitialisation(uuid,text,text) to authenticated;
grant execute on function public.plateforme_entreprises() to authenticated;
notify pgrst, 'reload schema';
