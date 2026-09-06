-- =====================================================================
-- ELSATIA — Compte de démonstration local pour les captures du site.
-- ELSATIA-GP-SAFE-DEMO-CAPTURE-BUILD-V1
-- =====================================================================
--
-- Environnement : SUPABASE LOCAL UNIQUEMENT.
-- Lancement : node scripts/seed-demo-captures-local.mjs (après le seed).
--
-- Le compte n'existe que dans le conteneur Docker du poste :
--   * adresse @invalid.local — domaine réservé, jamais routable (RFC 2606) ;
--   * mot de passe de test écrit en clair ci-dessous, valable uniquement
--     pour cette base locale, sans aucune valeur ailleurs ;
--   * aucun secret de Julien, aucun compte réel, aucun e-mail envoyé
--     (Mailpit intercepte tout en local).
--
-- Idempotent : le compte est recréé à l'identique à chaque exécution.
-- =====================================================================

do $garde$
begin
  if coalesce(current_setting('elsatia.demo_captures_local', true), '') <> 'oui' then
    raise exception 'ARRET SUR : ce script est réservé au Supabase LOCAL. Lancez-le via `node scripts/seed-demo-captures-local.mjs`.';
  end if;
  if session_user <> 'postgres' then
    raise exception 'ARRET SUR : connexion superutilisateur locale attendue (session_user=%).', session_user;
  end if;
  if exists (select 1 from public.entreprises where reference_interne = 'DEMO-18M') then
    raise exception 'ARRET SUR : entreprise DEMO-18M présente — cette base ressemble à la Production. Aucune écriture effectuée.';
  end if;
end
$garde$;

do $compte$
declare
  v_uid      constant uuid := 'c0de0000-0000-4000-8000-000000000001';
  v_email    constant text := 'demo-captures@invalid.local';
  v_mdp      constant text := 'demo-captures-local';
  v_ent      uuid;
  v_poste    uuid;
  v_employe  uuid;
begin
  select id into v_ent from public.entreprises where reference_interne = 'DEMO-CAPT';
  if v_ent is null then
    raise exception 'Aucune entreprise DEMO-CAPT : exécutez d''abord creer_entreprise_demo_captures.sql.';
  end if;

  -- ---- Compte Auth local --------------------------------------------
  -- Les colonnes de jetons doivent être des chaînes vides et non NULL :
  -- GoTrue local refuse sinon l'authentification par mot de passe
  -- (même correctif que scripts/e2e/prepare-local-recipe.sql).
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change,
    email_change_token_current, reauthentication_token, phone_change, phone_change_token,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    v_email, crypt(v_mdp, gen_salt('bf')), now(),
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('prenom', 'Jean', 'nom', 'Exemple'),
    '', '', '', '', '', '', '', '',
    now(), now()
  )
  on conflict (id) do update set
    email = excluded.email,
    encrypted_password = excluded.encrypted_password,
    email_confirmed_at = excluded.email_confirmed_at,
    raw_app_meta_data = excluded.raw_app_meta_data,
    raw_user_meta_data = excluded.raw_user_meta_data,
    confirmation_token = '', recovery_token = '', email_change_token_new = '',
    email_change = '', email_change_token_current = '', reauthentication_token = '',
    phone_change = '', phone_change_token = '',
    banned_until = null, deleted_at = null,
    updated_at = now();

  insert into auth.identities (id, provider_id, user_id, identity_data, provider, created_at, updated_at)
  values (
    v_uid, v_uid::text, v_uid,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true),
    'email', now(), now()
  )
  on conflict (provider_id, provider) do update set
    identity_data = excluded.identity_data,
    updated_at = now();

  -- ---- Profil applicatif --------------------------------------------
  -- Le trigger on_auth_user_created crée déjà la ligne ; on garantit son
  -- contenu pour que l'en-tête de l'application affiche un nom cohérent.
  insert into public.utilisateurs (id, prenom, nom)
  values (v_uid, 'Jean', 'Exemple')
  on conflict (id) do update set prenom = excluded.prenom, nom = excluded.nom;

  -- ---- Rattachement à l'entreprise de démonstration -------------------
  select id into v_poste from public.postes where entreprise_id = v_ent and nom = 'Administrateur';
  if v_poste is null then
    raise exception 'Poste « Administrateur » introuvable sur l''entreprise de démonstration.';
  end if;

  insert into public.utilisateurs_entreprises (utilisateur_id, entreprise_id, poste_id, statut, pointage_personnel_actif)
  values (v_uid, v_ent, v_poste, 'actif', false)
  on conflict (utilisateur_id, entreprise_id) do update set
    poste_id = excluded.poste_id, statut = 'actif', pointage_personnel_actif = false;

  update public.utilisateurs set entreprise_active_id = v_ent where id = v_uid;

  -- ---- Rattachement terrain (écran « Mes travaux ») -------------------
  -- La RPC mes_devis_chantiers_sans_prix ne répond que si le compte connecté
  -- est lui-même un salarié affecté à des chantiers.
  select id into v_employe
  from public.employes
  where entreprise_id = v_ent and prenom = 'Jean' and nom = 'Exemple' and statut = 'actif'
  limit 1;
  if v_employe is null then
    raise exception 'Salarié « Jean Exemple » introuvable sur l''entreprise de démonstration.';
  end if;

  update public.employes set utilisateur_id = null
  where entreprise_id = v_ent and utilisateur_id = v_uid and id <> v_employe;
  update public.employes set utilisateur_id = v_uid, compte_application_statut = 'actif'
  where id = v_employe;

  raise notice 'Compte de démonstration prêt : % (entreprise %)', v_email, v_ent;
end
$compte$;

select
  u.email                                                                     as "Compte",
  e.nom                                                                       as "Entreprise",
  p.nom                                                                       as "Poste",
  (select count(*) from public.affectations a
     join public.employes emp on emp.id = a.employe_id
    where emp.utilisateur_id = u.id
      and a.date between date_trunc('week', current_date)::date
                     and date_trunc('week', current_date)::date + 6)          as "Affectations cette semaine"
from auth.users u
join public.utilisateurs_entreprises ue on ue.utilisateur_id = u.id
join public.entreprises e on e.id = ue.entreprise_id
join public.postes p on p.id = ue.poste_id
where u.email = 'demo-captures@invalid.local';
