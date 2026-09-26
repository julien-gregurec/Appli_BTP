# ELSATIA Tools — Relevé & Métré — Audit de l'existant & gap analysis V1

**Lot** : 1 — Audit de l'existant & architecture gap analysis
**Date** : 2026-09-26
**Nature** : audit en lecture seule. Aucun code applicatif, aucune migration, aucune activation commerciale.
**Document compagnon** : [ELSATIA_TOOLS_RELEVE_METRE_ROADMAP_V1.md](./ELSATIA_TOOLS_RELEVE_METRE_ROADMAP_V1.md)

---

## 0. Verdict

> **RELEVE METRE ARCHITECTURE READY FOR LOT 2**
> — sous conditions (voir §0.2). Le lot 2 (architecture) peut démarrer. Les lots 3 et suivants ne pourront pas démarrer tant que le lot 2 n'aura pas tranché les cinq décisions de fondation listées en §0.2.

### 0.1 Synthèse en une page

Tools est aujourd'hui un **outil de traçage géométrique de précision** : 16 calculateurs Free, 10 calculateurs Pro (arches, niches, rosaces, ellipses…) et un Atelier (tracé paramétrique, dessin libre, photo calibrée, exports chantier PDF/DXF/SVG/PNG/mosaïque 1:1). Ce n'est **pas** un outil de relevé de bâtiment.

| Domaine | État | Commentaire |
|---|---|---|
| Moteur géométrique 2D (mm, Y-up, snap, hit-test, intersections, aires, undo/redo) | **Solide, REUSABLE** | ~41 000 lignes géométrie/tracing/viewport, ~1 400 tests |
| Viewport SVG tactile (pan, pinch, tolérances tactiles) | **REUSABLE** | Pointer Events, testé |
| Exports PDF / DXF / SVG / PNG | **REUSABLE** | Bus d'export unique, pré-contrôles bloquants |
| Photo de référence (calibration 2 points, homographie, contours) | **PARTIAL, REUSABLE** | Import fichier uniquement, aucune capture caméra |
| Structure chantier / bâtiment / étage / pièce | **MISSING** | Aucune hiérarchie ; `siteName` texte libre |
| Murs (épaisseur), ouvertures, mobilier, équipements | **MISSING** | Aucune entité métier bâtiment |
| Capture terrain caméra / AR / LiDAR / capteurs | **MISSING** et **bloqué** | Aucun plugin caméra ; `Permissions-Policy` Web refuse camera/xr/gyroscope |
| Sync cloud des projets Atelier (`TracingProject`) + photos | **MISSING** | IndexedDB uniquement ; seuls les `ToolProject` (calculateurs) sont synchronisés |
| Entitlement add-on premium | **NEEDS_REFACTOR** | Modèle mono-palier free/pro ; 18 capabilities codées en dur à 4 endroits SQL |
| Pont vers Gestion Pro | **MISSING** | Seulement une bannière marketing. Mais GP possède déjà `metres` / `lignes_metres` / `lignes_devis` → cible naturelle |
| CSV/Excel, notes vocales, versioning, contrôles d'erreurs métier | **MISSING** | — |

### 0.2 Conditions (décisions de fondation à trancher au lot 2)

1. **Modèle de projet** : nouveau `ReleveProject` (agrégat hiérarchique) distinct de `TracingProject` et `ToolProject`, qui réutilise `FreeGeometry`/Engine B pour la géométrie — recommandé — ou extension de `TracingProject` (déconseillé, voir §6).
2. **Modèle d'entitlement add-on** : aujourd'hui `entitlementToAccess` renvoie Free dès que `tier !== "pro"`, et `tools_resoudre_entitlements` ne lit que les lignes `niveau='pro'`. Un add-on vendu séparément exige de refondre la résolution (§7).
3. **Cohérence tarifaire** : Tools Pro est documenté à **4,99 €/mois – 49 €/an** (indicatif, `docs/r9-monetization.md:30`) ; Relevé Pro est envisagé à **24,90 € HT/mois – 249 € HT/an**. Il faut décider si Relevé Pro **inclut** Tools Pro (recommandé) ou s'y ajoute.
4. **Stratégie capture terrain** : décider de l'ordre Web/PWA vs natif (Capacitor) pour la caméra, et de la place réelle de l'AR/LiDAR (lots expérimentaux, jamais prérequis). Aucune capacité matérielle n'est prouvée aujourd'hui.
5. **Stockage cloud** : aucun bucket Supabase Storage n'existe pour Tools. Décider du bucket, des quotas et de la politique RGPD photos avant le lot 11.

Si ces cinq décisions ne sont pas tranchées au lot 2, le verdict bascule en **FOUNDATIONAL GAPS REQUIRE WORK FIRST**.

---

## 1. Baseline

| Élément | Valeur |
|---|---|
| Commande | `git fetch --all --prune` (≈ 280 branches distantes) |
| Branche de base retenue | `origin/integration/elsatia-canonical-train-v1` |
| Commit | `1c1fed66368d6c840906a5bb77ea41c37a93dec9` (2026-09-26 16:39 UTC) — « docs(qualification): rapport d'exécution du train canonique V1 » |
| Train canonique V2 | **Absent**. Les branches `integration/elsatia-ecosystem-train-v2-*` / `-v3-*` sont plus anciennes (08–09/09) et ne contiennent que 180 fichiers `apps/tools` (contre 631) |
| `origin/main` | Ligne historique distincte, sans `apps/` (0 fichier Tools) — non pertinente |
| Branche de travail | `claude/happy-ritchie-7ji6xa`, réinitialisée sur le train canonique V1 (aucun commit propre préexistant) |

Vérification de complétude du train pour Tools :

