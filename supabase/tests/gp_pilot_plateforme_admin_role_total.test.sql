-- GP-EXTERNAL-PILOT-CLOSURE-V1 — un membre plateforme non-'total' ne peut
-- plus s'auto-promouvoir (ni promouvoir qui que ce soit) via
-- plateforme_ajouter_admin(). Voir 20260922000314_gp_pilot_plateforme_admin_role_total.sql.
--
-- Corrigé lors de la revue ELSATIA-EXTERNAL-PILOT-FULL-REHEARSAL-V2 (jamais
-- exécuté avant cette mission, faute de pgTAP disponible) : le fichier
-- original identifiait l'appelant par `request.jwt.claim.email` et par une
-- ligne `plateforme_admins` sans `utilisateur_id`. Depuis le durcissement
-- canonique par `auth.uid()` (20260826000235 platform_admin_uid_canonical_v1,
-- confirmé par 20260826000236 platform_support_uid_security_v1 :
-- `plateforme_role_courant()` ne lit plus que
-- `utilisateur_id = auth.uid() and actif and statut_identite = 'active'`),
-- cette forme ne peut plus fonctionner : la contrainte
-- `plateforme_admins_actif_requiert_utilisateur_id` rejette même l'insertion
-- de décor, et le reste du fichier n'aurait de toute façon jamais vu le bon
-- rôle puisque `auth.uid()` serait toujours resté nul. Reproduit ici avec un
-- vrai `utilisateur_id`/`sub`, comme le fait déjà le fixture partagé pour
-- l'admin plateforme 'total'.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

\ir fixtures/isolation_multitenant.inc

-- Membre plateforme 'lecture', identité canonique complète (comme le membre
-- 'total' du fixture partagé).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'lecture@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now())
on conflict (id) do nothing;

insert into public.plateforme_admins (
  email, role, utilisateur_id, actif, statut_identite, activation_at
)
values (
  'lecture@invalid.local', 'lecture', '30000000-0000-0000-0000-000000000002',
  true, 'active', now()
)
on conflict (email) do update
set role = excluded.role,
    utilisateur_id = excluded.utilisateur_id,
    actif = excluded.actif,
    statut_identite = excluded.statut_identite;

set local role authenticated;

-- ── Membre 'lecture' : ne peut ni s'auto-promouvoir, ni ajouter qui que ce soit ──
select set_config('request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000002","role":"authenticated","email":"lecture@invalid.local"}', true);
select throws_like(
  $$select public.plateforme_ajouter_admin('lecture@invalid.local', null, 'total')$$,
  '%réservée%',
  'un membre plateforme en lecture ne peut pas s''auto-promouvoir en total'
);
select throws_like(
  $$select public.plateforme_ajouter_admin('nouveau@invalid.local', null, 'lecture')$$,
  '%réservé%',
  'un membre plateforme en lecture ne peut ajouter personne, même avec un rôle mineur'
);
-- plateforme_admins a RLS activée sans aucune politique (accès uniquement via
-- les RPC SECURITY DEFINER) : même avec le GRANT SELECT accordé à
-- `authenticated` par residual_acl_hardening_r74, une lecture directe ne
-- renvoie jamais de ligne sous ce rôle. Vérifié ici en repassant
-- momentanément en superutilisateur, comme le fait déjà `reset role` en fin
-- de fichier.
reset role;
select is(
  (select role from public.plateforme_admins where email = 'lecture@invalid.local'),
  'lecture',
  'le rôle du membre lecture est resté inchangé après la tentative'
);
set local role authenticated;

-- ── Un compte hors plateforme (gérant A) : refusé aussi ──
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","email":"admin-a@invalid.local"}', true);
select throws_like(
  $$select public.plateforme_ajouter_admin('admin-a@invalid.local', null, 'total')$$,
  '%réservé%',
  'un utilisateur hors plateforme ne peut pas s''ajouter lui-même'
);

-- ── Membre 'total' : peut ajouter/retirer normalement (non-régression) ──
-- plateforme_ajouter_admin exige aussi l'AAL2 (plateforme_exiger_session_aal2)
-- depuis le durcissement — sans le claim 'aal', l'appel serait refusé même
-- pour un membre 'total' légitime.
select set_config('request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000001","role":"authenticated","email":"plateforme@invalid.local","aal":"aal2"}', true);
select lives_ok(
  $$select public.plateforme_ajouter_admin('nouveau-support@invalid.local', 'Support', 'support')$$,
  'un membre total peut toujours ajouter un membre plateforme'
);
reset role;
select is(
  (select role from public.plateforme_admins where email = 'nouveau-support@invalid.local'),
  'support',
  'le nouveau membre porte bien le rôle demandé'
);

reset role;
select * from finish();
rollback;
