# ELSATIA Tools — Relevé & Métré — Contrat produit V1

**Date** : 2026-09-27 · **Statut** : en vigueur à partir du Lot 3 · **Remplace** : la « décision de travail » D4 du Lot 2.

## 1. Décision retenue : Relevé Pro inclut Tools Pro

> **RELEVÉ PRO INCLUT TOOLS PRO.**

Un utilisateur qui détient l'offre **Relevé & Métré Pro** (capability d'add-on `releve-metre`) reçoit **toutes les capabilities Tools Pro** (18), sans seconde souscription et sans duplication de droits.

| Aspect | Règle |
|---|---|
| Source de vérité serveur | `tools_offres_catalogue` : `releve_pro.offres_incluses = ['tools_pro']` (migration `20260927000602`), résolue par `tools_resoudre_entitlements()` → `tools_capabilities_etendues()` |
| Miroir domaine | `TOOLS_OFFERS.releve_pro.offresIncluses = ["tools_pro"]`, `RELEVE_METRE_OFFER.includesToolsPro = true`, `RELEVE_PRO_PRODUCT_DECISION` (`packages/releve-domain/src/entitlement.ts`) |
| Liste Pro | une seule (`tools_capabilities_pro()` / `TOOLS_PRO_CAPABILITIES`), étendue, jamais recopiée — parité testée |
| Tools Free / Tools Pro sans add-on | strictement inchangés (le résolveur ne déclenche aucune offre sans `releve-metre`) |
| Réversibilité | vider `offres_incluses` (migration dédiée) ; aucune donnée utilisateur à migrer |

## 2. Ce que la décision n'active PAS

- **Aucune facturation Stripe réelle** : aucun produit, prix, SKU, webhook ou abonnement Stripe / App Store / Google Play n'est créé ou modifié.
- `releve_pro.commercialement_active = false` (CHECK SQL) ; `isReleveMetrePurchasable() === false` ; `RELEVE_PRO_PRODUCT_DECISION.realBillingActive === false`.
- Le trigger `tools_releve_metre_non_commercial` refuse toujours `releve-metre` sur une source d'achat (`web`, `apple`, `google`).
- Attribution possible uniquement par la plateforme (`internal`, `elsatia`) ou au propriétaire global (`plateforme`) — pilotes internes.
- Prix de référence (non affichés, non vendus) : une seule source, `RELEVE_METRE_OFFER` (statut `working-price`).

L'activation commerciale reste un lot dédié (lot 21 de la roadmap), soumis à validation explicite du dirigeant.

## 3. Périmètre fonctionnel couvert par l'offre (à date)

| Module | État |
|---|---|
| Tools Pro (calculs, Atelier, arches, rosaces, dessin libre, photo calibrée, exports) | inclus |
| Relevé & Métré — structure terrain (projet → chantier → bâtiment → étage → zone → pièce) | **Lot 3** livré localement |
| Relevé & Métré — murs, ouvertures, mesures, photos, annotations, métré | contrats de données (Lot 2), éditeurs aux lots suivants |
| Synchronisation Gestion Pro | contrat `contract-only` (`gp-sync.ts`), non branché |

## 4. Tests qui verrouillent la décision

- Vitest `entitlement.test.ts` — « décision produit Lot 3 : Relevé Pro inclut Tools Pro » (inclusion, non-achat, facturation inactive, 18 capabilities Pro incluses).
- Vitest `sql-parity.test.ts` — catalogue d'offres SQL ↔ domaine, aucun prix dans les migrations Relevé.
- pgTAP `elsatia_tools_releve_metre_lot2_complements.test.sql` (K3, K8) — `['releve-metre']` seul ouvre les capabilities Pro.
