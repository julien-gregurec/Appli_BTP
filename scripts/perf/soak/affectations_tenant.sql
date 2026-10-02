-- ELSATIA SOAK V1 — affectations planning longues périodes pour un tenant volumétrique k
-- (créé par volume_tenant.sql) : chaque salarié actif, chaque jour ouvré sur :jours jours
-- (passés et futurs : -jours/2 .. +jours/2), un chantier en rotation.
-- Usage : psql -d soak -v k=22 -v jours=365 -f affectations_tenant.sql
\set ON_ERROR_STOP 1
\set ent '\'e0000000-0000-4000-e000-0000000000' :k '\''
set client_min_messages = warning;
alter table public.affectations disable trigger notifications_affectations;
with ch as (select id, row_number() over (order by id) - 1 n, count(*) over () total from public.chantiers where entreprise_id = :ent),
emp as (select id, row_number() over (order by id) - 1 n from public.employes where entreprise_id = :ent and statut = 'actif'),
jours as (select d::date jour from generate_series(current_date - :jours / 2, current_date + :jours / 2, interval '1 day') d where extract(isodow from d) < 6)
insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures, tache, notes, type_activite)
select :ent, ch.id, emp.id, jours.jour, 7.5, 'Soak', 'soak', 'chantier'
from emp cross join jours join ch on ch.n = (emp.n / 4 + (jours.jour - date '2020-01-06') / 7) % ch.total;
alter table public.affectations enable trigger notifications_affectations;
analyze public.affectations;
select :k k, count(*) affectations from public.affectations where entreprise_id = :ent;
