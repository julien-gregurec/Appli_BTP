-- ELSATIA SOAK V1 — Domaine F : cron de secours des notifications push.
-- Tests ROUGES (hors suite CI supabase/tests) : ils décrivent le comportement
-- attendu ; sur la tête 877a4b9 ils échouent et prouvent le défaut.
--
-- Exécution (base migrée + fixture scripts/perf/generate_fixture.sql) :
--   su postgres -c "pg_prove -d soak scripts/perf/soak/tests/cron_push_red.test.sql"
--
-- Simulation : un « passage du cron » = exactement ce que fait
-- src/app/api/cron/notifications-push/route.ts : RPC
-- push_notifications_en_attente_service(now - 25 h, 200), puis, pour chaque id,
-- traiterNotificationPush() qui marque TOUJOURS la notification (finally).
-- L'horloge est simulée par p_depuis (la RPC n'utilise pas now()).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(12);

-- Isolation : on neutralise les notifications de la fixture.
update notifications_utilisateurs set push_envoyee_at = '2000-01-01' where push_envoyee_at is null;

-- Troisième tenant C (clone de A) pour l'équité.
insert into entreprises
select (jsonb_populate_record(null::entreprises,
  to_jsonb(e) || jsonb_build_object('id','c0000000-0000-4000-c000-000000000001','siret','84211111100015','nom','Soak C','reference_interne','ENT-SOAK-C','code_adhesion',null))).*
from entreprises e where e.id = 'a0000000-0000-4000-a000-000000000001';
insert into auth.users (id, email) values ('c0000000-0000-4000-c000-0000000000aa', 'c-admin@soak.invalid');

create temp table cron_log (passage int, rang int, id uuid);

create function pg_temp.utilisateur(p_ent uuid) returns uuid language sql as $$
  select coalesce(
    (select ue.utilisateur_id from utilisateurs_entreprises ue where ue.entreprise_id = p_ent order by ue.utilisateur_id limit 1),
    'c0000000-0000-4000-c000-0000000000aa'::uuid) $$;

create function pg_temp.semer(p_ent uuid, p_n int, p_debut timestamptz, p_pas interval, p_tag text)
returns void language sql as $$
  insert into notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre, created_at)
  select p_ent, pg_temp.utilisateur(p_ent), 'soak', p_tag || ':' || g, p_debut + (g - 1) * p_pas
  from generate_series(1, p_n) g $$;

-- Un passage du cron à l'instant simulé p_maintenant ; renvoie le nombre traité.
create function pg_temp.passage(p_num int, p_maintenant timestamptz) returns int language plpgsql as $$
declare r record; k int := 0;
begin
  for r in select id from push_notifications_en_attente_service(p_maintenant - interval '25 hours', 200) loop
    k := k + 1;
    insert into cron_log values (p_num, k, r.id);
    perform push_marquer_notification_envoyee_service(r.id);
  end loop;
  return k;
end $$;

create function pg_temp.reinit() returns void language sql as $$
  delete from notifications_utilisateurs where type = 'soak';
  truncate cron_log $$;

create function pg_temp.restantes() returns int language sql as $$
  select count(*)::int from notifications_utilisateurs where type = 'soak' and push_envoyee_at is null $$;

-- T = passage quotidien du 2026-10-02 03:45 UTC (vercel.json « 45 3 * * * »).
-- Les notifications sont créées entre T-24h et T-1h (toutes dans la fenêtre de 25 h).
-- F1..F6 : N = 50, 199, 200, 201, 300, 1000 — après DEUX passages quotidiens
-- consécutifs, aucune notification ne doit rester définitivement non traitée.
create function pg_temp.scenario_n(p_n int) returns int language plpgsql as $$
begin
  perform pg_temp.reinit();
  perform pg_temp.semer('a0000000-0000-4000-a000-000000000001', p_n,
    timestamptz '2026-10-01 03:45+00', (interval '23 hours') / p_n, 'n' || p_n);
  perform pg_temp.passage(1, timestamptz '2026-10-02 03:45+00');
  perform pg_temp.passage(2, timestamptz '2026-10-03 03:45+00');
  return pg_temp.restantes();
end $$;

select is(pg_temp.scenario_n(50),   0, 'F1 N=50 : tout est traité');
select is(pg_temp.scenario_n(199),  0, 'F2 N=199 : tout est traité');
select is(pg_temp.scenario_n(200),  0, 'F3 N=200 : tout est traité');
select is(pg_temp.scenario_n(201),  0, 'F4 N=201 : la 201e notification n''est jamais perdue (fenêtre 25 h + plafond 200)');
select is(pg_temp.scenario_n(300),  0, 'F5 N=300 : aucune notification perdue');
select is(pg_temp.scenario_n(1000), 0, 'F6 N=1000 : aucune notification perdue');

