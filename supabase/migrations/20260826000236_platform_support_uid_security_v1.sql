-- Sécurise définitivement l'administration et le support plateforme par UID.
-- L'email reste une donnée de contact/audit et ne participe jamais à l'autorisation.

alter table public.plateforme_admins
  add column if not exists statut_identite text not null default 'en_attente',
  add column if not exists activation_at timestamptz,
  add column if not exists activation_par uuid references auth.users(id) on delete set null,
  add column if not exists revocation_at timestamptz,
  add column if not exists revocation_par uuid references auth.users(id) on delete set null;

-- Préserve les administrateurs historiquement actifs, sans transformer une nouvelle
-- correspondance email en activation. Le compte professionnel officiel reste
-- volontairement inactif jusqu'à son lot d'activation explicite.
update public.plateforme_admins
set statut_identite = case
      when lower(email) = 'julien@elsatia.fr' and utilisateur_id is null
        then 'en_attente'
      when lower(email) = 'julien@elsatia.fr'
        then 'rattachee_non_confirmee'
      when utilisateur_id is null
        then 'en_attente'
      when actif
        then 'active'
      else 'revoquee'
    end,
    actif = case when lower(email) = 'julien@elsatia.fr' then false else actif end,
    activation_at = case
      when lower(email) <> 'julien@elsatia.fr' and utilisateur_id is not null and actif
        then coalesce(updated_at, created_at, now())
      else null
    end,
    updated_at = now();

alter table public.plateforme_admins
  add constraint plateforme_admins_statut_identite_check
    check (statut_identite in ('en_attente','rattachee_non_confirmee','active','revoquee')),
  add constraint plateforme_admins_statut_coherent_check
    check (
      (statut_identite = 'en_attente' and utilisateur_id is null and not actif)
      or (statut_identite = 'rattachee_non_confirmee' and utilisateur_id is not null and not actif)
      or (statut_identite = 'active' and utilisateur_id is not null and actif and activation_at is not null)
      or (statut_identite = 'revoquee' and not actif)
    );

-- Une session support expire automatiquement. Les sessions déjà ouvertes lors de la
-- migration reçoivent une fenêtre conservatrice de quatre heures à partir de la migration.
alter table public.plateforme_acces_entreprises
  add column if not exists expire_at timestamptz not null default (now() + interval '4 hours');

alter table public.plateforme_acces_entreprises
  add constraint plateforme_acces_entreprises_fenetre_check
    check (expire_at > commence_at);

create or replace function public.plateforme_role_courant()
returns text
language sql security definer stable set search_path = public as $$
  select role
  from public.plateforme_admins
  where utilisateur_id = auth.uid()
    and actif
    and statut_identite = 'active'
  limit 1;
$$;

create or replace function public.est_plateforme_admin()
returns boolean
language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and exists(
    select 1
    from public.plateforme_admins
    where utilisateur_id = auth.uid()
      and actif
      and statut_identite = 'active'
  );
$$;

