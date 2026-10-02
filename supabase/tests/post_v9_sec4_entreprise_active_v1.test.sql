-- ELSATIA POST-V9 HARDENING V1 — SEC-4 (Security V2 §7 ; train V9 §4) :
-- « entreprise_active_id sans WITH CHECK ».
--
-- Défaut : la policy UPDATE « un utilisateur modifie son profil » (id = auth.uid(), sans
-- WITH CHECK) et le GRANT UPDATE (entreprise_active_id) à authenticated laissent un
-- utilisateur pointer son entreprise active vers N'IMPORTE QUELLE organisation par
-- PostgREST direct ; contexte_abonnement_courant() (SECURITY DEFINER) renvoie alors le
-- nom, la référence interne, le logo et le statut d'abonnement du tenant visé.
--
-- Témoin : ROUGE sur V9 (6392131a) — tests 1 à 4 ; VERT après
-- 20261002001302_post_v9_sec4_entreprise_active_garde_v1. Les parcours légitimes
-- (bascule vers sa propre entreprise, remise à NULL, création atomique, adhésion par
-- code, bascule Tools, modification du profil) restent ouverts.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

create or replace function pg_temp.agir(p uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', p::text, true);
  select set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at) values
  ('00000000-0000-0000-0000-000000000000', 'd4000000-0000-4000-8000-0000000000d4', 'authenticated', 'authenticated', 'nouveau@sec4.test', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'e4000000-0000-4000-8000-0000000000e4', 'authenticated', 'authenticated', 'demandeur@sec4.test', 'x', now(), now(), now());
insert into public.utilisateurs (id, prenom, nom) values
  ('d4000000-0000-4000-8000-0000000000d4', 'Nouveau', 'SEC4'),
  ('e4000000-0000-4000-8000-0000000000e4', 'Demandeur', 'SEC4')
on conflict (id) do nothing;

-- Le gérant A dispose aussi d'une seconde appartenance ACTIVE (B) pour la bascule Tools.
create temp table ctx as
  select (select code_adhesion from public.entreprises where id = 'b0000000-0000-0000-0000-000000000001') as code_b,
         (select nom from public.entreprises where id = 'b0000000-0000-0000-0000-000000000001') as nom_b;
grant select on ctx to authenticated;
update public.utilisateurs set entreprise_active_id = 'a0000000-0000-0000-0000-000000000001'
 where id = '10000000-0000-0000-0000-000000000002';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Exploit : un ouvrier de A pointe son entreprise active vers B (PostgREST direct)
-- ─────────────────────────────────────────────────────────────────────────────
select pg_temp.agir('10000000-0000-0000-0000-000000000002');
set local role authenticated;

select throws_ok(
  $$update public.utilisateurs set entreprise_active_id = 'b0000000-0000-0000-0000-000000000001'
    where id = '10000000-0000-0000-0000-000000000002'$$,
  '42501', null, 'SEC-4 : pointer son entreprise active vers un tenant étranger est refusé');
select is((select count(*)::int from public.contexte_abonnement_courant() where nom = (select nom_b from ctx)), 0,
  'SEC-4 : contexte_abonnement_courant ne révèle pas le nom du tenant visé');
select is((select entreprise_id from public.contexte_abonnement_courant()), 'a0000000-0000-0000-0000-000000000001'::uuid,
  'SEC-4 : le contexte reste celui de l''entreprise de l''utilisateur');
reset role;
select is((select entreprise_active_id from public.utilisateurs where id = '10000000-0000-0000-0000-000000000002'),
  'a0000000-0000-0000-0000-000000000001'::uuid, 'SEC-4 : entreprise active inchangée en base');

-- Variantes : entreprise inexistante, upsert ; aucune ne passe.
select pg_temp.agir('10000000-0000-0000-0000-000000000002');
set local role authenticated;
select throws_ok(
  $$update public.utilisateurs set entreprise_active_id = 'c0000000-0000-0000-0000-0000000000ff'
    where id = '10000000-0000-0000-0000-000000000002'$$,
  null, null, 'SEC-4 : une entreprise inexistante est refusée');
