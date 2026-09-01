-- Migration 20260901000251 : statut d'identité dans « Équipe plateforme ».
--   * plateforme_lister_admins()           expose désormais statut_identite ;
--   * plateforme_statut_identite_courant() renvoie le statut de l'appelant ;
--   * l'activation passe exclusivement par plateforme_activer_admin (déjà couverte
--     pour AAL1/rôle/auto-activation/MFA par platform_aal2_role_integrity_v1) ;
--     on vérifie ici : identité en attente activée, identité déjà active sans
--     corruption, aucune entreprise créée, aucun accès anon/public.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

-- Cible « rattachée non confirmée » : compte Auth confirmé + MFA vérifié.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
  ('00000000-0000-0000-0000-000000000000','ef000000-0000-4000-8000-000000000001','authenticated','authenticated','pro-en-attente@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now()),
  ('00000000-0000-0000-0000-000000000000','ef000000-0000-4000-8000-000000000002','authenticated','authenticated','support-equipe@invalid.local',crypt('test',gen_salt('bf')),now(),now(),now())
on conflict(id) do nothing;

insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
values('ef000000-0000-4000-8000-0000000000f1','ef000000-0000-4000-8000-000000000001','totp','verified',now(),now())
on conflict(id) do nothing;

insert into public.plateforme_admins(email,role,utilisateur_id,actif,statut_identite,activation_at)
values
  ('pro-en-attente@invalid.local','total','ef000000-0000-4000-8000-000000000001',false,'rattachee_non_confirmee',null),
  ('support-equipe@invalid.local','support','ef000000-0000-4000-8000-000000000002',true,'active',now())
on conflict(email) do update
  set role=excluded.role, utilisateur_id=excluded.utilisateur_id, actif=excluded.actif,
      statut_identite=excluded.statut_identite, activation_at=excluded.activation_at;

-- ---------------------------------------------------------------------------
-- 1. Signatures & privilèges des deux fonctions.
-- ---------------------------------------------------------------------------
select ok(
  pg_get_function_result('public.plateforme_lister_admins()'::regprocedure) ilike '%statut_identite text%',
  'plateforme_lister_admins() renvoie une colonne statut_identite');
select ok(
  pg_get_function_result('public.plateforme_lister_admins()'::regprocedure) ilike '%actif boolean%',
  'plateforme_lister_admins() conserve la colonne actif');

select ok(has_function_privilege('authenticated','public.plateforme_statut_identite_courant()'::regprocedure,'EXECUTE'),
  'plateforme_statut_identite_courant : EXECUTE pour authenticated');
select ok(not has_function_privilege('anon','public.plateforme_statut_identite_courant()'::regprocedure,'EXECUTE'),
  'plateforme_statut_identite_courant : aucun EXECUTE pour anon');
select ok(
  not exists(select 1 from pg_proc p, aclexplode(p.proacl) a
             where p.oid='public.plateforme_statut_identite_courant()'::regprocedure
               and a.grantee=0 and a.privilege_type='EXECUTE'),
  'plateforme_statut_identite_courant : aucun EXECUTE pour PUBLIC');
select ok(not has_function_privilege('anon','public.plateforme_lister_admins()'::regprocedure,'EXECUTE'),
  'plateforme_lister_admins : aucun EXECUTE pour anon');
select ok((select p.prosecdef from pg_proc p where p.oid='public.plateforme_statut_identite_courant()'::regprocedure),
  'plateforme_statut_identite_courant : SECURITY DEFINER');

-- ---------------------------------------------------------------------------
-- 2. plateforme_lister_admins reste réservé à la permission gerer_equipe.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"ef000000-0000-4000-8000-000000000002","email":"support-equipe@invalid.local","role":"authenticated","aal":"aal2"}',true);
select throws_ok(
  $$select * from public.plateforme_lister_admins()$$,
  '42501','Permission plateforme refusée : gerer_equipe',
  'rôle support (sans gerer_equipe) : liste des admins refusée (42501)');

-- ---------------------------------------------------------------------------
-- 3. Un admin total actif voit les statuts d'identité.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select is(
  (select statut_identite from public.plateforme_lister_admins() where email='pro-en-attente@invalid.local'),
  'rattachee_non_confirmee', 'liste : identité en attente correctement étiquetée');
select is(
  (select statut_identite from public.plateforme_lister_admins() where email='plateforme@invalid.local'),
  'active', 'liste : identité active correctement étiquetée');

-- ---------------------------------------------------------------------------
-- 4. plateforme_statut_identite_courant : par UID, jamais par email.
-- ---------------------------------------------------------------------------
select is(public.plateforme_statut_identite_courant(),'active','appelant actif : statut = active');
select set_config('request.jwt.claims','{"sub":"ef000000-0000-4000-8000-000000000001","email":"pro-en-attente@invalid.local","role":"authenticated","aal":"aal2"}',true);
select is(public.plateforme_statut_identite_courant(),'rattachee_non_confirmee','identité en attente : statut exact renvoyé');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","email":"admin-a@invalid.local","role":"authenticated","aal":"aal2"}',true);
select is(public.plateforme_statut_identite_courant(),null,'utilisateur sans identité plateforme : NULL');

-- ---------------------------------------------------------------------------
-- 5. Activation via plateforme_activer_admin : identité en attente -> active,
--    aucune entreprise créée.
-- ---------------------------------------------------------------------------
reset role;
create temporary table _avant as select count(*) as n from public.entreprises;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select lives_ok(
  $$select public.plateforme_activer_admin('pro-en-attente@invalid.local')$$,
  'admin total AAL2 : activation de l''identité en attente autorisée');
select set_config('request.jwt.claims','{"sub":"ef000000-0000-4000-8000-000000000001","email":"pro-en-attente@invalid.local","role":"authenticated","aal":"aal2"}',true);
select is(public.plateforme_statut_identite_courant(),'active','après activation : la cible est active');
select ok(public.est_plateforme_admin(),'après activation : est_plateforme_admin() vrai pour la cible');
reset role;
select is((select count(*) from public.entreprises),(select n from _avant),
  'activation : aucune entreprise créée');

-- ---------------------------------------------------------------------------
-- 6. Identité déjà active : traitée sans corruption (échec propre).
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}',true);
select throws_ok(
  $$select public.plateforme_activer_admin('support-equipe@invalid.local')$$,
  'P0001','Identité non rattachée',
  'identité déjà active : activation refusée sans modification');
reset role;
select ok(
  (select actif and statut_identite='active' from public.plateforme_admins where email='support-equipe@invalid.local'),
  'identité déjà active : ligne inchangée (actif + active)');

select * from finish();
rollback;
