-- TERRAIN-MOBILE-V1D2 : la suite V1C ne vérifiait que has_function_privilege
-- sur valider_preuve_pointage, jamais son exécution réelle — ce qui a laissé
-- passer une migration (20260819000218) dont le corps référençait des objets
-- inexistants (employes_cout_horaire, pointages.cout_horaire_applique) sur
-- le chemin p_statut = 'valide'. Ces tests appellent réellement la fonction
-- pour prouver qu'elle s'exécute, au lieu de se limiter aux privilèges.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

\ir fixtures/isolation_multitenant.inc

-- Pointages dédiés à ce test (statut initial a_verifier, pour prouver une
-- vraie transition plutôt que de rejouer sur des lignes déjà 'valide').
insert into public.pointages (
  id, entreprise_id, employe_id, chantier_id, date,
  heures_normales, heures_supplementaires, verification_statut
) values
  ('c5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', current_date, 7, 0, 'a_verifier'),
  ('c5000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', current_date, 7, 0, 'a_verifier');

-- Chef équipe A a valider_pointages (fixture) mais pas gerer_planning : rôle
-- métier réaliste pour valider un pointage terrain.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.email', 'chef-equipe-a@invalid.local', true);

select lives_ok(
  $$select public.valider_preuve_pointage('a0000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'valide', null)$$,
  'chef équipe A (valider_pointages) exécute réellement la validation sans erreur — ne référence plus employes_cout_horaire/cout_horaire_applique'
);
reset role;

select is(
  (select verification_statut from public.pointages where id = 'c5000000-0000-0000-0000-000000000001'),
  'valide',
  'le pointage passe bien au statut valide après l''appel'
);
select is(
  (select verification_par from public.pointages where id = 'c5000000-0000-0000-0000-000000000001'),
  '10000000-0000-0000-0000-000000000003'::uuid,
  'verification_par enregistre le validateur réel (auth.uid()), sans branche anon résiduelle'
);

-- Ouvrier A n'a pas valider_pointages : refus attendu, aucune fonctionnalité
-- de coût horaire à contourner ni à satisfaire.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
select set_config('request.jwt.claim.email', 'ouvrier-a@invalid.local', true);
select throws_like(
  $$select public.valider_preuve_pointage('a0000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'valide', null)$$,
  '%Accès refusé%',
  'ouvrier A (sans valider_pointages) ne peut pas valider un pointage'
);
reset role;
select is(
  (select verification_statut from public.pointages where id = 'c5000000-0000-0000-0000-000000000002'),
  'a_verifier',
  'le refus n''a rien modifié (vérifié en superuser)'
);

-- Cross-tenant : chef équipe A ne peut pas valider un pointage de B, même en
-- indiquant son propre entreprise_id (aucune ligne ne matche => "introuvable",
-- pas de fuite cross-tenant).
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.email', 'chef-equipe-a@invalid.local', true);
select throws_like(
  $$select public.valider_preuve_pointage('a0000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', 'valide', null)$$,
  '%introuvable%',
  'chef équipe A ne peut pas valider un pointage de l''entreprise B (isolation cross-tenant)'
);
reset role;

-- Non-régression : 'rejete' sans commentaire reste refusé, comportement
-- identique à Production, inchangé par le nettoyage anon.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.email', 'chef-equipe-a@invalid.local', true);
select throws_like(
  $$select public.valider_preuve_pointage('a0000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'rejete', null)$$,
  '%motif du rejet est obligatoire%',
  'rejeter un pointage sans commentaire reste refusé (comportement Production inchangé)'
);
reset role;

-- anon : ni le privilège EXECUTE, ni la possibilité d'utiliser le parcours
-- métier (la suite V1C prouve déjà l'absence de privilège ; ceci confirme
-- que l'appel réel échoue bien, pas seulement le catalogue de privilèges).
set local role anon;
select throws_like(
  $$select public.valider_preuve_pointage('a0000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000002', 'valide', null)$$,
  '%permission denied%',
  'anon ne peut pas appeler valider_preuve_pointage (ni privilège, ni contournement runtime)'
);
reset role;

select * from finish();
rollback;
