-- ELSATIA-GLOBAL-OWNER-ALL-APPS-ACCESS-V1
-- Prouve que le propriétaire global accède à toutes les applications actives — y compris
-- une application inconnue au moment de ce lot — sans habilitation manuelle, et que rien
-- de ce mécanisme n'ouvre les données métier d'une entreprise ni n'affaiblit AAL2.

begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

\ir fixtures/isolation_multitenant.inc

-- ── Décor ────────────────────────────────────────────────────────────────────
-- Le compte Auth du propriétaire est résolu depuis la ligne `proprietaire` : le test
-- ne réécrit jamais la décision produit portée par la migration.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
)
select '00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-00000000000f',
       'authenticated', 'authenticated', pa.email, crypt('test', gen_salt('bf')),
       now(), now(), now()
from public.plateforme_admins pa where pa.proprietaire
on conflict do nothing;

select set_config(
  'elsatia.test_proprietaire_uid',
  (select u.id::text from auth.users u
   join public.plateforme_admins pa on lower(pa.email) = lower(u.email)
   where pa.proprietaire limit 1),
  true
);

insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values (
  '30000000-0000-0000-0000-0000000000fa',
  current_setting('elsatia.test_proprietaire_uid')::uuid,
  'test-owner-totp', 'totp', 'verified', now(), now(), 'secret'
);

insert into public.utilisateurs (id, prenom, nom)
values (current_setting('elsatia.test_proprietaire_uid')::uuid, 'Propriétaire', 'ELSATIA')
on conflict (id) do nothing;

-- Administrateur plateforme délégué, rôle `lecture` : sert de témoin « admin non total ».
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000', '30000000-0000-0000-0000-000000000002',
  'authenticated', 'authenticated', 'delegue-lecture@invalid.local', crypt('test', gen_salt('bf')),
  now(), now(), now()
) on conflict do nothing;
insert into public.plateforme_admins (
  email, role, utilisateur_id, actif, statut_identite, activation_at
) values (
  'delegue-lecture@invalid.local', 'lecture', '30000000-0000-0000-0000-000000000002',
  true, 'active', now()
) on conflict (email) do nothing;

-- 1. La migration désigne bien une identité propriétaire unique, et sans droit tant
--    qu'elle n'est pas revendiquée.
select is(
  (select count(*) from public.plateforme_admins where proprietaire), 1::bigint,
  'une seule identité propriétaire est déclarée'
);
select is(
  (select email from public.plateforme_admins where proprietaire), 'julien@elsatia.fr',
  'le propriétaire global déclaré est julien@elsatia.fr'
);
select ok(
  not (select actif from public.plateforme_admins where proprietaire),
  'la désignation seule n''accorde aucun droit : l''identité reste inactive'
);

-- ── AAL1 : aucune opération plateforme sensible ──────────────────────────────
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('elsatia.test_proprietaire_uid'), true);
select set_config('request.jwt.claim.email', 'julien@elsatia.fr', true);
select set_config('request.jwt.claims', '{"aal":"aal1"}', true);

-- 2. Une session AAL1 ne peut pas revendiquer la propriété.
select throws_like(
  $$select public.plateforme_proprietaire_revendiquer()$$,
  '%AAL2%', 'AAL1 : la revendication de propriété est refusée'
);
select ok(
  not public.est_plateforme_proprietaire(),
  'avant revendication, aucun droit propriétaire n''est résolu'
);

-- 3. Un compte qui n'est pas le propriétaire ne peut pas revendiquer la propriété,
--    même en AAL2 avec un facteur MFA vérifié.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'admin-a@invalid.local', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
reset role;
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values ('10000000-0000-0000-0000-0000000000fa', '10000000-0000-0000-0000-000000000001',
        'test-admin-a-totp', 'totp', 'verified', now(), now(), 'secret');
set local role authenticated;
select throws_like(
  $$select public.plateforme_proprietaire_revendiquer()$$,
  '%pas le propriétaire%', 'un autre compte ne peut pas s''approprier l''identité propriétaire'
);

