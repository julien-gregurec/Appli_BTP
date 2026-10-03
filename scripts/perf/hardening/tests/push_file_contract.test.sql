-- ELSATIA PERFORMANCE HARDENING V9.1 — P1-A : contrat de la file push (cron de secours).
--
-- Le MÊME fichier tourne avant et après le correctif :
--   * avant (V9.1 @ 24a0c2e9) : passage = route historique
--     push_notifications_en_attente_service(now - 25 h, 200), chaque id marqué ;
--     une notification « poison » (préparation en échec) reste en attente (le code
--     historique sort sans marquer) ;
--   * après (migration 20261003000101) : passage = nouvelle route : lots
--     push_reserver_lot_service(100, 25) jusqu'à file vide (ou budget simulé),
--     chaque id marqué ; un poison appelle push_echec_notification_service.
-- Le temps est simulé en DÉCALANT les données vers le passé (created_at, bail,
-- réessai) : les deux algorithmes lisent now().
--
-- Base : migrations + scripts/perf/generate_fixture.sql (tenants a000…/b000…).
--   su postgres -c "pg_prove -d <base> scripts/perf/hardening/tests/push_file_contract.test.sql"
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select plan(19);

update notifications_utilisateurs set push_envoyee_at = '2000-01-01' where push_envoyee_at is null;

insert into entreprises
select (jsonb_populate_record(null::entreprises,
  to_jsonb(e) || jsonb_build_object('id','c0000000-0000-4000-c000-000000000001','siret','84211111100015','nom','Contrat C','reference_interne','ENT-CONTRAT-C','code_adhesion',null))).*
from entreprises e where e.id = 'a0000000-0000-4000-a000-000000000001';
insert into auth.users (id, email) values ('c0000000-0000-4000-c000-0000000000aa', 'c-admin@contrat.invalid');

create temp table cron_log (passage int, rang int, id uuid);
create temp table horloge (passage int);
insert into horloge values (0);

create function pg_temp.nouveau() returns boolean language sql as $$
  select to_regprocedure('public.push_reserver_lot_service(integer,integer,integer,integer,integer)') is not null $$;

create function pg_temp.utilisateur(p_ent uuid) returns uuid language sql as $$
  select coalesce(
    (select ue.utilisateur_id from utilisateurs_entreprises ue where ue.entreprise_id = p_ent order by ue.utilisateur_id limit 1),
    'c0000000-0000-4000-c000-0000000000aa'::uuid) $$;

-- p_age_debut : âge (par rapport à maintenant) de la PREMIÈRE notification ; les suivantes
-- sont plus jeunes de p_pas.
create function pg_temp.semer(p_ent uuid, p_n int, p_age_debut interval, p_pas interval, p_tag text)
returns void language sql as $$
  insert into notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre, created_at)
  select p_ent, pg_temp.utilisateur(p_ent), 'contrat', p_tag || ':' || g, now() - p_age_debut + (g - 1) * p_pas
  from generate_series(1, p_n) g $$;

