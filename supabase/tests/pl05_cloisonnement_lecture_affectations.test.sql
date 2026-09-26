-- PL-05 : cloisonnement en lecture du planning — policy RESTRICTIVE
-- role_affectation_select + peut_consulter_affectation_employe (20260923000327).
--
-- Avant ce correctif, public.affectations n'avait en lecture que la policy
-- permissive 'membres affectations' (est_membre_actif) : tout membre actif voyait
-- le planning de toute l'entreprise. Matrice ici : le salarié voit ses lignes et
-- seulement les siennes / un poste avec droit de vue globale voit tout /
-- non-régression cross-tenant dans les deux sens.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

-- Planning de test : 1 affectation pour l'ouvrier A, 1 pour le conducteur A,
-- 1 pour l'ouvrier B. Dates distinctes pour ne pas heurter l'unicité de
-- notifications_affectations (created_at figé dans une transaction pgTAP).
insert into public.affectations (entreprise_id, chantier_id, employe_id, date, heures) values
  ('a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002', current_date,     7),
  ('a0000000-0000-0000-0000-000000000001','a4000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000004', current_date + 1, 7),
  ('b0000000-0000-0000-0000-000000000001','b4000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002', current_date + 2, 7);

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Le prédicat lui-même, hors RLS.
-- ───────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","email":"ouvrier-a@invalid.local","role":"authenticated"}', true);

select ok(
  public.peut_consulter_affectation_employe('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002'),
  '1. ouvrier A -> autorisé sur ses propres affectations (positive witness)'
);
select ok(
  not public.peut_consulter_affectation_employe('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000004'),
  '2. ouvrier A -> refusé sur les affectations d''un collègue (negative witness)'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Effet réel de la policy RESTRICTIVE, via SELECT.
-- ───────────────────────────────────────────────────────────────────────────
select is(
  (select count(*)::int from public.affectations),
  1,
  '3. ouvrier A ne lit qu''une ligne de planning : la sienne'
);
select bag_eq(
  $$select employe_id::text from public.affectations$$,
  $$values ('a2000000-0000-0000-0000-000000000002')$$,
  '3b. et c''est bien la sienne, pas celle d''un collègue'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Non-régression : un poste avec droit de vue globale voit tout le planning
--    de son entreprise. Conducteur travaux A porte gerer_planning.
-- ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","email":"conducteur-a@invalid.local","role":"authenticated"}', true);
select ok(
  public.a_permission('a0000000-0000-0000-0000-000000000001','gerer_planning'),
  '4. précondition : conducteur travaux A porte bien gerer_planning'
);
select is(
  (select count(*)::int from public.affectations),
  2,
  '5. conducteur travaux A voit tout le planning de son entreprise (non-régression PL-01/PL-04/PL-06)'
);

-- Dirigeant A (tous les droits) : idem.
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000006","email":"dirigeant-a@invalid.local","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.affectations),
  2,
  '6. dirigeant A (tous droits) voit tout le planning de son entreprise'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Cross-tenant : la restriction ne remplace pas le cloisonnement
--    inter-entreprises, elle s'y ajoute.
-- ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","email":"ouvrier-b@invalid.local","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.affectations),
  1,
  '7. ouvrier B ne lit que sa propre affectation'
);
select is(
  (select count(*)::int from public.affectations
     where entreprise_id='a0000000-0000-0000-0000-000000000001'),
  0,
  '8. ouvrier B ne lit aucune affectation de l''entreprise A (cross-tenant)'
);
select ok(
  not public.peut_consulter_affectation_employe('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002'),
  '9. le prédicat refuse aussi un employé d''un autre tenant'
);

-- Dirigeant B (tous les droits chez B) ne voit rien de A : un droit de vue
-- globale est global DANS son entreprise, pas au-delà.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000006","email":"dirigeant-b@invalid.local","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.affectations
     where entreprise_id='a0000000-0000-0000-0000-000000000001'),
  0,
  '10. dirigeant B, tous droits chez B, ne lit aucune affectation de A (cross-tenant)'
);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Un salarié sorti/suspendu ne lit plus son propre planning.
-- ───────────────────────────────────────────────────────────────────────────
reset role;
update public.employes set statut='sorti' where id='a2000000-0000-0000-0000-000000000002';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","email":"ouvrier-a@invalid.local","role":"authenticated"}', true);
select ok(
  not public.peut_consulter_affectation_employe('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002'),
  '11. salarié sorti -> ne lit plus son propre planning'
);

select * from finish();
rollback;
