-- Annuaire plateforme en lecture pure (migration 20261002000813).
-- PostgREST exécute une fonction STABLE/IMMUTABLE dans une transaction en lecture seule :
-- une telle fonction ne doit jamais atteindre une écriture. Régression constatée sur la
-- Preview hébergée : « cannot execute UPDATE in a read-only transaction » dans /plateforme.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

-- 1. Structure : l'annuaire reste STABLE et n'appelle plus l'écriture des suspensions.
select is(
  (select provolatile::text from pg_proc
    where oid = 'public.plateforme_annuaire_entreprises(text,text,text,text,integer,integer,jsonb)'::regprocedure),
  's', 'annuaire : toujours STABLE (lecture pure, pas de VOLATILE de contournement)'
);
select unalike(
  regexp_replace(pg_get_functiondef('public.plateforme_annuaire_entreprises(text,text,text,text,integer,integer,jsonb)'::regprocedure), '--[^\n]*', '', 'g'),
  '%appliquer_suspensions_impayes%',
  'annuaire : aucun appel à appliquer_suspensions_impayes()'
);

-- 2. Garde générale : aucune fonction STABLE/IMMUTABLE (SQL ou PL/pgSQL) des schémas applicatifs
--    n'écrit, directement ou via les fonctions qu'elle appelle (3 niveaux).
select is_empty($$
  with recursive fns as (
    select p.oid, p.proname, p.provolatile,
           regexp_replace(lower(pg_get_functiondef(p.oid)), '--[^\n]*', '', 'g') as def
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'private', 'stripe_attestation')
       and p.prokind = 'f'
       and p.prolang in (select oid from pg_language where lanname in ('sql', 'plpgsql'))
  ), ecrit as (
    select oid from fns
     where def ~ '(^|[^a-z_])(update\s+[a-z_."]+\s+set|insert\s+into|delete\s+from|truncate|nextval\s*\(|refresh\s+materialized)'
        or def ~ '(^|[^a-z_])for\s+(no\s+key\s+)?(update|share)([^a-z_]|$)'
  ), arbre(oid, chemin, niveau) as (
    select oid, proname::text, 0 from fns where provolatile in ('s', 'i')
    union
    select c.oid, a.chemin || ' > ' || c.proname, a.niveau + 1
      from arbre a
      join fns pa on pa.oid = a.oid
      join fns c on c.oid <> a.oid and pa.def ~ ('[^a-z_]' || c.proname || '\s*\(')
     where a.niveau < 3
  )
  select distinct a.chemin from arbre a join ecrit e on e.oid = a.oid
$$, 'aucune fonction STABLE/IMMUTABLE n''atteint une écriture');

-- 3. Le chemin d'écriture explicite reste en place et réservé à la clé de service.
select ok(not has_function_privilege('authenticated', 'public.appliquer_suspensions_impayes()', 'execute'),
  'appliquer_suspensions_impayes : refusée à authenticated');
select ok(not has_function_privilege('anon', 'public.appliquer_suspensions_impayes()', 'execute'),
  'appliquer_suspensions_impayes : refusée à anon');
select ok(has_function_privilege('service_role', 'public.appliquer_suspensions_impayes()', 'execute'),
  'appliquer_suspensions_impayes : accordée à service_role (cron)');

update public.entreprises
   set abonnement_statut = 'actif', suspension_prevue_at = now() - interval '1 day'
 where id = 'b0000000-0000-0000-0000-000000000001';
select ok(public.appliquer_suspensions_impayes() >= 1, 'cron : la suspension échue est matérialisée');
select is((select abonnement_statut from public.entreprises where id = 'b0000000-0000-0000-0000-000000000001'),
  'suspendu', 'cron : statut écrit « suspendu »');

-- 4. Comportement en transaction LECTURE SEULE, comme PostgREST : l'annuaire se charge,
--    montre le statut effectif et n'écrit rien.
update public.entreprises
   set abonnement_statut = 'actif', suspension_prevue_at = now() - interval '1 hour'
 where id = 'a0000000-0000-0000-0000-000000000001';

set local transaction_read_only = on;
set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);
select set_config('request.jwt.claim.email', 'plateforme@invalid.local', true);
select set_config('request.jwt.claims',
  '{"sub":"30000000-0000-0000-0000-000000000001","email":"plateforme@invalid.local","role":"authenticated","aal":"aal2"}', true);

select lives_ok(
  $$select public.plateforme_annuaire_entreprises()$$,
  'annuaire : se charge dans une transaction en lecture seule'
);
select is(
  (select l->>'abonnement_statut'
     from jsonb_array_elements(public.plateforme_annuaire_entreprises('', 'toutes', 'nom', 'asc', 1, 100, '{}'::jsonb)->'lignes') l
    where l->>'id' = 'a0000000-0000-0000-0000-000000000001'),
  'suspendu', 'annuaire : suspension échue affichée « suspendu » sans écriture'
);
select ok(
  exists (select 1
            from jsonb_array_elements(public.plateforme_annuaire_entreprises('', 'suspendues', 'nom', 'asc', 1, 100, '{}'::jsonb)->'lignes') l
           where l->>'id' = 'a0000000-0000-0000-0000-000000000001'),
  'annuaire : onglet « suspendues » cohérent avec le statut effectif'
);
select ok(
  not exists (select 1
                from jsonb_array_elements(public.plateforme_annuaire_entreprises('', 'actives', 'nom', 'asc', 1, 100, '{}'::jsonb)->'lignes') l
               where l->>'id' = 'a0000000-0000-0000-0000-000000000001'),
  'annuaire : absente de l''onglet « actives »'
);
reset role;
select is((select abonnement_statut from public.entreprises where id = 'a0000000-0000-0000-0000-000000000001'),
  'actif', 'annuaire : aucune écriture en base (statut stocké inchangé)');
select is(current_setting('transaction_read_only'), 'on', 'le test s''est bien exécuté en lecture seule');

select * from finish();
rollback;
