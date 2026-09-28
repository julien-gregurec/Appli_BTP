-- ELSATIA — Baseline performance V1 : planning réaliste pour le tenant principal de la fixture GP
-- (la fixture d'origine ne peuple pas `affectations`, lues par /planning et /dashboard).
-- Une affectation par salarié actif et par jour ouvré, de J-56 à J+28, sur un chantier tiré
-- au sort (tirage corrélé au jour). Base jetable uniquement ; rejouable (ne recrée rien).
select setseed(0.42);
insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures, tache, type_activite)
select e.entreprise_id, c.id, e.id, d::date, 7, 'Intervention planifiée (fixture)', 'chantier'
from public.employes e
cross join generate_series(current_date - 56, current_date + 28, interval '1 day') d
join lateral (
  select ch.id from public.chantiers ch
  where ch.entreprise_id = e.entreprise_id and ch.statut in ('en_cours', 'prospect') and d is not null
  order by random() limit 1
) c on true
where e.entreprise_id = 'a0000000-0000-4000-a000-000000000001' and e.statut = 'actif'
  and extract(isodow from d) < 6
  and not exists (select 1 from public.affectations a where a.entreprise_id = e.entreprise_id and a.tache = 'Intervention planifiée (fixture)');
analyze public.affectations;
select count(*) affectations from public.affectations where entreprise_id = 'a0000000-0000-4000-a000-000000000001';
