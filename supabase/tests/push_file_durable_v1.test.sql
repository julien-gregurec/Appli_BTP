-- ELSATIA PERFORMANCE HARDENING V9.1 — P1-A : file durable des notifications push
-- (migration 20261003001501, ex-20261003000101 du lot perf). Témoin : ROUGE sur V9.1 (fonctions absentes), VERT après.
-- Contrat complet (50 → 10 000, budget, jours sans cron) :
--   scripts/perf/hardening/tests/push_file_contract.test.sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

\ir fixtures/isolation_multitenant.inc

update public.notifications_utilisateurs set push_envoyee_at = now() where push_envoyee_at is null;

-- 0. Droits : service_role seul.
select ok(has_function_privilege('service_role', 'public.push_reserver_lot_service(integer,integer,integer,integer,integer)', 'execute')
      and not has_function_privilege('authenticated', 'public.push_reserver_lot_service(integer,integer,integer,integer,integer)', 'execute')
      and not has_function_privilege('anon', 'public.push_reserver_lot_service(integer,integer,integer,integer,integer)', 'execute'),
  'réservation de lot : service_role seul');
select ok(has_function_privilege('service_role', 'public.push_reserver_notification_service(uuid,integer,integer)', 'execute')
      and not has_function_privilege('authenticated', 'public.push_reserver_notification_service(uuid,integer,integer)', 'execute'),
  'réservation unitaire : service_role seul');
select ok(has_function_privilege('service_role', 'public.push_echec_notification_service(uuid,integer)', 'execute')
      and not has_function_privilege('authenticated', 'public.push_echec_notification_service(uuid,integer)', 'execute'),
  'échec : service_role seul');
select ok(not has_function_privilege('authenticated', 'public.push_file_etat_service()', 'execute'), 'état de file : pas pour authenticated');

-- 1. A : 60 notifications, B : 2.
insert into public.notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre, created_at)
select 'a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'file_v1', 'A' || g, now() - interval '3 hours' + g * interval '1 second'
from generate_series(1, 60) g;
insert into public.notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre, created_at)
select 'b0000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'file_v1', 'B' || g, now() - interval '1 hour' + g * interval '1 second'
from generate_series(1, 2) g;

create temp table lot1 as select * from public.push_reserver_lot_service(10, 5);
select is((select count(*)::int from lot1), 7, 'lot borné et équitable : 5 de A (plafond par tenant) + 2 de B');
select is((select count(distinct entreprise_id)::int from lot1), 2, 'les deux tenants servis dans le même lot');
select ok((select bool_and(n.titre in ('A1','A2','A3','A4','A5','B1','B2')) from lot1 join public.notifications_utilisateurs n on n.id = lot1.id),
  'ordre : les plus anciennes de chaque tenant');

create temp table lot2 as select * from public.push_reserver_lot_service(100, 100);
select is((select count(*)::int from lot2 where id in (select id from lot1)), 0, 'une notification réservée n''est pas re-réservée');
select is((select count(*)::int from lot2), 55, 'le second worker prend tout le reste');
select ok(not public.push_reserver_notification_service((select id from lot1 limit 1)), 'le webhook ne prend pas une notification tenue par le cron');

-- 2. Bail échu : un worker mort libère ses notifications.
update public.notifications_utilisateurs set push_reservee_jusqua = now() - interval '1 second' where id in (select id from lot1);
select is((select count(*)::int from public.push_reserver_lot_service(100, 100)), 7, 'bail échu : notifications reprises');

-- 3. Envoi : marquée, plus jamais préparée ni réservée.
select public.push_marquer_notification_envoyee_service(id) from lot2;
select ok((select bool_and(push_envoyee_at is not null and push_reservee_jusqua is null) from public.notifications_utilisateurs where id in (select id from lot2)),
  'marquage : envoyée et bail libéré');
select is(public.push_preparer_notification_service((select id from lot2 limit 1)), null, 'une notification envoyée n''est plus préparée');

-- 4. Échec : réessai différé, puis abandon explicite au maximum de tentatives.
select is(public.push_echec_notification_service((select id from lot1 where entreprise_id = 'b0000000-0000-0000-0000-000000000001' limit 1)),
  'reessai', 'premier échec : réessai');
select ok((select push_reessai_apres > now() from public.notifications_utilisateurs
           where id = (select id from lot1 where entreprise_id = 'b0000000-0000-0000-0000-000000000001' limit 1)), 'réessai différé (backoff)');
update public.notifications_utilisateurs set push_tentatives = 5, push_reservee_jusqua = null, push_reessai_apres = null
 where id = (select id from lot1 where entreprise_id = 'b0000000-0000-0000-0000-000000000001' limit 1);
select is((select count(*)::int from public.push_reserver_lot_service(100, 100) l
           where l.id = (select id from lot1 where entreprise_id = 'b0000000-0000-0000-0000-000000000001' limit 1)), 0,
  'tentatives épuisées : plus réservée');
select is((select push_abandon_motif from public.notifications_utilisateurs
           where id = (select id from lot1 where entreprise_id = 'b0000000-0000-0000-0000-000000000001' limit 1)),
  'tentatives_epuisees', 'poison : sortie explicite de la file, motif tracé');

-- 5. Expiration explicite (7 jours), jamais silencieuse.
insert into public.notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre, created_at)
values ('a0000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'file_v1', 'vieille', now() - interval '8 days');
select is((select count(*)::int from public.push_reserver_lot_service(100, 100) l join public.notifications_utilisateurs n on n.id = l.id where n.titre = 'vieille'), 0,
  'notification de plus de 7 jours : non poussée');
select is((select push_abandon_motif from public.notifications_utilisateurs where titre = 'vieille'), 'expiree', 'expiration tracée');

select * from finish();
rollback;