select throws_ok(
  $$insert into public.utilisateurs(id, prenom, nom, entreprise_active_id)
    values ('10000000-0000-0000-0000-000000000002', 'Ouvrier', 'A', 'b0000000-0000-0000-0000-000000000001')
    on conflict (id) do update set entreprise_active_id = excluded.entreprise_active_id$$,
  '42501', null, 'SEC-4 : la voie upsert est refusée aussi');

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Parcours légitimes
-- ─────────────────────────────────────────────────────────────────────────────
select lives_ok(
  $$update public.utilisateurs set prenom = 'Ouvrier modifié' where id = '10000000-0000-0000-0000-000000000002'$$,
  'Profil : modification du prénom sans toucher à l''entreprise active');
select lives_ok(
  $$update public.utilisateurs set entreprise_active_id = 'a0000000-0000-0000-0000-000000000001'
    where id = '10000000-0000-0000-0000-000000000002'$$,
  'Bascule vers sa propre entreprise (membre actif) autorisée');
select lives_ok(
  $$update public.utilisateurs set entreprise_active_id = null where id = '10000000-0000-0000-0000-000000000002'$$,
  'Remise à NULL autorisée');
select lives_ok(
  $$update public.utilisateurs set entreprise_active_id = 'a0000000-0000-0000-0000-000000000001'
    where id = '10000000-0000-0000-0000-000000000002'$$,
  'Retour vers sa propre entreprise après NULL autorisé');
reset role;

-- Création atomique d'entreprise (onboarding dirigeant) : appartenance créée AVANT la bascule.
select pg_temp.agir('d4000000-0000-4000-8000-0000000000d4');
set local role authenticated;
select lives_ok($$select public.creer_entreprise_bootstrap('SEC4 Nouvelle')$$, 'Onboarding : création atomique d''entreprise');
select is((select nom from public.contexte_abonnement_courant()), 'SEC4 Nouvelle', 'Onboarding : contexte de la nouvelle entreprise');
reset role;

-- Adhésion par code (demande en attente de validation) : chemin SECURITY DEFINER inchangé.
select pg_temp.agir('e4000000-0000-4000-8000-0000000000e4');
set local role authenticated;
select is((public.rejoindre_entreprise_par_code((select code_b from ctx)) ->> 'statut'), 'en_attente_validation',
  'Onboarding : adhésion par code toujours ouverte');
reset role;
select is((select entreprise_active_id from public.utilisateurs where id = 'e4000000-0000-4000-8000-0000000000e4'),
  'b0000000-0000-0000-0000-000000000001'::uuid, 'Onboarding : entreprise active posée par l''adhésion');

-- Bascule Tools entre deux appartenances actives.
insert into public.utilisateurs_entreprises(utilisateur_id, entreprise_id, poste_id, statut)
values ('10000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001', null, 'actif')
on conflict do nothing;
select pg_temp.agir('10000000-0000-0000-0000-000000000001');
set local role authenticated;
select lives_ok(
  $$update public.utilisateurs set entreprise_active_id = 'b0000000-0000-0000-0000-000000000001'
    where id = '10000000-0000-0000-0000-000000000001'$$,
  'Multi-appartenance : bascule directe vers une seconde entreprise dont on est membre actif');
reset role;

-- service_role / migrations (propriétaire) : non concernés par la garde.
select lives_ok(
  $$update public.utilisateurs set entreprise_active_id = 'b0000000-0000-0000-0000-000000000001'
    where id = '10000000-0000-0000-0000-000000000003'$$,
  'Propriétaire (migrations, fonctions SECURITY DEFINER) non bridé');

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Structure : la garde existe et tous les écrivains légitimes sont SECURITY DEFINER
-- ─────────────────────────────────────────────────────────────────────────────
select ok(exists (select 1 from pg_trigger where tgrelid = 'public.utilisateurs'::regclass
                  and tgname = 'utilisateurs_entreprise_active_garde' and not tgisinternal),
  'SEC-4 : déclencheur de garde présent sur utilisateurs');
select is((select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prosrc ilike '%set entreprise_active_id%' and not p.prosecdef
             and p.proname <> 'utilisateurs_entreprise_active_garde'), 0,
  'SEC-4 : toute fonction qui écrit entreprise_active_id est SECURITY DEFINER (hors garde)');

select * from finish();
rollback;
