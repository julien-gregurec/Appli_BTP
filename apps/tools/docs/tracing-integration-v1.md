# Atelier de traçage ELSATIA Tools — Architecture d'intégration V1

Branche : `integration/tools-tracing-v1` — consolidation des 3 lots (moteur géométrique,
workflow production, bibliothèque de tracés décoratifs). Aucun déploiement, aucune fusion `main`.

> Cette V1 est une **architecture de transition assumée** : deux moteurs géométriques
> coexistent avec des responsabilités séparées. La convergence est une phase ultérieure
> dédiée (voir §12), pas l'objet de cette intégration.

---

## 1. Architecture finale (post-intégration)

```
                    ┌─────────────────────────────────────────────┐
   UI Atelier  ───► │  components/Trace*  ·  /outils/traces-preview │  (interne, noindex)
                    └───────────────┬─────────────────────────────┘
                                    │ consomme
        ┌───────────────────────────┴───────────────────────────┐
        ▼                                                       ▼
┌──────────────────────────┐                     ┌──────────────────────────────┐
│  MOTEUR HISTORIQUE (A)   │                     │  GEOMETRY ENGINE générique(B) │
│  lib/geometry/           │   (pas de           │  lib/geometry/engine/         │
│  primitives · shapes ·   │    dépendance       │  types *2D · transform ·      │
│  shape-model · trace-*   │    croisée)         │  intersections · measure ·   │
│  plan-model · models/    │                     │  area · offset · simplify ·  │
│  (13 modèles TraceModel) │                     │  snap · constraints ·        │
└──────────┬───────────────┘                     │  dimensions · report ·       │
           │                                     │  générateurs paramétriques · │
           │ types Quantity / ShapeGeometry      │  api · validate · model      │
           │ (imports type-only)                 └──────────────┬───────────────┘
           ▼                                                    │ via
┌──────────────────────────────────────────────┐   lib/tracing/geometry-port.ts
│  PRODUCTION / CHANTIER                        │◄──────────────┘
│  lib/tracing/    image · calibration ·        │
│                  vectorisation · TracingProject│
│  lib/chantier/   report-table · nomenclature ·│
│                  margins · led · profiles ·   │
│                  lighting · witness · mosaic ·│
│                  pre-export-check             │
│  lib/exports/    dxf (ASCII R12) · svg · pdf  │
└──────────────────────────────────────────────┘
```

Frontières **strictes** :
- Le moteur B **n'importe jamais** le moteur A (vérifié : 0 import).
- Le moteur A **n'importe jamais** le moteur B.
- `lib/tracing/` et `lib/chantier/` importent **uniquement** le moteur B via
  `tracing/geometry-port.ts` (adaptateur unique), sauf deux imports **type-only** d'Engine A
  (`Quantity`, `ShapeGeometry`) à la frontière export (`chantier/nomenclature.ts`,
  `exports/dxf.ts`) — pour rester compatibles avec le chemin d'export des outils Pro existants.

---

## 2. Moteur historique — « Engine A » (`lib/geometry/`)

Responsable de tout ce qui est **déjà recetté et consommé par l'UI** :

| Fichier | Rôle |
|---|---|
| `primitives.ts` | `Point {id,x,y,label?,role?}`, `Vector`, `Segment`, `Circle`, `Arc`, `Ellipse`, `Line`, `Ray`, `Polyline`, `Polygon`, `Dimension` ; `distance`, `rotate`, `polar`, `lineIntersection`, `circleCircleIntersections`, `tangentPoints`, `divideCircle`, `sagitta`… `EPSILON = 1e-9`. |
| `shape-model.ts` | `ShapeGeometry`, `Quantity {quality:"exact"|"estimate"}`, `SiteStep`, `SiteControl`, `validateShapeGeometry`. |
| `trace-model.ts` | `TraceModel = ShapeGeometry & {...}`, `TraceParameter`, `TraceExplanation`, `validateTraceModel` (enveloppe `validateShapeGeometry`). |
| `trace-render.ts` | logique pure de visibilité/navigation par étape (sans DOM). |
| `transforms.ts` | `scale`, `reflect`, `repeatRadial` (transformations point-à-point). |
| `plan-model.ts` | mm → espace SVG écran (`createPlanTransform`, `createArcPath`, `createPolygonPath`…). |
| `models/` (13) | `circle-division`, `star`, `rosette`, `heart`, `arch-full-round`, `ogive`, `ellipse-pedagogical`, `spiral`, `flower4`, `flower5`, `flower6-elongated`, `turbine`, `double-s` — chacun `create*Geometry(params) → TraceModel`, registre lazy `models/index.ts`. |
| `models.ts` | modèles décoratifs **historiques** des outils Free (distinct de `models/`). |
| composants | `TraceViewer`, `TraceSteps`, `SiteMode`, `TraceParametersForm`, `TracesPreviewWorkspace`. |

**Ne pas** réécrire ces modèles ni porter cette UI vers Engine B dans cette phase.

