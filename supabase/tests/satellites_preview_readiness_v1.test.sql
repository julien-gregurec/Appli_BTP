-- ELSATIA SATELLITES PREVIEW READINESS V1 — constats A-05 (Drone « bientot ») et A-11
-- (url_preview administrable par le seul propriétaire plateforme).
--
-- A-05 : une application au statut produit « bientot » n'est utilisable par PERSONNE :
--   ni par un client (déjà vrai : aucun rôle n'existe), ni par un administrateur plateforme
--   (le lanceur la lui présentait « URL à configurer »). Elle RESTE au catalogue
--   (applications_elsatia), administrable depuis /plateforme/applications. La règle
--   « le propriétaire voit toute application active » est conservée pour toute application
--   publiée (disponible ou interne), y compris une application future inconnue.
-- A-11 : plateforme_definir_url_preview_application — propriétaire plateforme, AAL2, URL
--   https d'origine stricte sur un hôte Preview autorisé, jamais une URL de Production,
--   journalisée ; aucun autre rôle (admin plateforme délégué, admin entreprise, anon) ne
--   peut modifier une URL système.

begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

\ir fixtures/isolation_multitenant.inc

-- ── Décor ────────────────────────────────────────────────────────────────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-00000000000f',
       'authenticated', 'authenticated', pa.email, crypt('test', gen_salt('bf')), now(), now(), now()
from public.plateforme_admins pa where pa.proprietaire
on conflict do nothing;
select set_config('elsatia.test_proprietaire_uid',
  (select u.id::text from auth.users u join public.plateforme_admins pa on lower(pa.email) = lower(u.email)
   where pa.proprietaire limit 1), true);
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('30000000-0000-0000-0000-0000000000fa', current_setting('elsatia.test_proprietaire_uid')::uuid,
        'test-owner-totp', 'totp', 'verified', now(), now(), 'secret');
insert into public.utilisateurs (id, prenom, nom)
values (current_setting('elsatia.test_proprietaire_uid')::uuid, 'Propriétaire', 'ELSATIA')
on conflict (id) do nothing;

-- Administrateurs plateforme délégués : « total » non propriétaire et « support ».
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000021', 'authenticated', 'authenticated',
   'delegue-total@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000022', 'authenticated', 'authenticated',
   'delegue-support@invalid.local', crypt('test', gen_salt('bf')), now(), now(), now())
on conflict do nothing;
insert into public.plateforme_admins (email, role, utilisateur_id, actif, statut_identite, activation_at) values
  ('delegue-total@invalid.local', 'total', '30000000-0000-0000-0000-000000000021', true, 'active', now()),
  ('delegue-support@invalid.local', 'support', '30000000-0000-0000-0000-000000000022', true, 'active', now())
on conflict (email) do nothing;

-- Application « bientot » de contrôle, rendue habilitable pour prouver que SEUL le statut
-- produit ferme l'accès (défense en profondeur côté client).
insert into public.applications_elsatia (code, nom, statut_produit, ordre)
values ('app_bientot_test', 'Application bientôt (test)', 'bientot', 95);
insert into public.roles_applications_elsatia (application_code, code, nom)
values ('app_bientot_test', 'app_bientot_test_role', 'Rôle test');
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source)
values ('a0000000-0000-0000-0000-000000000001', 'app_bientot_test', true, 'test');
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code)
values ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'app_bientot_test', 'app_bientot_test_role');
-- Application future inconnue, publiée (statut par défaut « disponible ») : la règle
-- propriétaire « toute application active » doit rester vraie pour elle.
insert into public.applications_elsatia (code, nom, ordre) values ('future_dispo_test', 'Application future publiée', 96);

-- ── Revendication propriétaire (AAL2 + MFA vérifié) ──────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('elsatia.test_proprietaire_uid'), true);
select set_config('request.jwt.claim.email', 'julien@elsatia.fr', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
select lives_ok($$select public.plateforme_proprietaire_revendiquer()$$, 'décor : le propriétaire revendique son identité');
select ok(public.est_plateforme_proprietaire(), 'décor : propriétaire reconnu');

-- ══ A-05 ══════════════════════════════════════════════════════════════════════
-- 1-6. Propriétaire.
select ok(not public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'drone'),
  'A-05 propriétaire : Drone (bientot) n''est pas une application utilisable');
select is((select count(*) from public.applications_autorisees('a0000000-0000-0000-0000-000000000001')
           where application_code = 'drone'), 0::bigint,
  'A-05 propriétaire : Drone n''apparaît pas dans le lanceur');
select is((select count(*) from public.applications_autorisees('a0000000-0000-0000-0000-000000000001')
           where application_code in ('gestion_pro','colors','tools','reserves','future_dispo_test')), 5::bigint,
  'A-05 propriétaire : les applications publiées (disponible, interne, future) restent toutes ouvertes');
