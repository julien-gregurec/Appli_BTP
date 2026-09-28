-- Train canonique V6 — complément du jeu d'upgrade V5 → V6 (scripts/qualification/upgrade-v5-v6.sh).
-- Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V6_CONVERGENCE_V1.md §10.
--
-- Chargé sur une base au train V5 (355 migrations, dernière 20260928000301) APRÈS le jeu V5
-- (jeu V3, complément V3→V4, décors GP ↔ Réserves et D-01, complément V4→V5). Il pose l'état
-- réel d'une base V5 sur les domaines que V6 modifie :
--
--   1. Relevé & Métré Lot 5 (plan 2D) sur le relevé « UPG5 » : plan initial du RDC (adopte les
--      2 murs V4), 2 murs de plus (rectangle 5,20 × 3,80 m), une ouverture « Lot 5 » SANS attribut
--      de menuiserie, contour du Séjour, plan FIGÉ ; plan corrigé dérivé (copie) ; photo rattachée
--      à un mur du plan (ancre `mur`). Sur V5, `surface_calculee_mm2` n'est jamais écrite.
--      → V6 : validation des ouvertures (…0928 401), synchronisation de la surface (…0928 601).
--   2. Stripe : « UPG4 annulé » s'est réabonnée sur V5 (même client, ancienne subscription
--      historisée) — V6 ne touche pas Stripe : l'état doit traverser l'upgrade intact.
--   3. RGPD : politique des contrats au livré V5 (durée non validée) — V6 ajoute le paramétrage
--      (…0928 501) sans rien activer.
--
-- Base jetable uniquement ; jamais Preview ni Production.
\set ON_ERROR_STOP 1
begin;

-- ── 1. Relevé & Métré : plan 2D V5 (métreur 10…03, tenant A) ─────────────────────────────
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;

create temporary table _upg6_plans (cle text primary key, id uuid) on commit drop;
insert into _upg6_plans select 'initial', id from public.tools_releve_plan_creer('f5300000-0000-4000-8000-000000000001', 'initial');
select public.tools_releve_plan_enregistrer((select id from _upg6_plans where cle = 'initial'), 1, jsonb_build_object(
  'murs', jsonb_build_array(
    jsonb_build_object('id', 'f6600000-0000-4000-8000-000000000003', 'pieceId', 'f5500000-0000-4000-8000-000000000001', 'donnees',
      '{"a":{"x":5200,"y":3800},"b":{"x":0,"y":3800},"epaisseurMm":200,"hauteurMm":2500,"typeMur":"porteur"}'::jsonb),
    jsonb_build_object('id', 'f6600000-0000-4000-8000-000000000004', 'pieceId', 'f5500000-0000-4000-8000-000000000001', 'donnees',
      '{"a":{"x":0,"y":3800},"b":{"x":0,"y":0},"epaisseurMm":200,"hauteurMm":2500,"typeMur":"porteur"}'::jsonb)),
  'ouvertures', jsonb_build_array(
    jsonb_build_object('id', 'f6700000-0000-4000-8000-000000000001', 'murId', 'f5600000-0000-4000-8000-000000000001', 'donnees',
      '{"decalageMm":1000,"largeurMm":900,"hauteurMm":2150,"allegeMm":null,"typeOuverture":"porte","sens":"gauche"}'::jsonb)),
  'contours', jsonb_build_array(jsonb_build_object('pieceId', 'f5500000-0000-4000-8000-000000000001',
    'points', '[{"x":0,"y":0},{"x":5200,"y":0},{"x":5200,"y":3800},{"x":0,"y":3800}]'::jsonb,
    'murIds', '["f5600000-0000-4000-8000-000000000001","f5600000-0000-4000-8000-000000000002","f6600000-0000-4000-8000-000000000003","f6600000-0000-4000-8000-000000000004"]'::jsonb))));
-- Photo V4 n°1 rattachée au mur nord du plan (PhotoAnchor sur un élément mur, Lot 5).
insert into public.tools_releves_elements (id, releve_id, type, etage_id, piece_id, donnees) values
  ('f6800000-0000-4000-8000-000000000001', 'f5000000-0000-4000-8000-000000000001', 'photo_anchor',
   'f5300000-0000-4000-8000-000000000001', 'f5500000-0000-4000-8000-000000000001',
   '{"mediaId":"f5700000-0000-4000-8000-000000000001","ancre":{"kind":"entite","ref":{"kind":"element","id":"f5600000-0000-4000-8000-000000000001"}},"directionRad":null,"legende":"Façade nord","ordre":0}');
select public.tools_releve_plan_figer((select id from _upg6_plans where cle = 'initial'),
  (select revision from public.tools_releves_plans where id = (select id from _upg6_plans where cle = 'initial')), 'Existant V5');
insert into _upg6_plans select 'corrige', id from public.tools_releve_plan_creer('f5300000-0000-4000-8000-000000000001', 'corrige', null, 'Corrigé V5');
reset role;

-- ── 2. Stripe : réabonnement V5 de « UPG4 annulé » (écriture serveur, même client) ───────
select set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true);
select public.relier_subscription_reabonnement_service('a7400000-0000-4000-8000-000000000070', 'sub_upg6_v5', 'cus_upg4_70',
                                                       'active', 'sub_upg4_70', 'canceled');

commit;