| Branche Tools | Commits absents du train (`git rev-list`) | Patch-équivalents (`git cherry`) |
|---|---|---|
| `release/tools-store-preflight-v1` | 0 | — |
| `integration/tools-final-prepilot-canonical-v1` | 0 | — |
| `feat/tools-engine-b-step-measurements-v1`, `feat/tools-geometry-convergence-c5-cleanup-v1` | 0 | — |
| `feat/tools-atelier-project-persistence-v1` | 1 | intégré (`-`) |
| `feature/tools-image-vectorization-v1` | 6 | 5 intégrés, 1 non (`2d5aaecd` : API workflow / notices de fiabilité / persistance image) — les fonctions équivalentes (`lib/tracing/api.ts`, `asset-store.ts`) existent dans le train |
| `feat/tools-atelier-report-quantities-v1` | 1 (`e23f5e99`) | non équivalent par patch ; les vues `components/atelier/report` et `quantities` sont présentes dans le train |
| `feat/tools-chantier-exports-p0-v1` | 1 (`2d004225`) | non équivalent par patch ; `lib/exports/chantier-*` présent dans le train |

→ Le train canonique V1 est la base Tools la plus complète et la plus récente.

**Santé de la base (exécuté réellement dans cette session)** :

```text
npm ci --prefix apps/tools                  → OK
apps/tools: npx vitest run                  → 174 fichiers, 1 992 tests, 100 % verts (20,4 s)
apps/tools: npx tsc --noEmit                → 0 erreur
```

Non exécuté : build natif (pas de Xcode/Android SDK), tests pgTAP (voir limites harnais DB documentées dans `docs/qualification/ELSATIA_TOOLS_ENTITLEMENT_CLOUD_SYNC_CLOSURE_V1.md` §0.1).

---

## 2. Inventaire du code Tools

### 2.1 Topologie

Le dépôt n'est pas un monorepo à workspaces : `src/` à la racine = **Gestion Pro** ; `apps/tools`, `apps/reserves`, `apps/colors`, `apps/studio` = applications satellites Next.js indépendantes (chacune son `package.json`) ; `packages/*` = contrats partagés (`application-access`, `client-contracts`, `email`, `platform-support-comms`, `studio-domain`). Base Supabase **partagée** (`supabase/migrations`, 316 migrations).

`apps/tools` : Next.js **16.3.5** (App Router, `next build --webpack`), React 19.2.4, Capacitor 8.5, jsPDF 4.2.1, supabase-js. **Pas de Tailwind** (CSS Modules). 57 000 lignes TS/TSX dans `src/`.

### 2.2 Carte par domaine

| Domaine | Emplacement | Contenu vérifié |
|---|---|---|
| Catalogue d'outils | `src/lib/catalog.ts`, `categories.ts`, `tool-engine.ts`, `calculations.ts`, `units.ts` | 26 outils (16 free, 10 pro). Catégories `volumes`, `flooring`, `measurements`, `conversions` déclarées mais vides |
| Moteur Pro (Engine A) | `src/lib/pro-engine.ts`, `geometry/primitives.ts`, `shapes.ts`, `shape-model.ts`, `plan-model.ts`, `diagram-model.ts` | Moteur historique des calculateurs Pro ; seul à gérer un positionnement « dans une pièce » (`positionInRoom`) |
| Moteur paramétrique (Engine B, canonique) | `src/lib/geometry/engine/` (26 fichiers testés) | Types valeur, générateurs, aires, offset, simplification, contraintes ponctuelles, validation, rapport |
| Modèles de tracés | `src/lib/geometry/models/*.ts` (13) + `adapters/` | Tests de parité figés |
| Snap / hit-test / intersections | `src/lib/geometry/snap.ts`, `hit-test.ts`, `closest-point.ts`, `intersections.ts` | Voir §4 |
| Atelier (tracing) | `src/lib/tracing/` (32 fichiers testés) | `TracingProject` v4, dessin libre, historique, photo, calibration, perspective, contours, fitting, vectorisation, autosave, repository IndexedDB |
| Viewport | `src/lib/viewport/`, `src/components/atelier/viewport/` | SVG, gestes, grille, sélection, poignées |
| UI Atelier | `src/components/atelier/{workshop,free,photo,export,report,quantities,library,model,shared}`, `src/app/atelier/{nouveau,modeles,tracer,export}` | — |
| Projets calculateurs | `src/lib/projects/` | `ToolProject` v1, IndexedDB, **sync Supabase**, fichier `.elsatiatools` |
| Exports | `src/lib/exports/` | PDF, PDF mosaïque 1:1, DXF R12, SVG, PNG, impression, partage natif |
| Métier chantier | `src/lib/chantier/` | nomenclature, marges, profilés, LED, luminaires, report de points, cote témoin, mosaïque, pré-contrôle export |
| Comptes / entitlements | `src/lib/access.ts`, `entitlements.ts`, `auth/`, `components/AccountProvider.tsx` | Voir §7 |
| Monétisation | `src/lib/monetization*.ts`, `native-billing.ts` ; serveur dans GP : `src/lib/tools-monetization.ts`, `src/app/api/tools/monetization/*` | Stripe **test uniquement**, StoreKit 2, Play Billing |
| PWA / natif | `service-worker/`, `src/lib/pwa/`, `capacitor.config.ts`, `ios/`, `android/` | Voir §5 |
| Conseils | `src/lib/conseils/` | Contenu éditorial |

### 2.3 Deux modèles de projet disjoints (point structurant)

| | `ToolProject` (R6) | `TracingProject` (Atelier) |
|---|---|---|
| Fichier | `src/lib/projects/model.ts` | `src/lib/tracing/project.ts` |
| Schéma | `schemaVersion = 1` strict | `TRACING_PROJECT_SCHEMA_VERSION = 4`, migration tolérante v1→v4 (`migration.ts`) |
| Contenu | 1 outil + paramètres (`inputParameters`) | géométrie paramétrique **ou** libre, photos, contours, calques, luminaires, matériaux |
| Local | IndexedDB `elsatia-tools[-company:<id>]` | IndexedDB `elsatia-atelier[-company:<id>]` + blobs `elsatia-atelier-assets` |
| Cloud | **Oui** : table `tools_projects`, RPC `tools_sync_project_entreprise`, révision optimiste, copie de conflit, tombstones | **Non** (différé : `docs/production-workflow.md`, `docs/image-vectorization-v1.md:292`) |
| Lien chantier | `siteName` texte libre, `externalProjectRef` inutilisé | aucun (`roomWidthMm/roomHeightMm` optionnels) |