---

## 3. Nouveau geometry engine — « Engine B » (`lib/geometry/engine/`)

Moteur **générique, additif, sans DOM**, unité canonique mm. Point d'entrée `engine/index.ts`.

| Domaine | Fichiers |
|---|---|
| Types | `types.ts` — `Point2D`, `Vector2D`, `Line2D`, `Segment2D`, `Circle2D`, `Arc2D`, `Ellipse2D`, `Polyline2D`, `Polygon2D`, `Transform2D` (matrice affine), `MeasuredValue {quality:"exact"|"approximated"}`. |
| Calcul | `angles.ts`, `transform.ts` (affine composable), `measure.ts`, `area.ts`, `intersections.ts` (line/seg/circle/arc, toutes combinaisons), `circle-tools.ts`, `geometry-ops.ts`. |
| Atelier | `offset.ts`, `simplify.ts` (Douglas–Peucker), `snap.ts`, `constraints.ts`, `dimensions.ts`, `report.ts` (table de report). |
| Modèle | `model.ts` — `ParametricShape`, `ShapePrimitives`, `ConstructionStep`, registre `registerShapeGenerator`/`buildParametricShape`, `serializeShape`/`deserializeShape` (recalcul depuis type+paramètres). |
| Générateurs | `basic-shapes.ts`, `polygons.ts`, `stars.ts`, `arches.ts`, `radial-pattern.ts`, `petals.ts`, `rosettes.ts`, `spirals.ts`, `curves.ts`, `hearts.ts`. |
| API | `api.ts` — `offsetShape`, `scaleShape`, `rotateShape`, `calculateLength`, `calculateArea`, `generateConstructionSteps`. |
| Validation | `validate.ts` — `validateGeometry` : non-finis, rayon ≤ 0, points confondus, hors bounding box, **auto-intersection**, offset impossible. |

Destiné aux **futures formes utilisateur** de l'Atelier et au workflow production.
Non consommé par l'UI décorative actuelle.

---

## 4. Production workflow (`lib/tracing/`, `lib/chantier/`, `lib/exports/dxf.ts`)

| Fichier | Rôle | État |
|---|---|---|
| `tracing/geometry-port.ts` | adaptateur unique vers Engine B (+ `perpendicularDistance`, `simplifyPolyline`) | opérationnel |
| `tracing/measurement-origin.ts` | `MeasurementOrigin` (`exact>manual>calibrated>imported>approximated`), `combineOrigins`, `originWarning` | opérationnel |
| `tracing/reference-image.ts` | formats (jpg/png/webp ; heic **reconnu mais différé**), `detectFormat`, redressement px, **`pixelsToMillimetres` lève tant que l'échelle n'est pas calibrée** | logique pure opérationnelle ; décodage/canvas différé |
| `tracing/vectorization.ts` | simplification/échantillonnage de contours préparé | opérationnel (pas de CV auto) |
| `tracing/project.ts` | `TracingProject`, `TRACING_PROJECT_SCHEMA_VERSION`, `validateTracingProject`, `migrateProject` | modèle + validation opérationnels ; **persistance IndexedDB/sync différée** |
| `chantier/report-table.ts` | points de report A/B/C… avec X/Y/distance/angle | opérationnel |
| `chantier/nomenclature.ts` | nomenclature depuis `Quantity[]` | opérationnel |
| `chantier/margins.ts` | marges/chutes (ex. 10 m + 10 % → 11 m) | opérationnel |
| `chantier/led.ts` | longueur, marge, nombre de rouleaux, segments | opérationnel |
| `chantier/profiles.ts`, `lighting.ts`, `witness.ts` | profils, éclairage indicatif, cote témoin | opérationnel |
| `chantier/mosaic.ts` | `MosaicPlan` : feuilles, recouvrement, numérotation, plan d'assemblage | **géométrie de pagination** opérationnelle ; rendu PDF page-à-page différé |
| `chantier/pre-export-check.ts` | contrôles pré-export (géométrie finie, fermée, calibrée…) | opérationnel |
| `exports/dxf.ts` | DXF ASCII R12 (LINE, CIRCLE, ARC, LWPOLYLINE, TEXT), mm, coordonnées finies | opérationnel |

---

## 5. Frontières (récapitulatif normatif)

| Couche | Peut importer | Ne doit pas importer |
|---|---|---|
| UI `components/Trace*` | Engine A, `trace-render` | Engine B directement |
| Engine A `lib/geometry/*` | lui-même, `lib/units` | Engine B |
| Engine B `lib/geometry/engine/*` | lui-même, `lib/units` | Engine A |
| `lib/tracing/*` | Engine B **via `geometry-port`**, `lib/units` | Engine A (hors type-only à la frontière export), Engine B en direct |
| `lib/chantier/*` | `geometry-port`, `lib/units`, `type {Quantity}` d'Engine A | Engine B en direct |
| `lib/exports/dxf.ts` | `geometry-port`, `type {ShapeGeometry}` d'Engine A | — |

