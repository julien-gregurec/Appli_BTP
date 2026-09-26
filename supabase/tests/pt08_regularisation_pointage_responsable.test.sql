-- PT-08 : un responsable crée un pointage au nom d'un salarié, tracé comme
-- régularisation (creer_pointage_regularisation, 20260923000352).
--
-- Matrice : avant = aucun chemin (INSERT direct refusé même au dirigeant) ;
-- droit gerer_pointage requis ; motif, fenêtre de 31 jours, salarié actif et
-- chantier de la même entreprise contrôlés ; origine/auteur/motif tracés,
-- statut a_verifier puis workflow de validation existant ; salarié notifié ;
-- cross-tenant, changement de rôle, utilisateur désactivé, entreprise suspendue.

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

\ir fixtures/isolation_multitenant.inc

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Avant : aucun chemin direct.
-- ───────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$insert into public.pointages (entreprise_id, employe_id, chantier_id, date, heures_normales)
  values ('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a4000000-0000-0000-0000-000000000001', current_date - 1, 7)$$,
  '42501', null, '1. INSERT direct refusé même au dirigeant (policy WITH CHECK false) : la RPC est le seul chemin');

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Droit requis.
-- ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.creer_pointage_regularisation('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000004','a4000000-0000-0000-0000-000000000001', current_date - 1, '08:00','17:00', 60, 'Oubli de téléphone')$$,
  '42501', 'POINTAGE_REGULARISATION_REFUSEE', '2. negative witness : un ouvrier (sans gerer_pointage) ne peut pas saisir pour autrui');

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Création par le conducteur (gerer_pointage) au nom de l'ouvrier.
-- ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select lives_ok($$select public.creer_pointage_regularisation('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a4000000-0000-0000-0000-000000000001', current_date - 1, '08:00','17:00', 60, 'Téléphone oublié, présence confirmée par le chef')$$,
  '3. positive witness : le conducteur crée le pointage de l''ouvrier');
reset role;

select is((select count(*)::int from public.pointages where origine_pointage='regularisation_responsable'), 1, '4. une ligne créée, origine regularisation_responsable');
select is((select employe_id::text from public.pointages where origine_pointage='regularisation_responsable'), 'a2000000-0000-0000-0000-000000000002', '5. au nom du salarié, pas de l''auteur');
select is((select regularise_par::text from public.pointages where origine_pointage='regularisation_responsable'), '10000000-0000-0000-0000-000000000004', '6. auteur tracé (regularise_par)');
select is((select verification_statut from public.pointages where origine_pointage='regularisation_responsable'), 'a_verifier', '7. statut initial a_verifier (workflow PT-05/PT-06)');
select is((select (heures_normales + heures_supplementaires)::numeric from public.pointages where origine_pointage='regularisation_responsable'), 8.00::numeric, '8. heures calculées : 08:00-17:00 moins 60 min de pause = 8 h');
select is((select commentaire from public.pointages where origine_pointage='regularisation_responsable'), 'Téléphone oublié, présence confirmée par le chef', '9. motif conservé');
select is((select count(*)::int from public.notifications_utilisateurs where utilisateur_id='10000000-0000-0000-0000-000000000002' and type='pointage_regularise'), 1, '10. le salarié est notifié du pointage saisi à son nom');

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Contrôles métier.
-- ───────────────────────────────────────────────────────────────────────────
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok($$select public.creer_pointage_regularisation('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a4000000-0000-0000-0000-000000000001', current_date - 2, '08:00','17:00', 60, '')$$,
  'P0001', null, '11. motif vide refusé');
select throws_ok($$select public.creer_pointage_regularisation('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a4000000-0000-0000-0000-000000000001', current_date - 2, '08:00','17:00', 60, 'abc')$$,
  'P0001', null, '12. motif trop court refusé');
select throws_ok($$select public.creer_pointage_regularisation('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a4000000-0000-0000-0000-000000000001', current_date + 1, '08:00','17:00', 60, 'Date future')$$,
  'P0001', null, '13. date future refusée');
select throws_ok($$select public.creer_pointage_regularisation('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a4000000-0000-0000-0000-000000000001', current_date - 40, '08:00','17:00', 60, 'Trop ancienne')$$,
  'P0001', null, '14. au-delà de 31 jours refusé');