---

## 3. Matrice du cahier des charges Relevé & Métré

Légende : **EXISTS** (utilisable tel quel) · **PARTIAL** (brique présente, incomplète) · **MISSING** (absent) · **REUSABLE** (brique réutilisable pour construire la fonction) · **NEEDS_REFACTOR** (existe mais doit être restructuré). Une fonction peut combiner plusieurs statuts.

| # | Fonction | Statut | Existant (preuve) | Écart |
|---|---|---|---|---|
| 1 | Structure chantier / bâtiment / étage / pièce | **MISSING** | `ToolProject.siteName` (texte), `TracingProject.type` (ceiling/wall/arch/niche/other), `roomWidthMm/HeightMm` | Aucune hiérarchie, aucun lien `chantiers` GP |
| 2 | Capture terrain (saisie de mesures sur site) | **PARTIAL · REUSABLE** | Offline-first, autosave 1,5 s + flush `pagehide` (`tracing/autosave.ts`), saisie numérique des calculateurs | Aucun flux « relevé pièce par pièce », aucune saisie cote-par-cote de mur |
| 3 | AR | **MISSING** | — ; `Permissions-Policy` Web **refuse** `xr-spatial-tracking` (`src/lib/security-headers.ts:44`) | Aucun code, aucun plugin, aucune preuve de faisabilité |
| 4 | LiDAR | **MISSING** | — | Aucun plugin natif ; nécessite du Swift (RoomPlan/ARKit), iPhone/iPad Pro uniquement |
| 5 | Mesures (longueurs, distances, angles) | **EXISTS · REUSABLE** | `engine/measure.ts`, `api.ts` (`calculateLength`), cotes Engine B (`engine/dimensions.ts`) | Pas de saisie « mesure laser → segment » |
| 6 | Plan automatique | **PARTIAL · REUSABLE** | Contour depuis photo calibrée (Otsu + Sobel + Moore, `edge-detection.ts`), fitting (`fitting.ts`), toujours `status: "proposition"` | Pas de génération de plan de pièce à partir de cotes ; pas de rectangularisation murs |
| 7 | Correction manuelle | **PARTIAL · REUSABLE** | Déplacement de sommet + undo/redo (`free-history.ts`, 100 niveaux), poignées paramétriques | Pas d'insertion/suppression de sommet, pas de contraintes (longueur fixe, orthogonalité) |
| 8 | Portes | **MISSING** | Mots « porte/baie » uniquement dans textes d'usage des modèles d'arches | Entité ouverture hébergée par un mur à créer |
| 9 | Fenêtres | **MISSING** | idem | idem (+ allège, hauteur) |
| 10 | Mobilier | **MISSING** | — | Bibliothèque de symboles à créer |
| 11 | Équipements | **PARTIAL · REUSABLE** | `LightingFixture` (spot, lustre, suspension, alim LED, X/Y) `chantier/lighting.ts` | À généraliser (électricité, plomberie, CVC) |
| 12 | Layers | **PARTIAL · NEEDS_REFACTOR** | 3 systèmes : `ShapeLayer` (Engine A), `TracingLayerId` {visible, locked} (projet), `WORKSHOP/FREE_LAYERS` (UI) | Unifier ; ajouter calques métier (murs, ouvertures, mobilier, réseaux) |
| 13 | Cotes | **PARTIAL · REUSABLE** | Engine B : horizontale, verticale, alignée, rayon, diamètre, angle ; `DimensionsPanel` lecture seule ; DXF calque `COTATIONS` | Aucune cotation manuelle en dessin libre ; pas de chaîne de cotes |
| 14 | Surfaces | **PARTIAL · REUSABLE** | Shoelace, orientation, rejet auto-intersection (`tracing/free-contour.ts`), m² à 3 décimales | **Pas de trous** (déductions), pas de surface murale (périmètre × hauteur − ouvertures) |
| 15 | Volumes | **MISSING** | « ni volume » (`docs/atelier-free-contour-area.md`) | Surface × hauteur sous plafond à créer |
| 16 | Revêtements | **PARTIAL** | `MaterialLine {label, quantity, unit: ml/m²/u, quality}` (`chantier/nomenclature.ts`), marges 0/5/10/15 % (`margins.ts`), outils Free peinture/plaques/isolation | Pas d'affectation d'un revêtement à un sol/mur/plafond de pièce ; aucun UI n'alimente `project.materials` |
| 17 | Photos | **PARTIAL · REUSABLE** | Import JPEG/PNG/WEBP ≤ 40 Mo, EXIF, calibration, stockage blob IndexedDB (`asset-store.ts`) | Pas de capture caméra, pas d'ancrage photo ↔ pièce/mur, pas de cloud |
| 18 | Annotations | **PARTIAL** | Calque `annotations`, `note` sur luminaires/matériaux, `ToolProject.notes` ≤ 1 000 car. | Pas d'annotation positionnée sur plan/photo |
| 19 | Notes vocales | **MISSING** | Aucun `MediaRecorder` ; `microphone` refusé par `Permissions-Policy` | — |
| 20 | Métrés | **PARTIAL · REUSABLE** | Quantités `q-<id>-area` / `-perimeter`, nomenclature, profilés (barres), LED (rouleaux) | Pas de métré structuré par pièce/ouvrage |
| 21 | Métrés métier (peinture, sol, plinthes, faïence, plaques…) | **PARTIAL** | Calculateurs isolés `quantite-peinture`, `calcul-plaques`, `isolation` (`calculations.ts`) | À recâbler sur la géométrie de la pièce |
| 22 | Erreurs / contrôles | **PARTIAL · REUSABLE** | `engine/validate.ts` (collecte sans throw), `chantier/pre-export-check.ts` (bloquant), qualité de calibration (excellent ≤ 0,5 % … insuffisant > 5 %) | Contrôles métier (pièce non fermée, diagonales incohérentes, somme des cotes ≠ total) à créer |
| 23 | Plan existant | **MISSING** | — | Notion d'état « existant » |
| 24 | Plan rénové | **MISSING** | — | Variante/état « projet » + diff |
| 25 | Estimation simplifiée | **MISSING** | Aucune logique de prix (`profiles.ts` : « Sans transformer Tools en logiciel de devis ») | À concevoir avec prudence pour ne pas cannibaliser GP |
| 26 | PDF | **EXISTS · REUSABLE** | `chantier-pdf.ts` (dossier multipage), `pdf.ts` (ToolProject), mosaïque 1:1 | Gabarits relevé (plan par étage, tableau de métré) à ajouter |
| 27 | DXF | **EXISTS · REUSABLE** | `dxf.ts` R12 `AC1009`, `$INSUNITS=4` (mm), calques colorés, `validateDxfStructure` | Calques métier, blocs portes/fenêtres, pas de points isolés |
| 28 | CSV / Excel | **MISSING** | grep `csv|xlsx` : 0 résultat dans `apps/tools/src` | Trivial à ajouter côté CSV |
| 29 | GP sync | **MISSING** | Bannière `gestion-pro-quantitatifs` (`promotions.ts:9`) | Contrat de données §8 |
| 30 | Historique / versioning | **PARTIAL · NEEDS_REFACTOR** | Undo/redo en mémoire (3 piles), `revision` serveur `tools_projects`, copies de conflit | Pas d'historique de versions nommées ; pas de sync Atelier |

