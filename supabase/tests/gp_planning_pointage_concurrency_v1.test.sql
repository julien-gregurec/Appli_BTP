-- GP-PLANNING-POINTAGE-CONCURRENCY-V1 : régression pour les deux correctifs de
-- concurrence appliqués par cette mission (20260922000315, 20260922000316).
-- pgTAP s'exécute dans une seule transaction/session : ces tests prouvent le
-- comportement déterministe des deux fonctions (idempotence, détection de
-- conflit, verrou optimiste) — la preuve de la vraie concurrence multi-session
-- (2 connexions simultanées, lost update, deadlock) a été faite séparément
-- avec des sessions psql parallèles réelles, voir
-- docs/qualification/ELSATIA_GP_PLANNING_POINTAGE_CONCURRENCY_V1.md § CONCURRENCY.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

\ir fixtures/isolation_multitenant.inc

-- ---------------------------------------------------------------------------
-- valider_preuve_pointage : idempotence + détection de conflit
-- ---------------------------------------------------------------------------
insert into public.pointages (
  id, entreprise_id, employe_id, chantier_id, date,
  heures_normales, heures_supplementaires, verification_statut
) values
  ('d5000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', current_date, 7, 0, 'a_verifier'),
  ('d5000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', current_date, 7, 0, 'a_verifier');

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
select set_config('request.jwt.claim.email', 'chef-equipe-a@invalid.local', true);

select lives_ok(
  $$select public.valider_preuve_pointage('a0000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'valide', 'ok')$$,
  'chef équipe A valide le pointage (première décision)'
);
select lives_ok(
  $$select public.valider_preuve_pointage('a0000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'valide', 'ok')$$,
  'rejouer exactement la même décision (double-clic/retry réseau) est un no-op silencieux, pas une erreur (cas G)'
);
select throws_like(
  $$select public.valider_preuve_pointage('a0000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000001', 'rejete', 'changement d''avis')$$,
  '%CONFLIT_CONCURRENCE_POINTAGE%',
  'remplacer une décision déjà prise par une décision différente lève un conflit explicite au lieu d''écraser silencieusement (cas A/B)'
);
select is(
  (select verification_statut from public.pointages where id = 'd5000000-0000-0000-0000-000000000001'),
  'valide',
  'la décision initiale reste inchangée après la tentative de conflit rejetée'
);
select is(
  (select commentaire_verification from public.pointages where id = 'd5000000-0000-0000-0000-000000000001'),
  'ok',
  'le commentaire initial n''a pas été écrasé par la tentative de conflit'
);

-- Suppression concurrente (cas C) : un pointage supprimé entre-temps reste un
-- "introuvable" propre, pas une exception non gérée.
delete from public.pointages where id = 'd5000000-0000-0000-0000-000000000002';
select throws_like(
  $$select public.valider_preuve_pointage('a0000000-0000-0000-0000-000000000001', 'd5000000-0000-0000-0000-000000000002', 'valide', null)$$,
  '%introuvable%',
  'valider un pointage supprimé entre-temps reste un échec propre (cas C), pas une exception SQL brute'
);
reset role;

-- ---------------------------------------------------------------------------
-- affectations.revision : colonne, incrément automatique, verrou optimiste
-- ---------------------------------------------------------------------------
insert into public.affectations (
  id, entreprise_id, chantier_id, employe_id, date, heures, type_activite
) values (
  'd6000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001',
  'a4000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002',
  current_date, 7, 'chantier'
);

-- trg_notifications_affectations (20260723000135) notifie aussi sur INSERT.
-- pgTAP exécute tout le fichier dans une seule transaction, où now() ne
-- avance pas entre les instructions : sans ce nettoyage, la notification
-- générée par la modification ci-dessous entrerait en collision avec celle
-- de cet INSERT sur notifications_evenement_unique (utilisateur_id, type,
-- ressource_id, created_at) — un artefact du banc de test pgTAP, pas un
-- défaut applicatif (en usage réel, chaque écriture a son propre now()).
delete from public.notifications_utilisateurs where ressource_id = 'd6000000-0000-0000-0000-000000000001';

select is(
  (select revision from public.affectations where id = 'd6000000-0000-0000-0000-000000000001'),
  1::bigint,
  'une affectation nouvellement créée démarre à la révision 1'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
select set_config('request.jwt.claim.email', 'conducteur-a@invalid.local', true);

-- Simule modifierAffectationAction : UPDATE conditionné à la révision lue par
-- le client (ici 1, la valeur réelle).
update public.affectations set heures = 6, tache = 'Modifié (révision correcte)'
  where id = 'd6000000-0000-0000-0000-000000000001' and entreprise_id = 'a0000000-0000-0000-0000-000000000001' and revision = 1;
select is(
  (select heures from public.affectations where id = 'd6000000-0000-0000-0000-000000000001'),
  6::numeric,
  'la modification avec la révision attendue (1) est appliquée'
);
select is(
  (select revision from public.affectations where id = 'd6000000-0000-0000-0000-000000000001'),
  2::bigint,
  'la révision est incrémentée automatiquement après la modification (2)'
);

-- Un deuxième appel avec la révision désormais périmée (1) ne modifie plus
-- rien — exactement le signal que modifierAffectationAction interprète comme
-- "modifiée par quelqu'un d'autre entre-temps" (cas A).
update public.affectations set heures = 5, tache = 'Modifié (révision périmée)'
  where id = 'd6000000-0000-0000-0000-000000000001' and entreprise_id = 'a0000000-0000-0000-0000-000000000001' and revision = 1;
select is(
  (select heures from public.affectations where id = 'd6000000-0000-0000-0000-000000000001'),
  6::numeric,
  'une modification avec une révision périmée (lost update) est ignorée : la valeur précédente est conservée'
);
reset role;

select * from finish();
rollback;
