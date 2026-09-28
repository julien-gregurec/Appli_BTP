-- Train canonique V7 — complément du jeu d'upgrade V6 → V7 (scripts/qualification/upgrade-v6-v7.sh).
-- Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V7_CONVERGENCE_V1.md §11.
--
-- Chargé sur une base au train V6 (358 migrations, dernière 20260928000601) APRÈS le jeu V6
-- (jeu V3, compléments V3→V4, V4→V5, V5→V6, migrations V6). Il pose l'état réel d'une base V6
-- sur les domaines que V7 modifie (Relevé & Métré Lot 7, migration 20260928000701) :
--
--   1. Plan corrigé V5 du RDC « UPG5 » : ouverture enrichie des attributs de menuiserie Lot 6,
--      contour du Séjour ré-enregistré (5,20 × 4,00 m) → surface synchronisée par le serveur (V6),
--      puis plan corrigé FIGÉ « Corrigé V6 » (empreinte calculée par le `tools_releve_plan_contenu`
--      de V6, sans clé `equipements`) ;
--   2. plan « as built » dérivé de ce plan figé (copie des murs, de l'ouverture, du contour), non figé ;
--   3. équipement du Lot 2 posé dans le Séjour HORS plan (`plan_id` nul, catégorie `mobilier`,
--      charge minimale du Lot 2) : le contrat générique redéfini par V7 doit l'accepter encore.
--
-- Base jetable uniquement ; jamais Preview ni Production.
\set ON_ERROR_STOP 1
begin;

select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;

create temporary table _upg7_plan (id uuid) on commit drop;
insert into _upg7_plan select id from public.tools_releves_plans
  where etage_id = 'f5300000-0000-4000-8000-000000000001' and etat_documente = 'corrige' and deleted_at is null;

-- ── 1. Plan corrigé : attributs Lot 6, contour, gel ──────────────────────────────────────
select public.tools_releve_plan_enregistrer(p.id, p.revision, jsonb_build_object(
  'ouvertures', jsonb_build_array(jsonb_build_object('id', o.id, 'murId', o.parent_element_id,
    'donnees', '{"decalageMm":1000,"largeurMm":900,"hauteurMm":2150,"allegeMm":null,"typeOuverture":"porte","sens":"gauche","vantaux":1,"poussee":"poussant","modele":"battant"}'::jsonb)),
  'contours', jsonb_build_array(jsonb_build_object('pieceId', 'f5500000-0000-4000-8000-000000000001',
    'points', '[{"x":0,"y":0},{"x":5200,"y":0},{"x":5200,"y":4000},{"x":0,"y":4000}]'::jsonb))))
from public.tools_releves_plans p
join public.tools_releves_elements o on o.plan_id = p.id and o.type = 'ouverture' and o.deleted_at is null
where p.id = (select id from _upg7_plan);

select public.tools_releve_plan_figer(p.id, p.revision, 'Corrigé V6') from public.tools_releves_plans p where p.id = (select id from _upg7_plan);

-- ── 2. Plan « as built » dérivé du corrigé figé ──────────────────────────────────────────
select public.tools_releve_plan_creer('f5300000-0000-4000-8000-000000000001', 'as_built', (select id from _upg7_plan), 'As built V6');

-- ── 3. Équipement Lot 2 hors plan ─────────────────────────────────────────────────────────
insert into public.tools_releves_elements (id, releve_id, type, etage_id, piece_id, donnees) values
  ('f6900000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'equipement',
   'f5300000-0000-4000-8000-000000000001', 'f5500000-0000-4000-8000-000000000001',
   '{"categorie":"mobilier","position":{"x":1200,"y":900},"libelle":"Canapé (Lot 2)"}');

reset role;
commit;