Comptage : **EXISTS 3** (mesures, PDF, DXF) · **PARTIAL 16** · **MISSING 11** (dont 4 bloquants structurels : hiérarchie, murs/ouvertures, capture caméra, sync Atelier).

---

## 4. Moteur géométrique

### 4.1 Architecture

Deux moteurs coexistent, un troisième est **interdit** (`apps/tools/docs/GEOMETRY_ENGINES_BOUNDARY_V1.md`) :

- **Engine B** (`src/lib/geometry/engine/`) — **canonique** pour l'Atelier et la bibliothèque. Types valeur sans id (`Point2D`, `Segment2D`, `Arc2D`, `Circle2D`, `Ellipse2D`, `Polyline2D`, `Polygon2D`, `Transform2D` 2×3), registre de générateurs (`registerShapeGenerator` / `buildParametricShape`).
- **Engine A** (`primitives.ts`, `shapes.ts`, `shape-model.ts`…) — legacy Pro, types avec `id`, seul à porter un positionnement en pièce.
- Pont unique : `src/lib/geometry/adapters/` ; port tracing → Engine B : `src/lib/tracing/geometry-port.ts`.
- **Dessin libre** : seconde source de vérité `FreeGeometry` (`tracing/free-geometry.ts`, `FREE_GEOMETRY_VERSION = 1`), projetée vers `ShapeGeometry` (`free-shape.ts`). Entités `point | segment | polyline | polygon` `{id, kind, points}`.

**Règle imposée pour Relevé & Métré** : pas de troisième moteur. Les entités bâtiment (mur, ouverture…) doivent être un **modèle métier au-dessus d'Engine B**, projeté vers `ShapeGeometry` comme le dessin libre, jamais un moteur géométrique parallèle.

### 4.2 Caractéristiques précises

| Sujet | Constat | Fichier |
|---|---|---|
| Système de coordonnées | Monde : X droite, **Y haut** ; origine P0 (pièce) ou O (forme). Écran : px CSS, Y bas ; `worldToScreen` inverse Y ; `view.scale` en px/mm | `shape-model.ts:19`, `viewport-math.ts:9-69` |
| Unités | **mm partout** en interne ; angles en radians (degrés aux frontières) ; affichage mm/cm/m ; aires m² (3 déc.) | `docs/geometry-engine.md`, `shared/format.ts` |
| Précision | `EPSILON` 1e-9 ; doublons 1e-6 ; sommet libre 1e-3 mm ; limite coordonnées ±1 000 000 mm (= ±1 km, suffisant pour un bâtiment) ; arrondi uniquement à l'affichage (0,1 mm) | `engine/types.ts:56`, `free-geometry.ts:143,150` |
| Snap | `point, endpoint, midpoint, center, intersection, grid` avec priorité ; tolérance en px convertie en mm (souris 10 px, tactile 16 px) | `geometry/snap.ts`, `viewport/pointer-targeting.ts` |
| Snap manquant | **angle / ortho / perpendiculaire / tangente absents du viewport** (déclarés dans `engine/snap.ts` mais non branchés) | — |
| Murs | **Absents** (seules lignes de construction « bord de pièce », sans épaisseur, Engine A) | `shapes.ts:73-101` |
| Segments | Oui (Engine B + libre) | — |
| Polygones | Oui, 3–500 sommets, fermeture implicite, **un seul anneau (pas de trous)** | `free-geometry.ts:83`, `free-contour.ts` |
| Pièces | **Absentes** comme entités | — |
| Ouvertures | **Absentes** | — |
| Contraintes | Fonctions ponctuelles (horizontal, vertical, parallèle, perpendiculaire, concentrique, tangent, symétrie) **sans solveur, non branchées à l'UI** ; pas de contrainte de longueur | `engine/constraints.ts` |
| Undo/redo | 3 piles : paramétrique (delta de params, 100), libre (pattern commande `create/delete/move-vertex`, 100), générique snapshot (50). Raccourcis Cmd/Ctrl+Z / Shift+Z / Y | `param-history.ts`, `free-history.ts`, `history.ts` |
| Sérialisation | JSON, validation TypeScript manuscrite (pas de JSON Schema), migration refusant versions futures et champs inconnus ; géométrie paramétrique **non stockée** (recalculée) | `project.ts`, `migration.ts` |
| Rendu | **SVG React** uniquement (pas de canvas/WebGL pour le dessin) | `PlanViewport.tsx:252` |
| Performance | `useMemo`, hover coalescé en rAF, index d'intersections en `WeakMap`, pré-filtre bbox. Plafonds : 1 000 entités libres, 5 000 sommets, 20 000 points contour. Tests de charge : 100 entités / 400 poignées / ~2 500 intersections < 1,5 ms | `free-drawing-load.test.ts`, `free-drawing-intersections-r2.test.ts` |
| Tests | ~123 fichiers / ~1 390 cas sur geometry + tracing + viewport + atelier | — |