-- Fait « vieillir » toutes les notifications du contrat (le temps passe).
create function pg_temp.avancer(p_duree interval) returns void language plpgsql as $$
begin
  update notifications_utilisateurs set created_at = created_at - p_duree where type = 'contrat';
  if pg_temp.nouveau() then
    execute 'update notifications_utilisateurs set push_reservee_jusqua = push_reservee_jusqua - $1,
               push_reessai_apres = push_reessai_apres - $1 where type = ''contrat''' using p_duree;
  end if;
end $$;

-- Un passage du cron. p_lots_max simule le budget de temps de la route (null = illimité).
create function pg_temp.passage(p_lots_max int default null) returns int language plpgsql as $$
declare r record; k int := 0; v_num int; v_lots int := 0; v_n int;
begin
  update horloge set passage = passage + 1 returning passage into v_num;
  if pg_temp.nouveau() then
    loop
      exit when p_lots_max is not null and v_lots >= p_lots_max;
      v_n := 0;
      for r in execute 'select l.id, n.titre from push_reserver_lot_service(100, 25) l
                          join notifications_utilisateurs n on n.id = l.id' loop
        v_n := v_n + 1; k := k + 1;
        insert into cron_log values (v_num, k, r.id);
        if r.titre like 'poison:%' then
          execute 'select push_echec_notification_service($1)' using r.id;
        else
          perform push_marquer_notification_envoyee_service(r.id);
        end if;
      end loop;
      exit when v_n = 0;
      v_lots := v_lots + 1;
    end loop;
  else
    for r in select x.id, n.titre from push_notifications_en_attente_service(now() - interval '25 hours', 200) x
             join notifications_utilisateurs n on n.id = x.id loop
      k := k + 1;
      insert into cron_log values (v_num, k, r.id);
      if r.titre not like 'poison:%' then
        perform push_marquer_notification_envoyee_service(r.id);
      end if;
    end loop;
  end if;
  return k;
end $$;

create function pg_temp.reinit() returns void language sql as $$
  delete from notifications_utilisateurs where type = 'contrat';
  truncate cron_log $$;

-- « Perdue » = ni envoyée, ni sortie explicitement de la file, et plus jamais
-- sélectionnable par le cron historique (hors fenêtre de 25 h) — ou, pour la
-- nouvelle file, toujours en attente après les passages.
create function pg_temp.non_traitees() returns int language sql as $$
  select count(*)::int from notifications_utilisateurs n
  where n.type = 'contrat' and n.push_envoyee_at is null
    and (not pg_temp.nouveau() or (to_jsonb(n) ->> 'push_abandonnee_at') is null) $$;

-- Deux passages quotidiens : N notifications créées sur les 23 h précédant le passage 1.
create function pg_temp.scenario_n(p_n int) returns int language plpgsql as $$
begin
  perform pg_temp.reinit();
  perform pg_temp.semer('a0000000-0000-4000-a000-000000000001', p_n, interval '24 hours', (interval '23 hours') / p_n, 'n' || p_n);
  perform pg_temp.passage();
  perform pg_temp.avancer(interval '24 hours');
  perform pg_temp.passage();
  return pg_temp.non_traitees();
end $$;

select is(pg_temp.scenario_n(50),    0, 'A1 N=50 : rien de perdu');
select is(pg_temp.scenario_n(199),   0, 'A2 N=199 : rien de perdu');
select is(pg_temp.scenario_n(200),   0, 'A3 N=200 : rien de perdu');
select is(pg_temp.scenario_n(201),   0, 'A4 N=201 : rien de perdu');
select is(pg_temp.scenario_n(300),   0, 'A5 N=300 : rien de perdu');
select is(pg_temp.scenario_n(1000),  0, 'A6 N=1000 : rien de perdu');
select is(pg_temp.scenario_n(10000), 0, 'A7 N=10000 : rien de perdu');

-- A8 aucune notification traitée deux fois sur l'ensemble des scénarios précédents (N=10000).
select is((select count(*) - count(distinct id) from cron_log)::int, 0, 'A8 N=10000 : chaque notification traitée une seule fois');

-- A9 ordre : à budget limité (1 lot), les plus anciennes passent d'abord, même écrites en dernier.
select pg_temp.reinit();
select pg_temp.semer('a0000000-0000-4000-a000-000000000001', 150, interval '8 hours', interval '1 minute', 'recent');
select pg_temp.semer('a0000000-0000-4000-a000-000000000001', 150, interval '23 hours', interval '1 minute', 'ancien');
select pg_temp.passage(1);
select ok(
  (select count(*) from cron_log l join notifications_utilisateurs n on n.id = l.id where n.titre like 'ancien:%')
  = (select count(*) from cron_log) and (select count(*) from cron_log) > 0,
  'A9 à budget limité, seules les plus anciennes sont prises (ordre explicite)');

-- A10 reprise après un jour sans cron : 20 notifications de la veille, cron du jour sauté.
select pg_temp.reinit();
select pg_temp.semer('b0000000-0000-4000-b000-000000000001', 20, interval '41 hours', interval '10 minutes', 'panne');
select pg_temp.passage();
select is(pg_temp.non_traitees(), 0, 'A10 un jour de cron manqué ne perd aucune notification');

-- A11 équité : A a 1000 notifications anciennes, B et C une seule ; un lot unique sert les trois.
select pg_temp.reinit();
select pg_temp.semer('a0000000-0000-4000-a000-000000000001', 1000, interval '23 hours', interval '30 seconds', 'floodA');
select pg_temp.semer('b0000000-0000-4000-b000-000000000001', 1, interval '2 hours', interval '0', 'B');
select pg_temp.semer('c0000000-0000-4000-c000-000000000001', 1, interval '1 hour', interval '0', 'C');
select pg_temp.passage(1);
select is(
  (select count(distinct n.entreprise_id)::int from cron_log l join notifications_utilisateurs n on n.id = l.id),
  3, 'A11 un seul lot sert les trois tenants (pas de famine par un tenant volumineux)');

-- A12 concurrence : deux réservations successives avant tout marquage ne se recouvrent pas
-- (le cron historique, lui, relit les mêmes ids).
select pg_temp.reinit();
select pg_temp.semer('a0000000-0000-4000-a000-000000000001', 50, interval '3 hours', interval '1 minute', 'conc');
create function pg_temp.reserver() returns setof uuid language plpgsql as $$
begin
  if pg_temp.nouveau() then
    return query execute 'select id from push_reserver_lot_service(30, 30)';
  else
    return query select id from push_notifications_en_attente_service(now() - interval '25 hours', 30);
  end if;
end $$;
create temp table r1 as select pg_temp.reserver() id;
create temp table r2 as select pg_temp.reserver() id;
select is((select count(*)::int from r1 where id in (select id from r2)), 0,
  'A12 deux workers ne réservent jamais les mêmes notifications');
select is((select count(*)::int from r1) + (select count(*)::int from r2), 50,
  'A13 les deux workers se partagent toute la file (30 + 20)');

-- A14/A15 poison : 200 notifications dont la préparation échoue, plus anciennes que 50 saines.
select pg_temp.reinit();
select pg_temp.semer('a0000000-0000-4000-a000-000000000001', 200, interval '20 hours', interval '1 second', 'poison');
select pg_temp.semer('a0000000-0000-4000-a000-000000000001', 50, interval '10 hours', interval '1 second', 'sain');
select pg_temp.passage();
select pg_temp.avancer(interval '7 hours'); select pg_temp.passage();
select pg_temp.avancer(interval '7 hours'); select pg_temp.passage();
select is(
  (select count(*)::int from notifications_utilisateurs where type = 'contrat' and titre like 'sain:%' and push_envoyee_at is null),
  0, 'A14 200 poisons ne bloquent pas les notifications saines');
select pg_temp.avancer(interval '7 hours'); select pg_temp.passage();
select pg_temp.avancer(interval '7 hours'); select pg_temp.passage();
select pg_temp.avancer(interval '7 hours'); select pg_temp.passage();
select is(pg_temp.non_traitees(), 0,
  'A15 un poison sort explicitement de la file après le maximum de tentatives (aucun en attente perpétuelle)');

-- A16 retry : une notification en échec transitoire est retentée puis envoyée.
select pg_temp.reinit();
select pg_temp.semer('b0000000-0000-4000-b000-000000000001', 1, interval '1 hour', interval '0', 'poison');
select pg_temp.passage();
update notifications_utilisateurs set titre = 'retabli:1' where type = 'contrat';
select pg_temp.avancer(interval '10 minutes');
select pg_temp.passage();
select ok(
  (select push_envoyee_at is not null from notifications_utilisateurs where type = 'contrat'),
  'A16 après un échec transitoire, la notification est retentée et envoyée');

-- A17 budget borné : 10 000 en attente, 10 lots par passage (1 000) : chaque passage
-- progresse, cinq passages quotidiens (dont 1 jour sauté) vident la file sans perte.
select pg_temp.reinit();
select pg_temp.semer('a0000000-0000-4000-a000-000000000001', 6000, interval '23 hours', interval '1 second', 'gros');
select pg_temp.semer('b0000000-0000-4000-b000-000000000001', 4000, interval '23 hours', interval '1 second', 'gros');
create function pg_temp.jours_budget() returns int language plpgsql as $$
declare j int;
begin
  for j in 1..12 loop
    perform pg_temp.passage(10);
    perform pg_temp.avancer(interval '24 hours');
    if j = 3 then perform pg_temp.avancer(interval '24 hours'); end if;
  end loop;
  return pg_temp.non_traitees();
end $$;
select is(pg_temp.jours_budget(), 0, 'A17 10 000 à budget borné : la file se vide sur plusieurs passages, rien de perdu');
select is((select count(*) - count(distinct id) from cron_log)::int, 0, 'A18 budget borné : aucune notification traitée deux fois');

-- A19 pas de sortie silencieuse : toute notification non envoyée porte un motif explicite.
select is(
  (select count(*)::int from notifications_utilisateurs n where n.type = 'contrat' and n.push_envoyee_at is null
     and (not pg_temp.nouveau() or (to_jsonb(n) ->> 'push_abandon_motif') is null)),
  0, 'A19 aucune notification non envoyée sans état explicite');

select * from finish();
rollback;