-- Le mode support exige simultanément l'identité canonique active, le rôle autorisé,
-- une session non fermée, non expirée et visant exactement l'entreprise demandée.
create or replace function public.est_acces_support_actif(p_entreprise_id uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and exists(
    select 1
    from public.plateforme_acces_entreprises s
    join public.plateforme_admins pa
      on pa.utilisateur_id = auth.uid()
     and pa.actif
     and pa.statut_identite = 'active'
     and pa.role in ('total','support')
    where s.plateforme_user_id = auth.uid()
      and s.entreprise_id = p_entreprise_id
      and s.termine_at is null
      and s.commence_at <= now()
      and s.expire_at > now()
  );
$$;

create or replace function public.plateforme_entrer_entreprise(
  p_entreprise_id uuid,
  p_motif text
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_role text;
  v_entreprise_precedente uuid;
  v_session public.plateforme_acces_entreprises;
begin
  if auth.uid() is null or not public.est_plateforme_admin() then
    raise exception 'Accès support non autorisé';
  end if;
  v_role := public.plateforme_role_courant();
  if coalesce(v_role, '') not in ('total','support') then
    raise exception 'Accès support non autorisé';
  end if;
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

-- Un ajout crée seulement une identité en attente. Aucun compte Auth n'est recherché
-- automatiquement et aucune activation n'est déduite de l'email.
create or replace function public.plateforme_ajouter_admin(
  p_email text, p_nom text default null, p_role text default 'total'
) returns void
language plpgsql security definer set search_path = public as $$
declare v_email text := lower(trim(p_email));
begin
  perform public.plateforme_exiger_role('total');
  if v_email = '' or position('@' in v_email) = 0 then raise exception 'Email invalide'; end if;
  if p_role not in ('total','support','facturation','lecture') then raise exception 'Rôle invalide'; end if;

  insert into public.plateforme_admins(
    email, role, nom, ajoute_par, utilisateur_id, actif, statut_identite, updated_at
  ) values (
    v_email, p_role, nullif(trim(coalesce(p_nom,'')),''), auth.email(),
    null, false, 'en_attente', now()
  )
  on conflict(email) do update
    set role = excluded.role,
        nom = coalesce(excluded.nom, public.plateforme_admins.nom),
        updated_at = now();
end;
$$;

-- Étape 1 : rattachement explicite à un compte Auth déjà vérifié. Cette étape ne donne
-- encore aucun droit. Un administrateur ne peut jamais se rattacher lui-même.
create or replace function public.plateforme_rattacher_admin(
  p_email text,
  p_utilisateur_id uuid
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_auth_email text;
  v_email_confirme timestamptz;
begin
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
      updated_at = now()
  where email = v_email and statut_identite in ('en_attente','revoquee');
  if not found then raise exception 'Identité administrateur absente ou état incompatible'; end if;
end;
$$;

-- Étape 2 : activation explicite par un autre administrateur total. Le compte cible doit
-- avoir un email vérifié et au moins un facteur MFA vérifié.
create or replace function public.plateforme_activer_admin(p_email text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_utilisateur_id uuid;
begin
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
  if not exists(
    select 1 from auth.mfa_factors
    where user_id = v_utilisateur_id and status = 'verified'
  ) then raise exception 'Authentification forte requise'; end if;

  update public.plateforme_admins
  set actif = true,
      statut_identite = 'active',
      activation_at = now(),
      activation_par = auth.uid(),
      revocation_at = null,
      revocation_par = null,
      updated_at = now()
  where email = v_email;
end;
$$;

-- Révocation logique : les sessions support sont fermées et la ligne est conservée pour
-- l'audit. La suppression éventuelle du compte Auth vient seulement après détachement.
create or replace function public.plateforme_retirer_admin(p_email text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_utilisateur_id uuid;
  v_role text;
begin
  perform public.plateforme_exiger_role('total');
  select utilisateur_id, role into v_utilisateur_id, v_role
  from public.plateforme_admins where email = v_email for update;
  if not found then raise exception 'Administrateur introuvable'; end if;
  if v_utilisateur_id = auth.uid() then raise exception 'Vous ne pouvez pas révoquer votre propre compte'; end if;
  if v_role = 'total' and (
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
      updated_at = now()
  where email = v_email;
  update public.plateforme_acces_entreprises
  set termine_at = now(), termine_motif = 'Révocation administrateur'
  where plateforme_user_id = v_utilisateur_id and termine_at is null;
end;
$$;

create or replace function public.plateforme_detacher_admin_revoque(p_email text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(trim(p_email));
  v_utilisateur_id uuid;
begin
  perform public.plateforme_exiger_role('total');
  select utilisateur_id into v_utilisateur_id
  from public.plateforme_admins
  where email = v_email and statut_identite = 'revoquee'
  for update;
  if not found then raise exception 'Identité non révoquée'; end if;
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

-- Audit multi-app : auteur UID et application référencée. Les anciennes lignes sont
-- conservées ; l'UID reste nullable pour l'historique antérieur à cette migration.
alter table public.historique_acces_applications
  add column if not exists auteur_utilisateur_id uuid references auth.users(id) on delete set null;

alter table public.historique_acces_applications
  add constraint historique_acces_applications_application_code_fkey
    foreign key(application_code) references public.applications_elsatia(code) on delete restrict;

create or replace function public.plateforme_activer_application_entreprise(
  p_entreprise_id uuid,
  p_application_code text,
  p_valide_du timestamptz default null,
  p_valide_jusqu_au timestamptz default null,
  p_source text default null,
  p_reference_externe text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
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
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
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
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  insert into public.habilitations_applications_utilisateurs(
    entreprise_id,utilisateur_id,application_code,role_code,autorise,valide_du,valide_jusqu_au,attribue_par
  ) values (
    p_entreprise_id,p_utilisateur_id,p_application_code,p_role_code,true,p_valide_du,p_valide_jusqu_au,auth.uid()
  )
  on conflict(entreprise_id,utilisateur_id,application_code) do update
    set role_code=excluded.role_code, autorise=true, valide_du=excluded.valide_du,
        valide_jusqu_au=excluded.valide_jusqu_au, attribue_par=excluded.attribue_par;
  insert into public.historique_acces_applications(
    cible_type,cible_id,application_code,action,auteur_email,auteur_utilisateur_id
  ) values (
    'utilisateur',p_utilisateur_id,p_application_code,'habilitation:'||p_role_code,auth.email(),auth.uid()
  );
end;
$$;

create or replace function public.plateforme_retirer_habilitation_application(
  p_utilisateur_id uuid,
  p_entreprise_id uuid,
  p_application_code text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  update public.habilitations_applications_utilisateurs set autorise=false
  where entreprise_id=p_entreprise_id
    and utilisateur_id=p_utilisateur_id
    and application_code=p_application_code
    and autorise;
  if not found then raise exception 'Aucune habilitation active à retirer'; end if;
  insert into public.historique_acces_applications(
    cible_type,cible_id,application_code,action,auteur_email,auteur_utilisateur_id
  ) values (
    'utilisateur',p_utilisateur_id,p_application_code,'retrait_habilitation',auth.email(),auth.uid()
  );
end;
$$;

revoke all on function public.plateforme_rattacher_admin(text,uuid) from public,anon;
revoke all on function public.plateforme_activer_admin(text) from public,anon;
revoke all on function public.plateforme_detacher_admin_revoque(text) from public,anon;
grant execute on function public.plateforme_rattacher_admin(text,uuid) to authenticated;
grant execute on function public.plateforme_activer_admin(text) to authenticated;
grant execute on function public.plateforme_detacher_admin_revoque(text) to authenticated;

-- Réaffirme les droits des fonctions redéfinies, sans exposition anon/public.
revoke all on function public.est_acces_support_actif(uuid) from public,anon;
revoke all on function public.plateforme_entrer_entreprise(uuid,text) from public,anon;
revoke all on function public.plateforme_ajouter_admin(text,text,text) from public,anon;
revoke all on function public.plateforme_retirer_admin(text) from public,anon;
grant execute on function public.est_acces_support_actif(uuid) to authenticated;
grant execute on function public.plateforme_entrer_entreprise(uuid,text) to authenticated;
grant execute on function public.plateforme_ajouter_admin(text,text,text) to authenticated;
grant execute on function public.plateforme_retirer_admin(text) to authenticated;

notify pgrst, 'reload schema';