### 4.3 Réutilisation

| Brique | Verdict | Usage Relevé |
|---|---|---|
| Engine B (types, aires, mesures, offset, intersections, validate) | **REUSE** | Base de tout calcul ; `offset` pour l'épaisseur des murs |
| `FreeGeometry` + historique commande | **REUSE / EXTEND** | Modèle à étendre ou à dupliquer en `ReleveGeometry` avec nouvelles opérations (`insert-vertex`, `set-length`, `add-opening`) |
| Snap / hit-test / sélection | **REUSE + compléter** | Brancher angle/ortho/perpendiculaire (déjà dans `engine/snap.ts`) |
| Viewport / gestes / grille | **REUSE** | Tel quel |
| Contraintes | **NEEDS_REFACTOR** | Solveur minimal (longueurs fixées + orthogonalité) nécessaire à la « correction manuelle » |
| Calques | **NEEDS_REFACTOR** | Unification des 3 systèmes |
| Engine A | **NE PAS RÉUTILISER** | Legacy, en convergence vers B |

Risque de performance : un étage de 10 pièces ≈ 40–80 murs, 20–40 ouvertures, 50–100 cotes, 50 symboles — **dans les plafonds actuels**, mais le SVG n'a été mesuré que sur ~60–400 éléments. Un bâtiment multi-étages doit être rendu **étage par étage**.

---

## 5. Mobile / tablette

Principe : **aucune capacité matérielle n'est revendiquée si elle n'est pas prouvée**. Validation native connue : émulateur Android API 36 et simulateur iOS 26.5 uniquement ; **aucun appareil physique** (`apps/tools/docs/native-validation-r7.md`).

| Sujet | Constat | Preuve |
|---|---|---|
| Responsive | CSS Modules ; bottom sheet < 767 px, 2 colonnes ≥ 900 px ; **pas de layout tablette dédié** ; revendication tablette Google Play non tranchée (J-9) | `viewport.module.css:583,607`, `store-preflight-v1.md` |
| Tactile | Pointer Events unifiés, pan 1 doigt, pinch 2 doigts, `touch-action: none`, seuil 6 px, routage geste décidé au `pointerdown` | `use-viewport-gestures.ts`, `gesture-routing.ts` |
| Précision pointeur | Tactile : sélection 20 px, snap 16 px, poignée 26 px ; stylet traité comme souris ; pas de pression/palm-rejection | `pointer-targeting.ts` |
| Multi-sélection | Desktop uniquement (Shift+clic), pas de lasso | `selection-set.ts` |
| Caméra | **Absente** : pas de `getUserMedia`, pas de `<input capture>`, `@capacitor/camera` **non installé**, pas de `NSCameraUsageDescription`, seul `INTERNET` dans `AndroidManifest.xml` | `package.json`, `Info.plist`, manifest |
| Orientation / capteurs | **Absents** ; le Web **refuse** `accelerometer, camera, geolocation, gyroscope, magnetometer, microphone, xr-spatial-tracking` via `Permissions-Policy` | `security-headers.ts:27-45` |
| WebXR | **Absent et bloqué** sur le Web. Rappel factuel : WebXR `immersive-ar` n'est pas disponible dans Safari iOS ; il existe sur Chrome Android (ARCore) | — |
| ARKit / ARCore | **Faisabilité non prouvée.** Nécessite un plugin Capacitor natif (Swift / Kotlin) ; aucun plugin custom hors `SecureSession` et `NativeBilling` | `SceneDelegate.swift`, `MainActivity.java` |
| LiDAR | **Faisabilité non prouvée.** Uniquement iPhone Pro / iPad Pro récents ; RoomPlan exige iOS 16+ alors que la cible est **iOS 15** | `project.pbxproj` `IPHONEOS_DEPLOYMENT_TARGET = 15.0` |
| Laser Bluetooth (DISTO, Bosch) | **Absent** ; Web Bluetooth indisponible sur Safari iOS → natif obligatoire | — |
| PWA | SW versionné par hash, précache critique all-or-nothing, pages network-first 3 s, jamais `/api`, `/auth`, RSC ; mise à jour sur action utilisateur | `service-worker/sw-tools.source.js`, `lib/pwa/` |
| Natif | Export statique (`output: "export"`), **aucune route API, aucune server action** — toute logique serveur passe par Supabase ou l'API billing GP | `next.config.ts` |
| Stockage appareil | IndexedDB (projets, blobs), localStorage, Capacitor Preferences ; **aucune gestion de quota** (`storage.estimate`, `persist()`, `QuotaExceededError` absents) | `asset-store.ts`, `storage.ts` |
| Versions | iOS 15+, iPhone + iPad ; Android minSdk 24, target 36 | `variables.gradle` |

Conséquences : (a) la capture photo terrain est **faisable à court terme** (Web `<input capture>` après levée ciblée de la `Permissions-Policy`, ou `@capacitor/camera`) ; (b) AR/LiDAR/laser sont des **projets natifs à part entière** à qualifier sur appareils physiques avant tout engagement commercial ; (c) le stockage photo local sans gestion de quota est un risque réel pour un relevé de 100+ photos.

---

## 6. Modèle de données

