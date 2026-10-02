-- ELSATIA_NEXT_MEMORY_CAPACITY_V1 — semaine de planning réaliste pour le tenant A de la
-- fixture perf (scripts/perf/generate_fixture.sql) : chaque salarié actif reçoit une
-- affectation chantier par jour ouvré, sur la semaine courante et les deux voisines.
-- Idempotent (supprime d'abord les affectations marquées « perf-memory »).
delete from public.affectations where entreprise_id = 'a0000000-0000-4000-a000-000000000001' and notes = 'perf-memory';
with ch as (
  select id, row_number() over (order by id) - 1 as n, count(*) over () as total
  from public.chantiers where entreprise_id = 'a0000000-0000-4000-a000-000000000001' and statut not in ('archive', 'annule')
), emp as (
  select id, row_number() over (order by id) - 1 as n
  from public.employes where entreprise_id = 'a0000000-0000-4000-a000-000000000001' and statut = 'actif'
), jours as (
  select d::date as jour from generate_series(date_trunc('week', current_date) - interval '7 days', date_trunc('week', current_date) + interval '13 days', interval '1 day') d
  where extract(isodow from d) < 6
)
insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures, tache, notes, type_activite)
select 'a0000000-0000-4000-a000-000000000001', ch.id, emp.id, jours.jour, 7.5,
       'Tâche ' || ((emp.n + extract(day from jours.jour)::int) % 9 + 1), 'perf-memory', 'chantier'
from emp cross join jours
join ch on ch.n = (emp.n / 3 + extract(isodow from jours.jour)::int) % ch.total;
select count(*) as affectations_perf from public.affectations where notes = 'perf-memory';
