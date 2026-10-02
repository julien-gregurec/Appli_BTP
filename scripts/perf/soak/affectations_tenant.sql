-- ELSATIA SOAK V1 — affectations planning longues périodes pour un tenant volumétrique k
-- (créé par volume_tenant.sql) : chaque salarié actif, chaque jour ouvré sur :jours jours
-- (-jours/2 .. +jours/2), un chantier en rotation.
-- Une transaction PAR SEMAINE : trg_verifier_heures_affectation prend un verrou consultatif
-- par ligne (pg_advisory_xact_lock) ; 42 000 lignes en une transaction épuisent la table des
-- verrous (« out of shared memory », constat SOAK V1 — sans impact applicatif : l'action
-- planning insère au plus un jour × N salariés par appel).
-- Usage : psql -d soak -v k=22 -v jours=365 -f affectations_tenant.sql
\set ON_ERROR_STOP 1
\set ent '\'e0000000-0000-4000-e000-0000000000' :k '\''
set client_min_messages = warning;
select set_config('soak.ent', :ent, false), set_config('soak.jours', :'jours', false);
alter table public.affectations disable trigger notifications_affectations;
do $$
declare v_ent uuid := current_setting('soak.ent')::uuid; v_j int := current_setting('soak.jours')::int; s date;
begin
  for s in select d::date from generate_series(date_trunc('week', current_date - v_j / 2), current_date + v_j / 2, interval '7 days') d loop
    with ch as (select id, row_number() over (order by id) - 1 n, count(*) over () total from public.chantiers where entreprise_id = v_ent),
    emp as (select id, row_number() over (order by id) - 1 n from public.employes where entreprise_id = v_ent and statut = 'actif'),
    jours as (select (s + k)::date jour from generate_series(0, 4) k)
    insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures, tache, notes, type_activite)
    select v_ent, ch.id, emp.id, jours.jour, 7.5, 'Soak', 'soak', 'chantier'
    from emp cross join jours join ch on ch.n = (emp.n / 4 + (jours.jour - date '2020-01-06') / 7) % ch.total
    on conflict do nothing;
    commit;
  end loop;
end $$;
alter table public.affectations enable trigger notifications_affectations;
analyze public.affectations;
select :k k, count(*) affectations from public.affectations where entreprise_id = :ent;