### 6.1 Existant

**Tools (Supabase)** : `tools_projects` (`20260830000236`, scoping entreprise `…238`, gating `…324`), `entitlements_utilisateurs_elsatia`, `historique_entitlements_elsatia`, `tools_monetization_{customers,subscriptions,events}`, `tools_demandes_suppression_compte`. **Aucune table pour l'Atelier**, aucun bucket Storage Tools.

**Tools (local)** : `ToolProject` v1, `TracingProject` v4 (`FreeGeometry` v1, `ReferenceImage` avec calibration, `RawContour`, `GeometricShape`, `LightingFixture`, `MaterialLine`, `layers`).

**Gestion Pro (tables pertinentes)** :

| Table | Champs clés | Migration |
|---|---|---|
| `chantiers` | `entreprise_id, reference_interne, client_id, nom, adresse, code_postal, ville, statut, latitude, longitude, devis_source_id` | `20260710000004`, `…0137`, `20260824000227` |
| `devis` / `lignes_devis` | `chantier_id` ; lignes : `designation, description, type, quantite numeric(12,3), unite, prix_unitaire_ht, remise_ligne, taux_tva, ordre` — **pas de lot/section** | `20260710000005` |
| `metres` / `lignes_metres` | `chantier_id, devis_id, numero, nom, date_releve, notes` ; lignes : `designation, formule, longueur, largeur, hauteur, nombre, deduction, resultat, unite, ordre` | `20260715000080_suite_metier_complete.sql:101-112` |
| `documents_chantier` | `chantier_id, categorie (photo_avant/pendant/apres, plan…), storage_path, mime_type, taille ≤ 15 Mo` | `20260710000022` |
| `prestations_catalogue`, `modeles_devis` | bibliothèque de prix / modèles | `…0012`, `…0080` |

**Précédent satellite → GP** : `reserves_chantiers.chantier_gp_id` + `reserves_importer_chantier_gp()` (`20260906000268` §17) — double autorisation (rôle satellite + `acces_chantiers` GP). **Pattern à reproduire.**

### 6.2 Delta minimal proposé (sans migration définitive)

Principe : **agrégat JSON versionné côté client** (comme `TracingProject`), synchronisé comme **un document** par relevé (comme `tools_projects.project_payload`) — et **non** 14 tables relationnelles. Les tables relationnelles ne sont justifiées que pour ce que le serveur doit interroger (liste, lien chantier, révisions, médias).

```text
ReleveProject (schemaVersion: 1)                       ← nouvel agrégat, IndexedDB + sync
├─ id, name, companyId, userId, createdAt, updatedAt
├─ gpLink?: { chantierId, clientId?, linkedAt, syncStatus }   (ref faible, comme ClientReference)
├─ address? (copie affichage, jamais autorité)
├─ buildings: Building[]
│   └─ Building { id, name, floors: Floor[] }
│       └─ Floor { id, name, level, elevationMm, defaultCeilingHeightMm,
│                  state: "existing" | "renovated",  variantOf?: floorId }
│           ├─ zones: Zone[]         { id, name, roomIds[] }            (logement, lot…)
│           ├─ walls: Wall[]         { id, a: Point2D, b: Point2D, thicknessMm,
│           │                          heightMm?, kind: exterior|interior|partition, layerId }
│           ├─ rooms: Room[]         { id, name, usage, boundary: wallId[] | Polygon2D,
│           │                          holes?: Polygon2D[], ceilingHeightMm?,
│           │                          finishes: { floor?, walls?, ceiling? : MaterialRef } }
│           ├─ openings: Opening[]   { id, wallId, kind: door|window|bay|opening,
│           │                          offsetMm, widthMm, heightMm, sillHeightMm?, swing?, blockRef? }
│           ├─ equipments: Equipment[] { id, kind, category: furniture|electric|plumbing|hvac|lighting,
│           │                          position, rotationRad, sizeMm?, roomId?, layerId }
│           ├─ measurements: Measurement[] { id, kind: length|height|diagonal|angle,
│           │                          targetRef, valueMm, source: manual|laser|photo|ar|lidar,
│           │                          accuracyMm?, takenAt }
│           ├─ annotations: Annotation[] { id, anchor: {point}|{entityRef}, text, audioAssetRef? }
│           └─ photoAnchors: PhotoAnchor[] { id, assetRef, anchor: point|entityRef,
│                                          directionRad?, calibration? (réutilise ReferenceImage) }
├─ materials: Material[]       { id, label, category: floor|wall|ceiling|skirting|other,
│                               unit, wastePercent, gpPrestationRef? }
├─ quantities: Quantity[]      ← DÉRIVÉES, jamais saisies ; recalculées ; stockées en cache
│                               { key, roomId?, label, value, unit, formula, quality: exact|estimate }
└─ layers: LayerDef[]          { id, kind, visible, locked }   ← remplace les 3 systèmes existants
```

Versioning :
- `Version` = **snapshot serveur immuable** `{releveId, revision, createdAt, createdBy, label?, payloadHash}` (table dédiée), distinct des révisions de sync ; l'historique utilisateur ne doit pas reposer sur l'undo/redo en mémoire.
- `schemaVersion` + migration tolérante en lecture / stricte en écriture (pattern `tracing/migration.ts`).

Tables serveur envisagées (**à valider au lot 2, pas créées ici**) :

| Table | Rôle |
|---|---|
| `tools_releves` | document courant (`payload jsonb`, `revision`, `chantier_gp_id` nullable, `entreprise_id`, `deleted_at`) — pattern `tools_projects` |
| `tools_releves_versions` | snapshots immuables |
| `tools_releves_medias` | photos / audio (`storage_path`, `mime`, `taille`, `releve_id`, `anchor_id`) + bucket privé `tools-releves` |
| `tools_releves_exports_gp` | journal idempotent des transferts vers GP (`idempotency_key`, `metre_id`, `devis_id`, `status`) |

