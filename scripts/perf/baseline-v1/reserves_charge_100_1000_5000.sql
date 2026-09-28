-- ELSATIA — Baseline performance V1 : trois chantiers Réserves de 100, 1 000 et 5 000 réserves.
--
-- Même construction que scripts/e2e/prepare-reserves-v6-charge.sql (tenant A du décor
-- isolation_multitenant.inc, organisation intervenante propre, triggers de numérotation et
-- d'historisation ACTIFS), à trois échelles, plus un historique réaliste (4 événements par
-- réserve en plus de la création : assignation, commentaire, demande de levée, modification).
-- Base jetable uniquement ; rejouable (ne recrée rien si le chantier est déjà peuplé).

begin;

insert into public.entreprises (id, nom, raison_sociale, siret, ville, code_adhesion)
select 'c0000000-0000-0000-0000-0000000000f1', 'PERF_INTERVENANT', 'PERF INTERVENANT SARL', '77777777700077', 'Colmar', 'PERF-F1'
where not exists (select 1 from public.entreprises where id = 'c0000000-0000-0000-0000-0000000000f1');

insert into public.acces_applications_entreprises (entreprise_id, application_code, autorise, source)
values ('c0000000-0000-0000-0000-0000000000f1', 'reserves', true, 'perf_baseline_v1')
on conflict (entreprise_id, application_code) do update set autorise = true;

with echelles(n, suffixe) as (values (100, '100'), (1000, '101'), (5000, '105'))
insert into public.reserves_chantiers (id, entreprise_id, nom, reference, ville, created_by)
select ('e0000000-0000-0000-0000-000000000' || suffixe)::uuid, 'a0000000-0000-0000-0000-000000000001',
  'PERF ' || n || ' reserves', 'PERF-' || n, 'Colmar', '10000000-0000-0000-0000-000000000001'
from echelles
on conflict (id) do nothing;

with echelles(n, suffixe) as (values (100, '100'), (1000, '101'), (5000, '105'))
insert into public.reserves_intervenants (id, entreprise_id, chantier_id, nom, corps_etat, statut,
  entreprise_intervenante_id, created_by, invite_at, rejoint_at, onboarding_statut)
select ('e2000000-0000-0000-0000-000000000' || suffixe)::uuid, 'a0000000-0000-0000-0000-000000000001',
  ('e0000000-0000-0000-0000-000000000' || suffixe)::uuid, 'Zperf — lot ' || n, 'Tous corps d''état', 'active',
  'c0000000-0000-0000-0000-0000000000f1', '10000000-0000-0000-0000-000000000001', now(), now(), 'rattachee'
from echelles
on conflict (id) do nothing;

with echelles(n, suffixe) as (values (100, '100'), (1000, '101'), (5000, '105'))
insert into public.reserves (entreprise_id, chantier_id, intervenant_id, titre, description, statut, priorite, echeance, cree_par)
select 'a0000000-0000-0000-0000-000000000001', ('e0000000-0000-0000-0000-000000000' || e.suffixe)::uuid,
  ('e2000000-0000-0000-0000-000000000' || e.suffixe)::uuid,
  'Perf n°' || g || ' — ' || (array['Peinture','Menuiserie','Plomberie','Électricité','Carrelage','Plâtrerie'])[1 + (g % 6)],
  'Réserve de mesure de capacité, lot ' || e.n || ', ligne ' || g || '.',
  (array['emise','assignee','acceptee','levee_demandee','levee'])[1 + (g % 5)],
  (array['basse','normale','haute','bloquante'])[1 + (g % 4)],
  current_date + ((g % 90) - 45),
  '10000000-0000-0000-0000-000000000001'
from echelles e
cross join lateral generate_series(1, e.n) g
where not exists (select 1 from public.reserves r where r.chantier_id = ('e0000000-0000-0000-0000-000000000' || e.suffixe)::uuid);

insert into public.reserves_historique (entreprise_id, reserve_id, action, statut_avant, statut_apres, commentaire, auteur_id, auteur_entreprise_id, created_at)
select r.entreprise_id, r.id, a.action, a.avant, a.apres, a.commentaire,
  '10000000-0000-0000-0000-000000000001', r.entreprise_id, r.created_at + (a.rang || ' hours')::interval
from public.reserves r
cross join (values
  (1, 'assignation', 'emise', 'assignee', null),
  (2, 'commentaire', null, null, 'Point vu avec l''entreprise sur site.'),
  (3, 'demande_levee', 'acceptee', 'levee_demandee', null),
  (4, 'modification', null, null, 'Échéance ajustée.')) as a(rang, action, avant, apres, commentaire)
where r.chantier_id in ('e0000000-0000-0000-0000-000000000100', 'e0000000-0000-0000-0000-000000000101', 'e0000000-0000-0000-0000-000000000105')
  and not exists (select 1 from public.reserves_historique h where h.reserve_id = r.id and h.action = 'modification');

commit;
analyze;

select c.reference, count(distinct r.id) reserves, count(h.id) historique
from public.reserves_chantiers c
join public.reserves r on r.chantier_id = c.id
left join public.reserves_historique h on h.reserve_id = r.id
where c.reference like 'PERF-%' group by 1 order by 1;