select ok(public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'reserves'),
  'A-05 propriétaire : Réserves (interne) reste accessible');
select ok(public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'future_dispo_test'),
  'A-05 propriétaire : une application future publiée reste accessible sans habilitation');
select is((select statut_produit from public.applications_elsatia where code = 'drone'), 'bientot',
  'A-05 : Drone reste au catalogue, statut bientot, visible de l''administration');

-- 7-8. Administrateur plateforme délégué « support ».
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000022', true);
select set_config('request.jwt.claim.email', 'delegue-support@invalid.local', true);
select ok(public.est_plateforme_admin(), 'décor : le délégué support est administrateur plateforme');
select ok(not public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'drone'),
  'A-05 support : Drone refusé');
select is((select count(*) from public.applications_autorisees('a0000000-0000-0000-0000-000000000001')
           where application_code in ('drone','app_bientot_test')), 0::bigint,
  'A-05 support : aucune application bientot dans le lanceur');

-- 9-11. Client : entitlement et habilitation posés de force sur une application bientot.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select ok(not public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'app_bientot_test'),
  'A-05 client : même habilité, une application bientot est refusée');
select is((select count(*) from public.applications_autorisees('a0000000-0000-0000-0000-000000000001')
           where application_code = 'app_bientot_test'), 0::bigint,
  'A-05 client : l''application bientot n''apparaît pas dans son lanceur');
reset role;
update public.applications_elsatia set statut_produit = 'disponible' where code = 'app_bientot_test';
set local role authenticated;
select ok(public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'app_bientot_test'),
  'A-05 client : publiée (disponible), la même application s''ouvre — seul le statut fermait');
reset role;
update public.applications_elsatia set statut_produit = 'bientot' where code = 'app_bientot_test';

-- 12. Le client d'une autre entreprise reste refusé (isolation inchangée).
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-b@invalid.local', true);
select ok(not public.a_acces_application('a0000000-0000-0000-0000-000000000001', 'colors'),
  'isolation : un admin de B n''ouvre aucune application de A');

-- ══ A-11 ══════════════════════════════════════════════════════════════════════
select has_function('public', 'plateforme_definir_url_preview_application', array['text','text'],
  'A-11 : RPC propriétaire de définition de url_preview');
select is(
  (select prosecdef from pg_proc where oid = 'public.plateforme_definir_url_preview_application(text,text)'::regprocedure),
  true, 'A-11 : SECURITY DEFINER');
select ok(
  (select proconfig @> array['search_path=public'] from pg_proc
   where oid = 'public.plateforme_definir_url_preview_application(text,text)'::regprocedure),
  'A-11 : search_path figé');
select ok(not has_function_privilege('anon', 'public.plateforme_definir_url_preview_application(text,text)', 'execute'),
  'A-11 : anon ne peut pas exécuter la RPC');
select ok(not has_function_privilege('service_role', 'public.plateforme_definir_url_preview_application(text,text)', 'execute'),
  'A-11 : service_role ne peut pas exécuter la RPC (geste humain AAL2 uniquement)');
select ok(not has_table_privilege('authenticated', 'public.applications_elsatia', 'update'),
  'A-11 : aucune écriture directe sur le catalogue pour authenticated');

-- Admin entreprise (A), AAL2 : refus.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
select throws_ok($$select public.plateforme_definir_url_preview_application('colors', 'https://colors-preview.vercel.app')$$,
  '42501', null, 'A-11 : un administrateur ENTREPRISE ne modifie jamais une URL système');

-- Administrateur plateforme « total » non propriétaire, AAL2 : refus.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000021', true);
select set_config('request.jwt.claim.email', 'delegue-total@invalid.local', true);
select throws_ok($$select public.plateforme_definir_url_preview_application('colors', 'https://colors-preview.vercel.app')$$,
  '42501', null, 'A-11 : un administrateur plateforme délégué (total) est refusé');

-- Propriétaire en AAL1 : refus.
select set_config('request.jwt.claim.sub', current_setting('elsatia.test_proprietaire_uid'), true);
select set_config('request.jwt.claim.email', 'julien@elsatia.fr', true);
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);
select throws_like($$select public.plateforme_definir_url_preview_application('colors', 'https://colors-preview.vercel.app')$$,
  '%AAL2%', 'A-11 : propriétaire en AAL1 refusé');

-- Propriétaire en AAL2 : URL refusées.
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
select throws_ok($$select public.plateforme_definir_url_preview_application('colors', 'http://colors-preview.vercel.app')$$,
  '22023', null, 'A-11 : http refusé');
select throws_ok($$select public.plateforme_definir_url_preview_application('colors', 'javascript:alert(1)')$$,
  '22023', null, 'A-11 : javascript: refusé');