-- F7 Ordre déterministe : le premier passage traite les PLUS ANCIENNES d'abord.
-- On insère 300 notifications dont les plus anciennes sont écrites physiquement
-- en dernier (cas réel : rattrapage d'un webhook en échec, import, restauration).
select pg_temp.reinit();
select pg_temp.semer('a0000000-0000-4000-a000-000000000001', 150, timestamptz '2026-10-01 20:00+00', interval '1 minute', 'recent');
select pg_temp.semer('a0000000-0000-4000-a000-000000000001', 150, timestamptz '2026-10-01 04:00+00', interval '1 minute', 'ancien');
select pg_temp.passage(1, timestamptz '2026-10-02 03:45+00');
select is(
  (select count(*)::int from cron_log l join notifications_utilisateurs n on n.id = l.id where n.titre like 'ancien:%'),
  150,
  'F7 le passage traite d''abord les 150 plus anciennes (ordre explicite created_at)');

-- F8 la définition SQL de la RPC porte un ORDER BY explicite.
select ok(
  pg_get_functiondef('public.push_notifications_en_attente_service(timestamptz,integer)'::regprocedure) ~* 'order\s+by',
  'F8 push_notifications_en_attente_service trie explicitement');

-- F9 Panne d'un jour : le cron du 2026-10-02 n'a pas tourné. Les 20 notifications
-- créées le 2026-10-01 doivent être traitées par le passage du 2026-10-03.
select pg_temp.reinit();
select pg_temp.semer('b0000000-0000-4000-b000-000000000001', 20, timestamptz '2026-10-01 10:00+00', interval '10 minutes', 'panne');
select pg_temp.passage(1, timestamptz '2026-10-03 03:45+00');
select is(pg_temp.restantes(), 0, 'F9 un jour de cron manqué ne perd aucune notification');

-- F10 Équité : A a 1000 notifications anciennes en attente, B et C une seule
-- chacune (plus récente). Un passage doit servir chaque tenant en attente.
select pg_temp.reinit();
select pg_temp.semer('a0000000-0000-4000-a000-000000000001', 1000, timestamptz '2026-10-01 04:00+00', interval '30 seconds', 'floodA');
select pg_temp.semer('b0000000-0000-4000-b000-000000000001', 1, timestamptz '2026-10-02 02:00+00', interval '0', 'B');
select pg_temp.semer('c0000000-0000-4000-c000-000000000001', 1, timestamptz '2026-10-02 02:30+00', interval '0', 'C');
select pg_temp.passage(1, timestamptz '2026-10-02 03:45+00');
select is(
  (select count(distinct n.entreprise_id)::int from cron_log l join notifications_utilisateurs n on n.id = l.id),
  3,
  'F10 un passage sert les trois tenants (pas de famine par un tenant volumineux)');

-- F11 Reprise : après un passage, le passage suivant reprend exactement les restantes
-- (même instant simulé : rattrapage manuel immédiat).
select pg_temp.reinit();
select pg_temp.semer('a0000000-0000-4000-a000-000000000001', 450, timestamptz '2026-10-01 05:00+00', interval '1 minute', 'reprise');
select pg_temp.passage(1, timestamptz '2026-10-02 03:45+00');
select pg_temp.passage(2, timestamptz '2026-10-02 03:46+00');
select pg_temp.passage(3, timestamptz '2026-10-02 03:47+00');
select ok(
  pg_temp.restantes() = 0
  and (select count(*) from cron_log) = 450
  and (select count(distinct id) from cron_log) = 450,
  'F11 trois passages immédiats traitent les 450, chacune exactement une fois (reprise correcte)');

-- F12 Concurrence : deux exécutions simultanées (retry Vercel, déclenchement manuel)
-- lisent la file AVANT que l'une ou l'autre marque : elles ne doivent pas obtenir
-- les mêmes notifications (sinon double push sur le téléphone).
select pg_temp.reinit();
select pg_temp.semer('a0000000-0000-4000-a000-000000000001', 50, timestamptz '2026-10-02 01:00+00', interval '1 minute', 'conc');
select is(
  (select count(*)::int from push_notifications_en_attente_service(timestamptz '2026-10-01 02:45+00', 200) x
     where x.id in (select id from push_notifications_en_attente_service(timestamptz '2026-10-01 02:45+00', 200))),
  0,
  'F12 deux lectures concurrentes ne réservent pas les mêmes notifications');

select * from finish();
rollback;