-- ── Revendication conforme ───────────────────────────────────────────────────
select set_config('request.jwt.claim.sub', current_setting('elsatia.test_proprietaire_uid'), true);
select set_config('request.jwt.claim.email', 'julien@elsatia.fr', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
select lives_ok(
  $$select public.plateforme_proprietaire_revendiquer()$$,
  'AAL2 + MFA vérifié + email confirmé : la revendication propriétaire aboutit'
);
select lives_ok(
  $$select public.plateforme_proprietaire_revendiquer()$$,
  'la revendication est idempotente'
);

-- 4. Rôle plateforme et qualité de propriétaire.
select is(public.plateforme_role_courant(), 'total', 'le propriétaire obtient le rôle plateforme total');
select ok(public.est_plateforme_proprietaire(), 'le propriétaire est reconnu comme propriétaire global');
select ok(public.plateforme_est_superuser(), 'le propriétaire est superuser applicatif');
select ok(public.est_plateforme_admin(), 'le propriétaire est administrateur plateforme');

-- 5. La revendication est tracée.
reset role;
select is(
  (select count(*) from public.plateforme_journal_actions
   where action = 'proprietaire_plateforme_revendique'), 1::bigint,
  'la revendication propriétaire est journalisée une seule fois'
);
set local role authenticated;

-- ── Accès applicatif : catalogue courant ─────────────────────────────────────
-- 6-8. Gestion Pro, Colors, Tools sans aucune habilitation ni accès entreprise.
select ok(public.a_acces_application('a0000000-0000-0000-0000-000000000001','gestion_pro'),
  'propriétaire : accès Gestion Pro sans habilitation');
select ok(public.a_acces_application('a0000000-0000-0000-0000-000000000001','colors'),
  'propriétaire : accès Colors sans habilitation');
select ok(public.a_acces_application('a0000000-0000-0000-0000-000000000001','tools'),
  'propriétaire : accès Tools sans habilitation');

-- 9. Tools : niveau Pro sans abonnement commercial ni ligne d'entitlement.
select is(public.tools_resoudre_entitlements()->>'tier', 'pro',
  'propriétaire : Tools résout Pro sans abonnement');
select is(public.tools_resoudre_entitlements()->>'source', 'plateforme',
  'la source Pro du propriétaire est identifiée comme plateforme, pas comme un achat');
-- Le niveau Pro du propriétaire est synthétisé à la lecture : il n'écrit jamais de
-- droit commercial, donc il ne peut pas fausser la facturation ni l'historique R9.
select is(
  (select count(*) from public.entitlements_utilisateurs_elsatia where source = 'plateforme'),
  0::bigint,
  'le Pro propriétaire n''écrit aucune ligne d''entitlement commercial'
);

-- 10. Contexte applicatif : le propriétaire sans entreprise reste administrable.
select ok(
  (select bool_or(est_admin_plateforme) from public.contexte_application_courant()),
  'le contexte applicatif partagé annonce le propriétaire comme administrateur plateforme'
);

-- ── Applications futures : Réserves et une application encore inconnue ───────
reset role;
insert into public.applications_elsatia (code, nom, description, ordre)
values ('reserves', 'ELSATIA Réserves', 'Application future du catalogue', 40),
       ('future_test_app', 'Application future inconnue', 'Ajoutée sans aucune habilitation', 90);
-- Aucune habilitation, aucun accès entreprise, aucun rôle applicatif n'est créé
-- pour ces deux applications : c'est précisément ce que le test doit prouver.
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('elsatia.test_proprietaire_uid'), true);
select set_config('request.jwt.claim.email', 'julien@elsatia.fr', true);

select ok(public.a_acces_application('a0000000-0000-0000-0000-000000000001','reserves'),
  'propriétaire : Réserves devient accessible dès son inscription au catalogue');
select ok(public.a_acces_application('a0000000-0000-0000-0000-000000000001','future_test_app'),
  'propriétaire : une application future inconnue est accessible sans habilitation');
select is(
  (select count(*) from public.applications_autorisees('a0000000-0000-0000-0000-000000000001')
   where application_code in ('gestion_pro','colors','tools','reserves','future_test_app')),
  5::bigint,
  'applications_autorisees renvoie tout le catalogue actif au propriétaire'
);

-- 11. Utilisateur normal : ni Réserves ni l'application future sans droit.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select ok(not public.a_acces_application('a0000000-0000-0000-0000-000000000001','future_test_app'),
  'utilisateur normal sans entitlement : application future refusée');
select is(
  (select count(*) from public.applications_autorisees('a0000000-0000-0000-0000-000000000001')
   where application_code = 'future_test_app'), 0::bigint,
  'utilisateur normal : l''application future n''apparaît pas dans son sélecteur'
);
select is(public.tools_resoudre_entitlements()->>'tier', 'free',
  'utilisateur normal sans entitlement : Tools reste Free');

