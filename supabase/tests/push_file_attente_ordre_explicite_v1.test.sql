-- 20261002001901 : la file du cron de secours push est servie plus anciennes d'abord.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, email) values ('7a000000-0000-4000-a000-0000000000a1', 'push-ordre@test.invalid');
insert into public.entreprises (id, nom) values ('7a000000-0000-4000-a000-000000000001', 'Push ordre');

-- Les plus RÉCENTES sont écrites physiquement en premier.
insert into public.notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre, created_at)
select '7a000000-0000-4000-a000-000000000001', '7a000000-0000-4000-a000-0000000000a1', 'test', 'recent:' || g,
       timestamptz '2026-10-01 20:00+00' + g * interval '1 minute'
from generate_series(1, 150) g;
insert into public.notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre, created_at)
select '7a000000-0000-4000-a000-000000000001', '7a000000-0000-4000-a000-0000000000a1', 'test', 'ancien:' || g,
       timestamptz '2026-10-01 04:00+00' + g * interval '1 minute'
from generate_series(1, 150) g;

select ok(
  pg_get_functiondef('public.push_notifications_en_attente_service(timestamptz,integer)'::regprocedure) ~* 'order\s+by',
  'la RPC trie explicitement');

select is(
  (select count(*)::int
     from public.push_notifications_en_attente_service(timestamptz '2026-10-01 02:45+00', 200) x
     join public.notifications_utilisateurs n on n.id = x.id
    where n.titre like 'ancien:%'),
  150,
  'un passage de 200 prend d''abord les 150 plus anciennes');

select is(
  (select array_agg(x.id) from public.push_notifications_en_attente_service(timestamptz '2026-10-01 02:45+00', 200) x),
  (select array_agg(x.id) from public.push_notifications_en_attente_service(timestamptz '2026-10-01 02:45+00', 200) x),
  'deux lectures identiques renvoient le même ordre');

select ok(
  not has_function_privilege('authenticated', 'public.push_notifications_en_attente_service(timestamptz,integer)', 'execute')
  and has_function_privilege('service_role', 'public.push_notifications_en_attente_service(timestamptz,integer)', 'execute'),
  'droits inchangés : service_role seul');

select * from finish();
rollback;
