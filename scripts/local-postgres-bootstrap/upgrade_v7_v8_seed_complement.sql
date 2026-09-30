-- Train canonique V8 — complément du jeu d'upgrade V7 → V8 (scripts/qualification/upgrade-v7-v8.sh).
-- Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V8_CONVERGENCE_V1.md §7.
--
-- Chargé sur une base au train V7 (359 migrations, dernière 20260928000701) APRÈS le jeu V7
-- (jeu V3, compléments V3→V4 … V6→V7, migration V7). Il pose l'état réel d'une base V7 sur les
-- domaines que V8 modifie. Tout passe par les chemins V7 (RPC Relevé sous session réelle) ou,
-- pour l'état commercial, par les colonnes que les webhooks V7 écrivent (projection Stripe) :
--
--   1. Cycle commercial (Billing, …0801-0803) :
--      a. contrat au prix de la grille OBSOLÈTE (Mini 69 €, version 2 du catalogue), tel que le
--         webhook V7 l'enregistrait avant le correctif du catalogue ;
--      b. entreprise « Peintures Recette B » (droit Colors, 2 utilisateurs habilités) passée
--         `suspendu` côté Gestion Pro (Stripe past_due relu) : en V7, ses utilisateurs perdent
--         aussi Colors ; en V8 (Per-App, …0804), Colors doit rester ouvert ;
--      (déjà présents dans le jeu : essai expiré « UPG4 expiré », annulé « UPG4 annulé »,
--       entreprise pilote en essai échu, hôte D-01 suspendu.)
--   2. Données personnelles des salariés (lot E, …0806) : e-mail, téléphone, notes RH,
--      numéro d'inscription et carte BTP renseignés sur les salariés de RECETTE_A ;
--   3. Relevé & Métré (Lots 8 et 9, …0809-0810) : deux objets Lot 7 posés sur le plan
--      « as built » dérivé en V6 (dont un lié à un mur), par le RPC V7 ;
--   4. Réserves : un intervenant rattaché par le chemin V7 (même tenant) — la garde REDTEAM-V2
--      (…0805) ne doit rien refuser d'existant.
--
-- Base jetable uniquement ; jamais Preview ni Production.
\set ON_ERROR_STOP 1
begin;

-- ── 1a. Contrat enregistré au prix obsolète (Mini 69 €) ───────────────────────────────────
insert into public.abonnements_entreprises (id, entreprise_id, plan_id, code_offre, version_tarif, periodicite,
  prix_contractuel_ht, statut, debut_periode, fin_periode, stripe_subscription_id, stripe_customer_id)
select 'a7700000-0000-4000-8000-000000000050', 'a7400000-0000-4000-8000-000000000050', p.id, 'mini', p.version, 'mensuel',
       p.prix_mensuel_ht, 'actif', now() - interval '12 days', now() + interval '18 days', 'sub_upg4_50', 'cus_upg4_50'
from public.plans_abonnement p where p.code = 'mini' and p.actif;

-- ── 1b. GP suspendu (past_due) chez une entreprise dont Colors est un droit distinct ──────
update public.entreprises
   set abonnement_statut = 'suspendu', abonnement_offre = 'mini',
       stripe_customer_id = 'cus_upg7_colors_b', stripe_subscription_id = 'sub_upg7_colors_b',
       abonnement_dernier_evenement_at = now() - interval '1 day'
 where id = 'e0000000-0000-4000-8000-00000000000b';

-- ── 2. Données personnelles des salariés RECETTE_A ────────────────────────────────────────
update public.employes e
   set email = lower(replace(e.prenom || '.' || e.nom, ' ', '-')) || '@salaries-upg7.invalid',
       telephone = '06 00 00 07 0' || right(e.id::text, 1),
       notes = 'NOTE RH V7 — ' || e.prenom || ' ' || e.nom || ' (entretien annuel, confidentiel)',
       numero_inscription = 'INS-V7-' || right(e.id::text, 4),
       carte_btp_numero = 'BTP-V7-' || right(e.id::text, 4)
 where e.entreprise_id = 'a0000000-0000-0000-0000-000000000001';

-- ── 3. Objets Lot 7 sur le plan « as built » (RPC V7, session du chef d'équipe A) ──────────
select set_config('request.jwt.claims', '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
set local role authenticated;

select public.tools_releve_plan_enregistrer(p.id, p.revision, jsonb_build_object('equipements', jsonb_build_array(
  jsonb_build_object('id', 'f7a00000-0000-4000-8000-000000000001', 'pieceId', 'f5500000-0000-4000-8000-000000000001',
    'donnees', jsonb_build_object('categorie', 'sanitaire', 'objet', 'wc', 'libelle', 'Wc', 'position', jsonb_build_object('x', 600, 'y', 500),
      'rotationRad', 0, 'largeurMm', 800, 'profondeurMm', 600, 'hauteurMm', 750, 'niveauMm', 0, 'visible', true, 'verrouille', false, 'pieceAuto', true)),
  jsonb_build_object('id', 'f7a00000-0000-4000-8000-000000000002', 'pieceId', 'f5500000-0000-4000-8000-000000000001',
    'donnees', jsonb_build_object('categorie', 'cvc', 'objet', 'radiateur', 'libelle', 'Radiateur', 'position', jsonb_build_object('x', 2000, 'y', 150),
      'rotationRad', 0, 'largeurMm', 800, 'profondeurMm', 600, 'hauteurMm', 750, 'niveauMm', 150, 'visible', true, 'verrouille', false, 'pieceAuto', true,
      'murId', (select m.id from public.tools_releves_elements m where m.plan_id = p.id and m.type = 'mur' and m.deleted_at is null order by m.id limit 1),
      'face', 'gauche', 'decalageMm', 1500)))))
from public.tools_releves_plans p
where p.etage_id = 'f5300000-0000-4000-8000-000000000001' and p.etat_documente = 'as_built' and p.deleted_at is null;

reset role;
select set_config('request.jwt.claims', '', true);
select set_config('request.jwt.claim.sub', '', true);

-- ── 4. Réserves : intervenant du même tenant, ajouté en V7 ────────────────────────────────
insert into public.reserves_intervenants (id, entreprise_id, chantier_id, nom, corps_etat, created_by)
select 'a7800000-0000-4000-8000-000000000001', c.entreprise_id, c.id, 'Intervenant UPG7', 'Plâtrerie', '10000000-0000-0000-0000-000000000001'
from public.reserves_chantiers c
where c.entreprise_id = 'a0000000-0000-0000-0000-000000000001'
order by c.created_at, c.id limit 1;

commit;