select throws_ok($$select public.creer_pointage_regularisation('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a4000000-0000-0000-0000-000000000001', current_date - 2, '08:00','08:05', 0, 'Durée trop courte')$$,
  'P0001', null, '15. durée < 15 min refusée');
select throws_ok($$select public.creer_pointage_regularisation('a0000000-0000-0000-0000-000000000001','b2000000-0000-0000-0000-000000000002','a4000000-0000-0000-0000-000000000001', current_date - 2, '08:00','17:00', 60, 'Salarié d''une autre entreprise')$$,
  'P0001', null, '16. cross-tenant : salarié de B refusé depuis A');
select throws_ok($$select public.creer_pointage_regularisation('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','b4000000-0000-0000-0000-000000000001', current_date - 2, '08:00','17:00', 60, 'Chantier d''une autre entreprise')$$,
  'P0001', null, '17. cross-tenant : chantier de B refusé depuis A');
reset role;

-- Salarié sorti : refusé.
select set_config('request.jwt.claims', '', true);
update public.employes set statut = 'sorti' where id = 'a2000000-0000-0000-0000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok($$select public.creer_pointage_regularisation('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000003','a4000000-0000-0000-0000-000000000001', current_date - 2, '08:00','17:00', 60, 'Salarié sorti')$$,
  'P0001', null, '18. salarié inactif (sorti) refusé');

-- Dirigeant B visant l'entreprise A : refusé.
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$select public.creer_pointage_regularisation('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a4000000-0000-0000-0000-000000000001', current_date - 2, '08:00','17:00', 60, 'Tentative cross-tenant')$$,
  '42501', 'POINTAGE_REGULARISATION_REFUSEE', '19. cross-tenant : dirigeant B (tous droits chez B) refusé sur A');

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Lecture et workflow.
-- ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.pointages where origine_pointage='regularisation_responsable'), 1, '20. le salarié voit le pointage saisi à son nom');
select set_config('request.jwt.claims','{"sub":"20000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.pointages where origine_pointage='regularisation_responsable'), 0, '21. cross-tenant : ouvrier B ne le voit pas');

select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select lives_ok($$select public.valider_preuve_pointage('a0000000-0000-0000-0000-000000000001', (select id from public.pointages where origine_pointage='regularisation_responsable'), 'valide', null)$$,
  '22. le pointage de régularisation passe par la validation existante');
reset role;
select is((select verification_statut from public.pointages where origine_pointage='regularisation_responsable'), 'valide', '23. validé');

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Session : changement de rôle, utilisateur désactivé, entreprise suspendue.
-- ───────────────────────────────────────────────────────────────────────────
select set_config('request.jwt.claims', '', true);
update public.utilisateurs_entreprises set poste_id = 'a1000000-0000-0000-0000-000000000004'
 where utilisateur_id = '10000000-0000-0000-0000-000000000002' and entreprise_id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok($$select public.creer_pointage_regularisation('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000004','a4000000-0000-0000-0000-000000000001', current_date - 3, '07:30','16:00', 30, 'Promu conducteur en session')$$,
  '24. changement de rôle (ouvrier -> conducteur) : droit acquis sans reconnexion');
reset role;

select set_config('request.jwt.claims', '', true);
update public.utilisateurs_entreprises set statut = 'desactive'
 where utilisateur_id = '10000000-0000-0000-0000-000000000004' and entreprise_id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select throws_ok($$select public.creer_pointage_regularisation('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a4000000-0000-0000-0000-000000000001', current_date - 4, '08:00','17:00', 60, 'Compte désactivé')$$,
  '42501', 'POINTAGE_REGULARISATION_REFUSEE', '25. utilisateur désactivé : refusé sur un JWT encore valide');
reset role;

select set_config('request.jwt.claims', '', true);
update public.entreprises set abonnement_statut = 'suspendu' where id = 'a0000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$select public.creer_pointage_regularisation('a0000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000002','a4000000-0000-0000-0000-000000000001', current_date - 4, '08:00','17:00', 60, 'Entreprise suspendue')$$,
  '42501', 'POINTAGE_REGULARISATION_REFUSEE', '26. entreprise suspendue : refusé même au dirigeant');
reset role;

select * from finish();
rollback;
