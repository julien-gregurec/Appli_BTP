# ELSATIA Tools — Relevé & Métré — Roadmap V1

**Date** : 2026-09-26
**Base** : `origin/integration/elsatia-canonical-train-v1` @ `1c1fed66`
**Audit source** : [ELSATIA_TOOLS_RELEVE_METRE_EXISTING_AUDIT_V1.md](./ELSATIA_TOOLS_RELEVE_METRE_EXISTING_AUDIT_V1.md)
**Verdict du lot 1** : **RELEVE METRE ARCHITECTURE READY FOR LOT 2** (sous les 5 conditions de l'audit §0.2)

## Positionnement (rappel)

- **Tools** = relever, scanner, mesurer, dessiner, calculer, métrer, documenter.
- **Gestion Pro** = chiffrage complet, devis, commandes, chantier.
- Relevé & Métré est un **sous-produit premium de Tools**, pas une nouvelle application : même `apps/tools`, même compte, même moteur géométrique (Engine B), même bus d'export.
- Prix de travail : **24,90 € HT / mois / utilisateur**, **249 € HT / an / utilisateur** — non activés.

## Hypothèses d'estimation

- Effort en **jours-développeur** (j), 1 développeur senior connaissant le dépôt, tests inclus.
- Fourchette basse/haute ; l'écart reflète l'incertitude, surtout sur les lots matériels.
- Chaque lot livre une branche courte, fusionnée dans le train canonique, avec `vitest`, `tsc`, `eslint` verts et, si SQL, tests pgTAP.
- Un feature flag `releve-metre` (capability non vendue, attribuée en `internal`/`plateforme`) masque tout le module jusqu'au lot 21.

## Chemin critique

```text
1 → 2 → 3 ─┬→ 5 → 6 → 7 → 8 → 9 → 10 → 12 → 13 → 16 → 17 → 18 → 19 → 20 → 21
           ├→ 4 (capture) ──────────────┘
           └→ 11 (médias) ─────────────────────────┘
14 (plan rénové) et 15 (estimation) se branchent après 12.
```

Total estimé : **≈ 173 – 265 j** hors AR/LiDAR natifs avancés (voir lot 4b).

---

## Lot 1 — Audit ✅

| | |
|---|---|
| Scope | Inventaire code, matrice CDC, moteur, mobile, data model, entitlement, GP, risques, roadmap |
| Dépendances | — |
| Effort | 1 – 2 j (réalisé) |
| Tests | Baseline exécutée : 174 fichiers / 1 992 tests verts, `tsc` 0 erreur |
| Sortie | Deux documents `docs/product/*_V1.md`, verdict émis |

## Lot 2 — Architecture ✅

> Réalisé sur le train canonique V2 : [ELSATIA_TOOLS_RELEVE_METRE_ARCHITECTURE_FOUNDATION_V1.md](./ELSATIA_TOOLS_RELEVE_METRE_ARCHITECTURE_FOUNDATION_V1.md) — verdict **RELEVE METRE LOT 2 FOUNDATION QUALIFIED**. Le lot a aussi livré, par anticipation, la table `tools_releves` et ses enfants, le gate serveur `releve-metre` et les écrans liste / structure prévus au lot 3 (en ligne ; le dépôt IndexedDB reste au lot 3).

| | |
|---|---|
| Scope | ADR tranchant les 5 décisions de fondation (audit §0.2) : agrégat `ReleveProject` ; modèle d'entitlement add-on (`ADDON_CAPABILITIES`, factorisation SQL des capabilities, SKU distincts) ; relation tarifaire Standard/Relevé Pro ; stratégie capture (Web vs natif, AR/LiDAR expérimental) ; stockage cloud (bucket, quotas, RGPD). Schéma TypeScript du modèle (types seuls), contrat `packages/releve-contracts` v0 (types seuls), plan de migrations **proposées** dans `docs/migrations-proposees/` |
| Dépendances | Lot 1 |
| Effort | 6 – 10 j |
| Tests | Tests de types / validation du modèle vide ; relecture croisée ; aucun test de non-régression Tools cassé |
| Sortie | ADR validé par le produit ; migrations proposées relues ; décision écrite sur le prix ; aucune activation commerciale |

## Lot 3 — Structure (chantier / bâtiment / étage / zone / pièce)

| | |
|---|---|
| Scope | `ReleveProject` v1 + migration tolérante ; repository IndexedDB dédié (`elsatia-releve[-company:<id>]`) ; CRUD bâtiment/étage/zone/pièce ; écran liste des relevés ; gate `releve-metre` client **et** serveur ; table `tools_releves` + RPC sync (pattern `tools_projects`) ; lien optionnel `chantier_gp_id` (pattern Réserves) ; étendre `entitlementToAccess` et les fonctions SQL d'entitlement |
| Dépendances | Lot 2 |
| Effort | 12 – 18 j |
| Tests | Unitaires modèle/migration ; repository mémoire + IndexedDB ; pgTAP : RLS, gating capability, isolation entreprise, non-régression `elsatia_tools_r8/r9/r10` et `cloud_sync_entitlement_closure_v1` inchangés |
| Sortie | Un utilisateur interne crée un relevé multi-étages, hors ligne, synchronisé ; un Tools Pro sans `releve-metre` est refusé côté serveur ; Free/Pro existants inchangés |

## Lot 4 — Capture terrain

| | |
|---|---|
| Scope | **4a (engagé)** : saisie guidée pièce par pièce (longueurs de murs, hauteur sous plafond, diagonales de contrôle) ; capture photo : `@capacitor/camera` en natif + `<input capture>` Web ; permissions iOS/Android + mise à jour déclarations de confidentialité ; levée **ciblée** de `Permissions-Policy` (`camera=(self)` uniquement) ; compression photo. **4b (exploratoire, non engagé)** : spike ARKit/ARCore mesure de distance ; spike RoomPlan (LiDAR, iOS 16+) ; spike laser Bluetooth (DISTO) en natif |
| Dépendances | Lot 3 |
| Effort | 4a : 10 – 15 j ; 4b : 15 – 30 j par spike |
| Tests | Unitaires saisie ; tests plugin mockés ; **tests sur ≥ 3 appareils physiques** (iPhone, iPad, Android milieu de gamme) documentés avec captures |
| Sortie | Relevé d'une pièce réelle saisi et photographié sur appareil physique ; spike 4b = rapport GO/NO-GO chiffré, sans code de production |

## Lot 5 — Plan (génération)

| | |
|---|---|
| Scope | Entités `Wall` (axe + épaisseur via `engine/offset`) et `Room` (contour fermé) au-dessus d'Engine B, projetées vers `ShapeGeometry` ; génération du plan d'une pièce depuis les cotes saisies (polygone fermé, fermeture par diagonales) ; assemblage des pièces sur l'étage ; rendu viewport existant |
| Dépendances | Lots 3, 4a |
| Effort | 12 – 18 j |
| Tests | Propriétés géométriques (fermeture, aire = Σ, orientation) ; parité projection ; charge 500 entités |
| Sortie | Plan d'étage généré à partir de mesures saisies, erreur de fermeture affichée |

## Lot 6 — Correction manuelle

| | |
|---|---|
| Scope | Édition de murs/sommets ; insertion/suppression de sommet ; snap angle/ortho/perpendiculaire (brancher `engine/snap.ts`) ; solveur minimal borné (longueur fixée, orthogonalité, parallélisme) ; historique commande étendu |
| Dépendances | Lot 5 |
| Effort | 12 – 20 j |
| Tests | Solveur : convergence, cas dégénérés, pas de boucle ; undo/redo exhaustif ; gestes tactiles |
| Sortie | Un plan faux de 3 % est corrigé à la main en respectant les cotes verrouillées |

## Lot 7 — Ouvertures (portes, fenêtres, baies)

| | |
|---|---|
| Scope | `Opening` hébergée par `Wall` (décalage, largeur, hauteur, allège, sens) ; symboles plan ; déduction dans les surfaces murales ; contraintes (ouverture dans le mur) |
| Dépendances | Lot 6 |
| Effort | 8 – 12 j |
| Tests | Positionnement, chevauchement interdit, déplacement du mur hôte |
| Sortie | Portes/fenêtres placées et cotées, surfaces murales nettes correctes |

## Lot 8 — Mobilier, équipements, calques

| | |
|---|---|
| Scope | Bibliothèque de symboles (mobilier, électricité, plomberie, CVC, luminaires — réutiliser `LightingFixture`) ; **unification des 3 systèmes de calques** en `LayerDef` ; visibilité/verrouillage |
| Dépendances | Lot 7 |
| Effort | 8 – 12 j |
| Tests | Non-régression calques Atelier ; sérialisation ; performance avec 200 symboles |
| Sortie | Calques métier pilotables, Atelier non régressé |

## Lot 9 — Cotes

| | |
|---|---|
| Scope | Cotation manuelle et automatique (murs, chaînes de cotes, ouvertures) réutilisant `engine/dimensions.ts` ; placement lisible ; édition d'une cote → modifie la géométrie via le solveur |
| Dépendances | Lots 6, 7 |
| Effort | 8 – 12 j |
| Tests | Cote affichée = valeur modèle (règle « aucune cote inventée dans un composant ») ; arrondis |
| Sortie | Plan coté exploitable par un artisan |

## Lot 10 — Surfaces, volumes, revêtements

| | |
|---|---|
| Scope | Surfaces sol avec **trous** (déductions), surfaces murales nettes, plafonds, périmètres/plinthes, volumes (sol × HSP) ; affectation de revêtements par face (sol/murs/plafond) ; pertes via `margins.ts` |
| Dépendances | Lots 7, 9 |
| Effort | 10 – 14 j |
| Tests | Jeux de pièces de référence calculés à la main ; tolérance ≤ 0,01 m² |
| Sortie | Tableau surfaces/volumes par pièce juste sur 10 cas de référence |

## Lot 11 — Médias & voix

| | |
|---|---|
| Scope | `PhotoAnchor` (photo ancrée sur point/mur/pièce) ; annotations positionnées ; notes vocales (`MediaRecorder` Web, plugin natif si nécessaire) ; bucket privé + upload différé ; gestion de quota (`storage.persist()`, `estimate()`) ; purge RGPD |
| Dépendances | Lots 3, 4a |
| Effort | 10 – 15 j |
| Tests | Upload interrompu/reprise ; quota plein ; RLS bucket ; purge |
| Sortie | 100 photos + 20 notes vocales sur un relevé, hors ligne puis synchronisées, sans perte |

## Lot 12 — Métré (takeoff)

| | |
|---|---|
| Scope | `Quantity` dérivées par pièce/ouvrage (sol, murs, plafond, plinthes, ouvertures, peinture, faïence, plaques) ; recâblage des calculateurs `quantite-peinture`, `calcul-plaques`, `isolation` sur la géométrie ; tableau de métré |
| Dépendances | Lot 10 |
| Effort | 10 – 15 j |
| Tests | Quantités = formules documentées ; `exact` vs `estimate` explicite |
| Sortie | Métré complet d'un appartement de référence validé par un métreur |

## Lot 13 — Erreurs & contrôles

| | |
|---|---|
| Scope | Contrôles métier : pièce non fermée, écart diagonale, somme de cotes ≠ total, ouverture hors mur, HSP manquante, photo non ancrée ; niveaux info/avertissement/bloquant ; intégration au `pre-export-check` |
| Dépendances | Lot 12 |
| Effort | 5 – 8 j |
| Tests | Un test par règle (positif + négatif) |
| Sortie | Aucun export GP possible avec une erreur bloquante |

## Lot 14 — Plan rénové

| | |
|---|---|
| Scope | État `existing` / `renovated` par étage ; duplication en variante ; démolition/construction (codes couleur) ; diff de métré existant ↔ rénové |
| Dépendances | Lot 12 |
| Effort | 8 – 12 j |
| Tests | Diff déterministe ; isolation des variantes |
| Sortie | Plan existant + plan projet + métré différentiel |

## Lot 15 — Estimation simplifiée

| | |
|---|---|
| Scope | Prix unitaires **locaux et indicatifs** (saisis par l'utilisateur ou tirés de `prestations_catalogue` en lecture si lien GP) ; total HT indicatif ; mention « estimation non contractuelle » ; **jamais de devis** (réservé à GP) |
| Dépendances | Lots 12 (et 17 pour la lecture catalogue GP) |
| Effort | 5 – 8 j |
| Tests | Arrondis, TVA non calculée ou indicative uniquement |
| Sortie | Validation produit que l'estimation ne cannibalise pas GP |

## Lot 16 — PDF & exports

| | |
|---|---|
| Scope | Gabarits PDF relevé (couverture, plan par étage, tableau de métré, photos) via `chantier-export-bus` ; DXF : calques métier + blocs portes/fenêtres + points ; **CSV** (métré) ; Excel en option |
| Dépendances | Lots 9, 12, 13 |
| Effort | 8 – 12 j |
| Tests | `validateDxfStructure` ; ouverture DXF dans un logiciel CAO (manuel, documenté) ; CSV RFC 4180, séparateur `;` FR |
| Sortie | Dossier PDF + DXF + CSV d'un relevé de référence relus par un utilisateur pilote |

## Lot 17 — Synchronisation GP

| | |
|---|---|
| Scope | `packages/releve-contracts` v1 ; RPC GP `SECURITY DEFINER` d'import (`metres` + `lignes_metres` + `documents_chantier`) ; double autorisation (`releve-metre` + `gerer_ouvrages`) ; idempotence ; journal `tools_releves_exports_gp` ; sélection du chantier GP depuis Tools |
| Dépendances | Lots 3, 12, 16 |
| Effort | 10 – 15 j |
| Tests | pgTAP : autorisations croisées, idempotence (double envoi), isolation entreprise, conversions mm → m |
| Sortie | Un métré Tools apparaît dans « Métré assisté » GP sur le bon chantier, rejouable sans doublon |

## Lot 18 — Automatisation devis GP

| | |
|---|---|
| Scope | Fonction `métré → lignes_devis` (modèle `appliquer_modele_devis`), devis `brouillon` uniquement ; mapping vers `prestations_catalogue` ; relecture humaine obligatoire |
| Dépendances | Lot 17 |
| Effort | 8 – 12 j |
| Tests | pgTAP : refus sur devis non brouillon ; totaux via `recalc_totaux_devis` |
| Sortie | Devis brouillon pré-rempli, validé par un utilisateur GP pilote |

## Lot 19 — Tests terrain

| | |
|---|---|
| Scope | 3 à 5 entreprises pilotes, ≥ 20 relevés réels (appartement, maison, local) ; mesure écart relevé ↔ contre-mesure ; ergonomie gants/soleil/tablette |
| Dépendances | Lots 3–18 (a minima 3–13, 16) |
| Effort | 10 – 15 j (+ calendrier pilotes) |
| Tests | Protocole écrit, écarts mesurés, bugs classés P0–P3 |
| Sortie | Erreur de surface médiane ≤ 2 % ; 0 perte de données ; P0/P1 fermés |

## Lot 20 — Performance

| | |
|---|---|
| Scope | Benchmarks rendu SVG (étage 2 000 entités), sync gros documents, médias ; rendu par étage ; optimisation mémoire tablette entrée de gamme |
| Dépendances | Lot 19 |
| Effort | 6 – 10 j |
| Tests | Seuils chiffrés en tests (pattern `free-drawing-load.test.ts`) |
| Sortie | Interaction < 16 ms sur tablette de référence ; ouverture relevé < 2 s |

## Lot 21 — Commercialisation

| | |
|---|---|
| Scope | Décision prix finale ; produits Stripe live + App Store / Play (SKU `tools_releve_monthly/annual`) ; pages tarifaires, CGV, stores ; activation de la capability ; support |
| Dépendances | Lots 19, 20, validation explicite du dirigeant |
| Effort | 6 – 10 j (+ délais de revue Stores) |
| Tests | Achats réels sandbox puis production (Web, iOS, Android) ; restauration ; résiliation ; non-régression Tools Free/Pro |
| Sortie | Relevé Pro vendable sur les 3 canaux, Tools Free/Pro inchangés |

---

## Synthèse effort

| Bloc | Lots | Effort (j) |
|---|---|---|
| Fondation | 1–3 | 19 – 30 |
| Capture & plan | 4a, 5–9 | 58 – 89 |
| Métier | 10–15 | 48 – 72 |
| Exports & GP | 16–18 | 26 – 39 |
| Qualification & lancement | 19–21 | 22 – 35 |
| **Total (hors 4b)** | | **≈ 173 – 265** |
| Spikes AR / LiDAR / laser (4b) | optionnels | 15 – 30 chacun |

## Hors périmètre de la roadmap V1

- Reconstruction 3D, BIM/IFC, rendu 3D.
- IA générative de plans (possible lot ultérieur, toujours en mode « proposition »).
- Devis complet dans Tools (réservé à Gestion Pro).