---

## 6. Flux de données

**Modèle décoratif** : paramètres utilisateur → `create<Modèle>Geometry()` → `TraceModel`
→ `validateTraceModel` → `TraceViewer` (SVG via `plan-model`) / `TraceSteps` / `SiteMode`.

**Tracé depuis photo** : image → `detectFormat` → redressement px → sélection 2 points +
distance connue → **calibration (échelle px/mm)** → mesures mm autorisées → vectorisation
→ `TracingProject` → `report-table` / `nomenclature` / `margins` / `led` → `pre-export-check`
→ `exports/dxf` (et SVG/PDF existants).

**Gorge LED** : contour → `offset` (Engine B) → `calculateLength` → `chantier/margins`
→ `chantier/led` (quantité indicative).

---

## 7. Unités

- **Géométrie métier = millimètres**, partout (Engine A, Engine B, tracing, chantier).
- Source de vérité de conversion : `lib/units.ts` (`convertLength`, `LengthUnit`), réutilisée
  des deux côtés — pas de barème dupliqué.
- **Pixels** : uniquement affichage écran (`plan-model`), image de référence et calibration.
  Aucun calcul métier ne part d'un pixel.
- Conversion mm ↔ écran : `plan-model.ts`. mm ↔ DXF : `exports/dxf.ts` (1 unité DXF = 1 mm).

---

## 8. Calibration (règle absolue §4/§28)

`tracing/reference-image.ts` : tant qu'aucune échelle n'est définie, `pixelsToMillimetres`
**lève une erreur**. Aucune mesure réelle n'est produite depuis une image non calibrée.
Le workflow impose : 2 points image + 1 distance réelle connue → échelle → mesures mm.
`measurement-origin.ts` propage l'origine (`calibrated`, `imported`…) et `originWarning`
signale toute valeur non fiable (« Valeur indicative — non vérifiée sur le chantier »).

---

## 9. Exports

| Export | État |
|---|---|
| SVG (`exports/svg.ts`) | **opérationnel** (pré-existant) |
| PDF simple (`exports/pdf.ts`, jsPDF) | **opérationnel** (pré-existant) |
| DXF ASCII R12 (`exports/dxf.ts`) | **opérationnel** (nouveau) |
| PDF « dossier chantier » multi-pages | **différé** — pagination prête (`mosaic.ts`), rendu jsPDF page-à-page à brancher |
| Pages mosaïque imprimées / gabarit 1:1 PDF | **différé** — `MosaicPlan` fournit toute la géométrie |
| Export PNG | **différé** |

---

## 10. Fonctions volontairement différées (préparées, non faussées)

Aucune n'est exposée comme bouton inopérant. Voir `docs/production-workflow.md` § « Volontairement différé » :

- rendu `<canvas>` de l'image de référence ;
- auto-détection de contour (vision par ordinateur) ;
- décodage HEIC réel (format reconnu, marqué non supporté) ;
- assemblage PDF dossier chantier multi-pages + pages mosaïque imprimées + gabarit 1:1 PDF ;
- export PNG ;
- persistance `TracingProject` (IndexedDB + sync) — modèle et `migrateProject` prêts ;
- partage ;
- undo/redo.

---

## 11. Dette technique

1. **Deux moteurs géométriques** (A historique, B générique) — coexistence assumée, frontière
   documentée ici. Types parallèles : `Point`/`Point2D`, `Circle`/`Circle2D`, `Arc`/`Arc2D`,
   `validateShapeGeometry`/`validateGeometry`, `Quantity.quality:"exact"|"estimate"` vs
   `MeasuredValue.quality:"exact"|"approximated"`.
2. `models.ts` (décoratif Free hérité) et `models/` (registre 13 modèles) — noms voisins,
   à renommer lors de la convergence (`models.ts` → `decorative-plan-models.ts`).
3. `/outils/traces-preview` est la seule entrée UI vers la bibliothèque — interne, noindex,
   hors catalogue. L'Atelier commercial complet reste à construire.
4. `lib/tracing/project.ts` : bump de schéma à coordonner avec la persistance réelle.

---

## 12. Stratégie future de convergence des moteurs (phase dédiée, PAS maintenant)

Ordre suggéré, hors de cette intégration :

1. Geler l'API publique d'Engine B (`engine/index.ts` + `engine/api.ts`).
2. Réécrire **un** modèle décoratif sur Engine B comme pilote, comparer pixel-à-pixel via
   les tests existants.
3. Migrer les 13 modèles + `TraceViewer` par lots, en gardant Engine A jusqu'à parité de tests.
4. Remplacer `primitives.ts`/`transforms.ts` par des ré-exports d'Engine B, puis supprimer.
5. Unifier `Quantity`/`MeasuredValue` et `validate*`.
6. Renommer `models.ts`.

Critère d'entrée en phase de convergence : Atelier commercial livré et recetté sur Engine A,
zéro régression connue. **Objectif actuel : stabilité > élégance.**