Réutilisation : `Point2D`/`Polygon2D` Engine B ; `ReferenceImage` + calibration ; `MaterialLine` → `Material` ; `LightingFixture` → `Equipment(category: lighting)` ; `assetRef` + `asset-store.ts` pour les blobs.

Pourquoi ne pas étendre `TracingProject` : il est mono-pièce, mode exclusif paramétrique/libre, déjà en v4 avec validation stricte des champs inconnus ; y greffer une hiérarchie bâtiment le rendrait ingérable et casserait l'Atelier.

---

## 7. Entitlement premium

### 7.1 Existant

- Client : `ACCESS_TIERS = ["free","pro"]`, 18 `CAPABILITIES`, `TIER_CAPABILITIES.pro = CAPABILITIES` (`src/lib/access.ts`).
- `entitlementToAccess()` : `if (… tier !== "pro") return FREE_ACCESS;` (`src/lib/entitlements.ts:49`) et filtre les capabilities inconnues. Cache hors-ligne HMAC 7 jours.
- Serveur : `entitlements_utilisateurs_elsatia.niveau CHECK ('free','pro')`, `capabilities text[]` (≤ 64) — **le stockage supporte déjà des capabilities par ligne**.
- **Liste des 18 capabilities codée en dur** dans `plateforme_attribuer_entitlement_utilisateur` (whitelist), `tools_server_appliquer_abonnement` (`…237`), branche propriétaire de `tools_resoudre_entitlements` (`20260906000266:391-393`).
- `tools_monetization_subscriptions.product_sku CHECK IN ('tools_pro_monthly','tools_pro_annual')` (`…237:32`) ; whitelists natives dans `NativeBillingPlugin.swift` et `NativeBillingPlugin.java`.
- **Seule `saved-projects` est vérifiée côté serveur** (`tools_a_droit_cloud_sync`, `…324`) ; tout le reste est un gate client. Les écrans Atelier n'ont **aucun gate** de capability.
- Prix Tools Pro : **indicatifs 4,99 €/mois, 49 €/an** (`docs/r9-monetization.md:30`), aucun produit créé dans les Stores, Stripe Tools **test uniquement**, R9 = NO-GO global.

### 7.2 Proposition (non activée)

Paliers cibles :

| Palier | Contenu | Statut |
|---|---|---|
| Tools Free | 16 outils, sans compte | inchangé |
| Tools Standard (= Tools Pro actuel) | 18 capabilities actuelles | inchangé, renommage marketing éventuel seulement |
| Tools Relevé Pro | Standard **+** `releve-metre` (+ sous-capabilities futures) | 24,90 € HT/mois, 249 € HT/an — **prix de travail, non activé** |

Capability candidate : **`releve-metre`**. Sous-capabilities envisageables plus tard (non créées) : `releve-metre.export-gp`, `releve-metre.capture-native`.