-- 12. Utilisateur normal AVEC droit : le circuit commercial normal fonctionne toujours.
reset role;
insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source)
values ('a0000000-0000-0000-0000-000000000001','future_test_app', true, 'test');
insert into public.roles_applications_elsatia (application_code, code, nom)
values ('future_test_app', 'future_test_role', 'Rôle applicatif futur');
insert into public.habilitations_applications_utilisateurs (entreprise_id, utilisateur_id, application_code, role_code)
values ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','future_test_app','future_test_role');
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select ok(public.a_acces_application('a0000000-0000-0000-0000-000000000001','future_test_app'),
  'utilisateur normal avec accès entreprise + habilitation : application future autorisée');

-- ── Isolation multi-tenant : « accès total » ne perce pas les données métier ──
select set_config('request.jwt.claim.sub', current_setting('elsatia.test_proprietaire_uid'), true);
select set_config('request.jwt.claim.email', 'julien@elsatia.fr', true);
select is(
  (select count(*) from public.clients where entreprise_id = 'a0000000-0000-0000-0000-000000000001'),
  0::bigint,
  'propriétaire : aucune donnée client d''une entreprise tierce n''est lisible'
);
select is(
  (select count(*) from public.chantiers where entreprise_id = 'b0000000-0000-0000-0000-000000000001'),
  0::bigint,
  'propriétaire : aucun chantier d''une entreprise tierce n''est lisible'
);
select ok(
  not public.colors_action_autorisee('a0000000-0000-0000-0000-000000000001','modifier_seau'),
  'propriétaire : aucune écriture Colors sur une entreprise sans session support'
);

-- ── Admin délégué non `total` : aucun privilège propriétaire ─────────────────
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'delegue-lecture@invalid.local', true);
select ok(not public.est_plateforme_proprietaire(), 'admin délégué « lecture » : pas propriétaire');
select ok(not public.plateforme_est_superuser(), 'admin délégué « lecture » : pas superuser applicatif');
select is(public.tools_resoudre_entitlements()->>'tier', 'free',
  'admin délégué « lecture » : aucun Tools Pro offert');

-- ── L'identité propriétaire est protégée des administrateurs délégués ────────
-- Un second `total` actif existe (fixture) : la garde « dernier total actif » de 00237
-- ne suffirait donc plus à empêcher l'éviction du propriétaire.
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'plateforme@invalid.local', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
select throws_like(
  $$select public.plateforme_retirer_admin('julien@elsatia.fr')$$,
  '%ne peut pas être révoqué%',
  'un administrateur total délégué ne peut pas révoquer le propriétaire global'
);
select throws_like(
  $$select public.plateforme_modifier_role_admin('julien@elsatia.fr', 'lecture')$$,
  '%Accès total%',
  'un administrateur total délégué ne peut pas dégrader le rôle du propriétaire global'
);

-- ── Identité révoquée et compte banni ────────────────────────────────────────
reset role;
update public.plateforme_admins
set actif = false, statut_identite = 'revoquee', revocation_at = now(),
    revocation_origine = 'migration_technique', revocation_par = null, updated_at = now()
where proprietaire;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('elsatia.test_proprietaire_uid'), true);
select set_config('request.jwt.claim.email', 'julien@elsatia.fr', true);
select set_config('request.jwt.claims', '{"aal":"aal2"}', true);
select ok(not public.est_plateforme_proprietaire(),
  'identité propriétaire révoquée : aucun droit propriétaire');
select throws_like(
  $$select public.plateforme_proprietaire_revendiquer()$$,
  '%révoquée%', 'une identité révoquée ne se réactive pas elle-même'
);

reset role;
-- La machine à états de 00237 interdit un retour direct « révoquée → active » : on
-- repasse explicitement par le rattachement, comme le ferait un administrateur total.
update public.plateforme_admins
set statut_identite = 'rattachee_non_confirmee', actif = false, activation_at = null,
    revocation_at = null, revocation_origine = null, revocation_par = null, updated_at = now()
where proprietaire;
update public.plateforme_admins
set actif = true, statut_identite = 'active', activation_at = now(), updated_at = now()
where proprietaire;
update auth.users set banned_until = now() + interval '1 day'
where id = current_setting('elsatia.test_proprietaire_uid')::uuid;
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('elsatia.test_proprietaire_uid'), true);
select set_config('request.jwt.claim.email', 'julien@elsatia.fr', true);
select ok(not public.est_plateforme_proprietaire(),
  'compte propriétaire banni : le JWT encore valide n''accorde plus rien');
select ok(not public.plateforme_est_superuser(),
  'compte propriétaire banni : le contexte superuser applicatif disparaît');
select isnt(public.tools_resoudre_entitlements()->>'source', 'plateforme',
  'compte propriétaire banni : Tools ne s''appuie plus sur la source plateforme');

reset role;
select * from finish();
rollback;
