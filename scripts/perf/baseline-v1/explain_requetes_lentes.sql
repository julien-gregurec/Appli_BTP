-- ELSATIA — Baseline performance V1 : EXPLAIN ANALYZE des requêtes réellement lentes relevées par
-- pg_stat_statements pendant les campagnes HTTP (jeu gros), rejouées sous le rôle authenticated
-- (RLS active) avec le compte de banc du tenant principal. Transaction annulée. Formes SQL reprises
-- de ce que PostgREST exécute pour chaque page (filtres, tri, plafond max_rows = 1 000).
\set ON_ERROR_STOP 1
begin;
select set_config('request.jwt.claims', '{"sub":"facc0000-0000-4000-a000-000000000001","role":"authenticated"}', true),
       set_config('request.jwt.claim.sub', 'facc0000-0000-4000-a000-000000000001', true) \gset
set local role authenticated;
\echo '### R1 /pointage/gestion : pointages du mois (toute l''entreprise)'
explain (analyze, buffers, costs off, summary on)
select p.id, p.date, p.heures_normales, p.heures_supplementaires, p.verification_statut,
  (select row_to_json(e) from (select e.id, e.prenom, e.nom from public.employes e where e.id = p.employe_id) e) employe,
  (select row_to_json(c) from (select c.id, c.nom from public.chantiers c where c.id = p.chantier_id) c) chantier
from public.pointages p
where p.entreprise_id = 'a0000000-0000-4000-a000-000000000001'
  and p.date >= to_char(date_trunc('month', current_date), 'YYYY-MM-DD')::date and p.date <= current_date
order by p.date desc limit 1000;
\echo '### R2 /devis/:id : lignes d''un devis de 1 000 lignes'
select devis_id as dv from public.lignes_devis group by 1 order by count(*) desc limit 1 \gset
explain (analyze, buffers, costs off, summary on)
select * from public.lignes_devis where devis_id = :'dv' order by ordre limit 1000;
\echo '### R3 /chantiers : chantiers_liste_paginee (peut_consulter_chantier avant LIMIT)'
explain (analyze, buffers, costs off, summary on)
select public.chantiers_liste_paginee('a0000000-0000-4000-a000-000000000001', null, null, 1, 25);
\echo '### R4 /planning et /pointage/gestion : liste des chantiers ouverts (RLS peut_consulter_chantier par ligne)'
explain (analyze, buffers, costs off, summary on)
select c.id, c.nom from public.chantiers c
where c.entreprise_id = 'a0000000-0000-4000-a000-000000000001' and not c.statut = any ('{archive,annule}')
order by c.nom limit 1000;
\echo '### R5 /planning : affectations de la semaine'
explain (analyze, buffers, costs off, summary on)
select a.id, a.date, a.heures,
  (select row_to_json(c) from (select c.id, c.nom from public.chantiers c where c.id = a.chantier_id) c) chantier,
  (select row_to_json(e) from (select e.id, e.prenom, e.nom from public.employes e where e.id = a.employe_id) e) employe
from public.affectations a
where a.entreprise_id = 'a0000000-0000-4000-a000-000000000001'
  and a.date >= date_trunc('week', current_date)::date and a.date <= (date_trunc('week', current_date) + interval '6 days')::date
order by a.date limit 1000;
rollback;