Recommandation technique : **niveau `pro` + capability additionnelle portée par un SKU distinct**, plutôt qu'un troisième `niveau` :
1. Ajouter `releve-metre` à `CAPABILITIES` **sans** l'ajouter à `TIER_CAPABILITIES.pro` (sinon tout Pro l'obtiendrait) → introduire une liste `ADDON_CAPABILITIES`.
2. `entitlementToAccess` : conserver les capabilities d'add-on reçues du serveur, y compris pour un tier `pro` ; un ancien client les ignore sans casse (filtre `validCapability`).
3. SQL : factoriser les 18 capabilities en **une fonction unique** `tools_capabilities_pro()` et ajouter `tools_capabilities_releve()` ; `tools_server_appliquer_abonnement` choisit la liste selon `product_sku`.
4. Étendre le CHECK `product_sku` (`tools_releve_monthly`, `tools_releve_annual`) + env `STRIPE_TOOLS_RELEVE_PRICE_*` + whitelists natives.
5. **Gate serveur obligatoire** sur les RPC/RLS `tools_releves*` via `tools_resoudre_entitlements()->'capabilities' ? 'releve-metre'` (pattern `tools_a_droit_cloud_sync`) — un gate client seul serait contournable.
6. Pas de backfill nécessaire pour les Pro existants (ils ne doivent pas recevoir la capability).
7. Propriétaire / admin plateforme : ajouter la capability dans la branche `plateforme` (sinon l'équipe ne peut pas tester).

Non-régression : les tests `supabase/tests/elsatia_tools_r8/r9/r10.test.sql` et `elsatia_tools_cloud_sync_entitlement_closure_v1.test.sql` + `src/lib/access.test.ts`, `entitlements.test.ts`, `monetization.test.ts` doivent rester verts sans modification de leurs assertions Free/Pro.

**Aucune activation commerciale sans validation explicite** : pas de produit Stripe/Store, pas de prix live.

---

## 8. Intégration Gestion Pro

### 8.1 Existant

- **Tools → GP : rien**, hors bannière `gestion-pro-quantitatifs` (`apps/tools/src/lib/promotions.ts:9`).
- Socle partagé : même Supabase, même `entreprises`, `a_acces_application(entreprise, 'tools')`, `tools_projects.organization_id → entreprises`.
- GP dispose déjà de **`metres` / `lignes_metres`** (UI « Métré assisté », `src/app/(app)/ouvrages/page.tsx`, action `creerMetreAction` `src/app/actions/suite-metier.ts:250`) — **aucune fonction métré → lignes de devis**.
- GP : `appliquer_modele_devis()` (`20260715000080:307`) insère des lignes dans un devis brouillon → modèle pour l'automatisation de devis.
- `packages/client-contracts` : enveloppes de sync typées (opérations, `idempotencyKey`, règle « app → GP = proposition uniquement »), `CLIENT_SOURCE_APPLICATIONS` inclut `tools` ; **pas de contrat chantier ni ligne de devis**.
- Précédent Réserves : `chantier_gp_id` + `reserves_importer_chantier_gp()` (non appelé par le code applicatif).

### 8.2 Contrat de données futur (proposition)

Nouveau package `packages/releve-contracts` (sans dépendance, même style que `client-contracts`) :

```ts
type ReleveToGpEnvelope = {
  contractVersion: 1;
  idempotencyKey: string;            // releveId + revision + target
  source: { app: "tools"; releveId: string; revision: number; exportedAt: string };
  tenant: { entrepriseId: string };
  target: { chantierId: string; devisId?: string };   // GP autoritaire
  metre: {
    nom: string; dateReleve: string; notes?: string;
    lignes: Array<{
      designation: string;          // "Séjour — sol — carrelage"
      roomRef?: string; floorRef?: string;
      formule: string;              // compatible lignes_metres.formule
      longueur?: number; largeur?: number; hauteur?: number;   // m (conversion mm→m à la frontière)
      nombre: number; deduction: number; resultat: number;
      unite: "m²" | "ml" | "m³" | "u";                         // ⊂ UNITES GP
      quality: "exact" | "estimate";
      gpPrestationRef?: string;     // prestations_catalogue.id, suggestion seulement
    }>;
  };
  documents?: Array<{ kind: "plan_pdf" | "plan_dxf" | "photo"; storagePath: string; mime: string; bytes: number }>;
};
```

Règles :
- **GP autoritaire** sur chantier, client, prix. Tools ne pousse **que des quantités**, jamais de prix (sauf estimation locale non transmise).
- Écriture via **RPC GP `SECURITY DEFINER`** (ex. `gp_importer_metre_releve(envelope)`) : double autorisation (capability `releve-metre` + permission GP `gerer_ouvrages`), idempotence, cible = `metres`/`lignes_metres` puis `documents_chantier` (catégorie `plan`).
- Lot 18 : `gp_metre_vers_lignes_devis(metre_id, devis_id, mapping)` sur le modèle d'`appliquer_modele_devis`, uniquement sur devis `brouillon`.
- Mapping unités : mm (Tools) → m / m² / m³ (GP) à la frontière, arrondi 3 décimales (`numeric(12,3)`).

---

## 9. Risques techniques majeurs (top 10)

| # | Risque | Domaine | Gravité | Mitigation |
|---|---|---|---|---|
| R1 | Capteurs mobiles (caméra, gyroscope) non disponibles : aucune permission native, `Permissions-Policy` Web bloquante, aucun test physique | mobile sensors | Haute | Lot capture caméra seul d'abord ; tests sur ≥ 3 appareils physiques ; ne rien promettre en marketing |
| R2 | Moteur géométrique sans murs épais, sans trous, sans solveur de contraintes → la correction manuelle devient fragile | geometry | Haute | Modèle Wall/Room au-dessus d'Engine B ; solveur minimal borné (longueur + ortho) ; tests de propriétés |
| R3 | LiDAR/AR : code natif Swift/Kotlin, iOS 16+ pour RoomPlan (cible actuelle iOS 15), parc d'appareils restreint | LiDAR | Haute | Traiter en option expérimentale, jamais prérequis ; import RoomPlan USDZ/JSON en natif isolé |
| R4 | Stockage : photos locales sans gestion de quota ; aucun bucket Tools ; RGPD photos (visages, adresses) | storage | Haute | `storage.persist()`, compression, quotas, bucket privé, purge RGPD alignée sur l'existant |
| R5 | IA (reconnaissance d'ouvertures, plan auto) : aucune IA dans Tools, coût par appel, résultats non déterministes | AI | Moyenne | Toujours « proposition » (pattern `edge-detection`) ; budget par utilisateur ; lot optionnel |
| R6 | Performance SVG sur bâtiment multi-étages sur tablette d'entrée de gamme ; mesuré seulement jusqu'à ~400 éléments | performance | Moyenne | Rendu par étage, virtualisation des calques, benchmarks 500/2 000 entités dans les tests |
| R7 | Offline : relevé en sous-sol sans réseau ; perte si IndexedDB purgé (iOS purge après 7 jours sans usage pour les sites Web non installés) | offline | Haute | Natif prioritaire pour le terrain, `persist()`, export fichier de sauvegarde |
| R8 | Sync : le document relevé est gros (JSON + médias) ; la stratégie « copie de conflit » est lourde pour une édition multi-appareil | sync | Moyenne | Sync document + médias séparés ; révisions ; conflit par étage plutôt que par projet |
| R9 | Exports : DXF R12 sans blocs, PDF non paginé par étage, pas de CSV ; attentes métier (architectes) élevées | exports | Moyenne | Calques/blocs DXF normalisés ; gabarits PDF relevé ; CSV simple d'abord |
| R10 | Prix/coût : écart 4,99 € (Tools Pro) vs 24,90 € (Relevé Pro), coût stockage photos + IA, commission Stores 15–30 % ; entitlement mono-palier | pricing/cost | Haute | Relevé Pro inclut Standard ; modèle de coût par utilisateur avant commercialisation ; refonte entitlement (§7) |

---

## 10. Ce que cette mission n'a pas fait

- Aucune implémentation, aucune migration, aucun produit Stripe/Store.
- Aucun test sur appareil physique ; aucune mesure de performance sur tablette réelle.
- Tests pgTAP non rejoués dans cette session (limite harnais documentée).
- Faisabilité AR/LiDAR : analysée sur pièces du dépôt uniquement, **non prouvée**.

## Annexe — preuves de commandes

```text
git fetch --all --prune
git log -1 origin/integration/elsatia-canonical-train-v1   → 1c1fed66 (2026-09-26)
git ls-tree -r --name-only <branche> -- apps/tools | wc -l  → 631 (train V1) / 180 (trains v2/v3 écosystème) / 0 (main)
apps/tools: npx vitest run                                  → 174 files, 1992 tests passed
apps/tools: npx tsc --noEmit --incremental false            → exit 0
grep -rn "getUserMedia\|capture=" apps/tools/src            → aucun usage caméra
grep -rin "csv\|xlsx" apps/tools/src                        → aucun
```
