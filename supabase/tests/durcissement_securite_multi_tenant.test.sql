begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

-- 1) entreprise_sans_membres a désormais un search_path épinglé (comme est_membre_actif).
select ok(
  (select array_to_string(p.proconfig, ',') like '%search_path=%'
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='entreprise_sans_membres'),
  'entreprise_sans_membres épingle son search_path');

-- 2) est_membre_actif reste épinglée (non-régression).
select ok(
  (select array_to_string(p.proconfig, ',') like '%search_path=%'
     from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='est_membre_actif'),
  'est_membre_actif épingle son search_path');

-- 3) Plus aucune policy ne s'appuie sur entreprise_sans_membres (clause fail-open retirée).
select is(
  (select count(*)::int from pg_policies
    where schemaname='public' and (qual like '%entreprise_sans_membres%' or with_check like '%entreprise_sans_membres%')),
  0,
  'Aucune policy RLS n''utilise plus entreprise_sans_membres (fail-open supprimé)');

-- 4) L'insertion d'appartenance exige d'être déjà membre actif (pas de bootstrap tenant vide côté RLS).
select is(
  (select count(*)::int from pg_policies
    where schemaname='public' and tablename='utilisateurs_entreprises' and cmd='INSERT'
      and with_check like '%est_membre_actif%' and with_check not like '%entreprise_sans_membres%'),
  1,
  'La policy INSERT sur utilisateurs_entreprises est fail-closed (est_membre_actif uniquement)');

-- 5/6) postes et permissions_poste : la policy de gestion ne dépend que de est_membre_actif.
select is(
  (select count(*)::int from pg_policies
    where schemaname='public' and tablename='postes' and qual like '%entreprise_sans_membres%'),
  0, 'postes : plus de clause entreprise_sans_membres');
select is(
  (select count(*)::int from pg_policies
    where schemaname='public' and tablename='permissions_poste' and qual like '%entreprise_sans_membres%'),
  0, 'permissions_poste : plus de clause entreprise_sans_membres');

-- 7) RLS activée sur compteurs_reference (défense en profondeur).
select ok(
  (select relrowsecurity from pg_class where oid='public.compteurs_reference'::regclass),
  'RLS active sur compteurs_reference');

select * from finish();
rollback;