select throws_ok($$select public.plateforme_definir_url_preview_application('colors', 'data:text/html,<script>x</script>')$$,
  '22023', null, 'A-11 : data: refusé');
select throws_ok($$select public.plateforme_definir_url_preview_application('colors', 'https://evil.example.com')$$,
  '22023', null, 'A-11 : hôte hors liste autorisée refusé');
select throws_ok($$select public.plateforme_definir_url_preview_application('colors', 'https://colors.elsatia.fr')$$,
  '22023', null, 'A-11 : URL de Production refusée comme URL Preview');
select throws_ok($$select public.plateforme_definir_url_preview_application('colors', 'https://colors-preview.vercel.app.evil.com')$$,
  '22023', null, 'A-11 : suffixe trompeur refusé');
select throws_ok($$select public.plateforme_definir_url_preview_application('colors', 'https://colors-preview.vercel.app/login?next=https://evil.example.com')$$,
  '22023', null, 'A-11 : chemin / requête refusés (origine stricte, pas d''open redirect)');
select throws_ok($$select public.plateforme_definir_url_preview_application('colors', 'https://user:pass@colors-preview.vercel.app')$$,
  '22023', null, 'A-11 : identifiants dans l''URL refusés');
select throws_ok($$select public.plateforme_definir_url_preview_application('colors', '//colors-preview.vercel.app')$$,
  '22023', null, 'A-11 : URL relative au protocole refusée');
select throws_ok($$select public.plateforme_definir_url_preview_application('colors', 'https://colors-preview.vercel.app:8443')$$,
  '22023', null, 'A-11 : port explicite refusé');
select throws_ok($$select public.plateforme_definir_url_preview_application('inconnue', 'https://x-preview.vercel.app')$$,
  'P0002', null, 'A-11 : application inconnue refusée');

-- Propriétaire en AAL2 : URL valide, normalisée, journalisée.
select is(public.plateforme_definir_url_preview_application('colors', '  HTTPS://Colors-Preview-Git-Main.vercel.app/  '),
  'https://colors-preview-git-main.vercel.app', 'A-11 : URL valide acceptée et normalisée (origine, minuscules)');
reset role;
select is((select url_preview from public.applications_elsatia where code = 'colors'),
  'https://colors-preview-git-main.vercel.app', 'A-11 : url_preview écrite');
select is((select url_production from public.applications_elsatia where code = 'colors'),
  'https://colors.elsatia.fr', 'A-11 : url_production inchangée');
select is((select count(*) from public.historique_mutations_plateforme
           where domaine = 'multi_app' and action = 'url_preview_modifiee'
             and nouveau ->> 'application_code' = 'colors'
             and auteur_utilisateur_id = current_setting('elsatia.test_proprietaire_uid')::uuid), 1::bigint,
  'A-11 : la modification est journalisée avec son auteur');

-- Le lanceur sert désormais l'URL Preview au client habilité.
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source)
values ('a0000000-0000-0000-0000-000000000001', 'colors', true, 'test')
on conflict (entreprise_id, application_code) do update set autorise = true;
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code)
values ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'colors', 'colors_consultation')
on conflict (entreprise_id, utilisateur_id, application_code) do nothing;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select is((select url_preview from public.applications_autorisees('a0000000-0000-0000-0000-000000000001')
           where application_code = 'colors'), 'https://colors-preview-git-main.vercel.app',
  'A-11 : le lanceur du client habilité reçoit l''URL Preview');

-- Idempotence et effacement.
select set_config('request.jwt.claim.sub', current_setting('elsatia.test_proprietaire_uid'), true);
select set_config('request.jwt.claim.email', 'julien@elsatia.fr', true);
select is(public.plateforme_definir_url_preview_application('colors', 'https://colors-preview-git-main.vercel.app'),
  'https://colors-preview-git-main.vercel.app', 'A-11 : rejouer la même URL est sans effet de bord');
reset role;
select is((select count(*) from public.historique_mutations_plateforme
           where action = 'url_preview_modifiee' and nouveau ->> 'application_code' = 'colors'), 1::bigint,
  'A-11 : une valeur inchangée n''est pas journalisée une seconde fois');
set local role authenticated;
select ok(public.plateforme_definir_url_preview_application('colors', null) is null, 'A-11 : null efface url_preview');
reset role;
select ok((select url_preview is null from public.applications_elsatia where code = 'colors'), 'A-11 : url_preview effacée');

-- La validation applicative n'est pas l'autorité : la contrainte de table reste en place.
select throws_ok($$update public.applications_elsatia set url_preview = 'http://x.vercel.app' where code = 'colors'$$,
  '23514', null, 'A-11 : la contrainte https de la table reste la dernière barrière');

select * from finish();
rollback;
