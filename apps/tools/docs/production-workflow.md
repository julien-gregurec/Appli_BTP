# Workflow production / chantier — image → tracé → gabarit → chantier

Ce lot ajoute la chaîne qui transforme un dessin ELSATIA Tools en **document de chantier**,
et le workflow qui part d'une **photo / capture / croquis**. Il ne réécrit ni le moteur
géométrique (`src/lib/geometry/engine/`, moteur paramétrique) ni l'atelier de traçage :
il s'y branche par des adaptateurs.

```
PHOTO / CROQUIS / IDÉE
  → CALIBRATION        (tracing/reference-image.ts)
  → TRACÉ              (atelier — hors lot ; consomme RawContour)
  → VECTORISATION      (tracing/vectorization.ts : RawContour → GeometricShape)
  → COTATIONS          (moteur : ShapeGeometry.dimensions)
  → CONTRÔLE           (chantier/pre-export-check.ts)
  → GABARIT            (chantier/mosaic.ts + chantier/witness.ts)
  → PDF / SVG / DXF    (exports/dxf.ts ; exports/pdf.ts, exports/svg.ts existants)
  → CHANTIER           (chantier/report-table.ts, nomenclature.ts, led.ts, profiles.ts, lighting.ts)
```

## Arborescence

| Fichier | Rôle | Brief |
| --- | --- | --- |
| `tracing/geometry-port.ts` | **Adaptateur unique** vers le moteur géométrique + `simplifyPolyline` (Douglas–Peucker) et `perpendicularDistance` non encore fournis par le moteur | §34 |
| `tracing/measurement-origin.ts` | Origine d'une mesure : `manual \| calibrated \| imported \| approximated \| exact` ; `isRealWorldTrusted`, `combineOrigins` | §28 |
| `tracing/reference-image.ts` | Formats acceptés, calque de fond, redressement, **calibration** (px → mm interdite tant que non calibrée) | §3–§6 |
| `tracing/vectorization.ts` | `RawContour` (proposition/confirmé) vs `GeometricShape` ; simplification chantier 3 niveaux | §7–§10 |
| `tracing/project.ts` | Structure métier `TracingProject` (types, `createTracingProject`, `validateTracingProject`) — **modèle, pas la persistance** | §2 |
| `chantier/margins.ts` | Marge 0/5/10/15/perso : longueur calculée vs longueur avec marge | §23 |
| `chantier/witness.ts` | Cote témoin (100 mm + consigne de vérification impression) | §15 |
| `chantier/mosaic.ts` | Gabarit 1:1, découpe mosaïque (recouvrement, feuilles `A1…`), plan d'assemblage | §16–§18 |
| `chantier/report-table.ts` | Table de report `Point \| X \| Y \| distance O \| angle` | §14 |
| `chantier/nomenclature.ts` | Nomenclature projet (ml, m², u) avec qualité `exact/estimate` ; adaptateur `ShapeGeometry.quantities` | §22 |
| `chantier/led.ts` | Longueur LED, ruptures, marge, nombre de rouleaux (plafond) | §24 |
| `chantier/profiles.ts` | Profils / ossature : barre commerciale, nombre de barres, chute | §25 |
| `chantier/lighting.ts` | Positions spots / lustres / suspensions / alimentations LED, export coordonnées | §26 |
| `chantier/pre-export-check.ts` | « Vérifier le tracé » : anomalies Erreur / Avertissement / Information | §27 |
| `exports/dxf.ts` | Export **DXF ASCII R12** (`AC1009`, mm) : LINE, ARC, CIRCLE, TEXT, POLYLINE ; validateur structurel | §19–§20 |

## Fonctions opérationnelles (implémentées + testées)

- Calibration : facteur d'échelle depuis deux points + distance réelle, conversion d'unité,
  refus de conversion sans échelle, conversion de repère (Y image → Y chantier). `reference-image.test.ts`
- Redressement : plus petite rotation pour rendre une ligne horizontale/verticale. `reference-image.test.ts`
- Vectorisation : séparation contour brut / forme géométrique, garde « proposition »,
  refus si non confirmé ou non calibré. `vectorization.test.ts`
- Simplification Douglas–Peucker itérative (contours de plusieurs milliers de points), 3 niveaux
  chantier (1 / 5 / 20 mm). `vectorization.test.ts`
- Mosaïque : pagination avec recouvrement, bornage du dernier carreau, plan d'assemblage,
  orientation paysage, refus recouvrement ≥ zone utile. `mosaic.test.ts`
- Table de report, nomenclature (+ adaptateur quantités), marge, LED (rouleaux), profils
  (barres), éclairage, check pré-export classé. `chantier.test.ts`
- Export DXF : fichier structurellement valide, entités par calque, arc horaire → bornes CCW,
  refus des coordonnées non finies, export d'un document projet réel. `dxf.test.ts`
- `TracingProject` : création, validation stricte bornée, normalisation des réglages d'export. `project.test.ts`

Total : **50 tests** ajoutés, suite `apps/tools` à 157/157.

## Dépendances signalées (§34)

- `tracing/geometry-port.ts` importe **uniquement** `../geometry/engine/{types,measure,transform,angles}.ts`.
  Ces quatre fichiers du moteur paramétrique sont stables et sans erreur de type. Le reste du
  répertoire `engine/` est en cours d'écriture par le lot moteur ; `engine/model.ts` y présente
  actuellement 2 erreurs TypeScript **hors de ce lot** (à corriger par le lot moteur).
- Aucune dépendance npm ajoutée. Le PDF reste sur `jspdf` déjà présent.

## Volontairement différé (préparé, non faussé)

| Sujet | Brief | Raison | Point d'accroche prêt |
| --- | --- | --- | --- |
| Décodage image, rendu du calque, warp de perspective | §5, §6 | Nécessite `<canvas>` / couche interface ; aucune lib image dans `apps/tools` | `ReferenceImageAdjust`, `ReferenceImageLayer`, `straightenTransform` (matrice prête) |
| Détection automatique de contours (edge detection) | §8, §9 | Nécessite un algorithme CV / une lib absente ; ne pas produire un système trompeur | `RawContour { source: "detected", status: "proposition" }` déjà en place |
| Support HEIC réel | §3 | Nécessite un décodeur ; `detectFormat` reconnaît déjà `heic` mais `isSupportedFormat` renvoie `false` | `SUPPORTED_REFERENCE_FORMATS` |
| Assemblage PDF « dossier chantier » multi-pages (couverture, tracé, cotations, report, étapes) + pages mosaïque imprimées + gabarit 1:1 | §13, §16–§18, §21 | `mosaic.ts` fournit toute la géométrie de pagination ; le rendu jsPDF page à page est un branchement à faire dans `exports/` | `MosaicPlan`, `ReportTable`, `WitnessDimension`, `exports/dxf.ts` comme modèle |
| Export PNG (résolutions, fond) | §21 | Rendu raster = couche interface (`<canvas>`) | `projectFileName(…, "png")` accepté |
| Bibliothèque utilisateur / favoris / aperçus | §11, §12 | Recouvre la persistance de l'atelier (lot 1) | `TracingProject` sérialisable |
| Persistance `TracingProject` (IndexedDB + sync) | §2, §30 | La frontière reste `projects/model.ts` (`migrateProject`) ; bump de schéma à faire avec le lot 1 | `TRACING_PROJECT_SCHEMA_VERSION`, `validateTracingProject` |
| Partage lien lecture seule | §29 | Hors MVP ; l'export fichier suffit | — |
| Undo/redo | §31 | L'atelier général le gère ; ne pas créer un second système | — |

## Règles de responsabilité tenues

- §4 : `pixelsToMillimetres` / `contourToGeometricShape` **lèvent une erreur** tant que
  l'échelle n'est pas calibrée. Jamais de dimension réelle déduite d'une image non calibrée.
- §8 : un contour `detected` est forcé à `status: "proposition"` ; libellé « Proposition
  (à vérifier) », jamais « certifié ».
- §20 : le DXF refuse toute coordonnée non finie ; `validateDxfStructure` contrôle les paires
  code/valeur et l'équilibre SECTION/ENDSEC. Les ellipses (absentes de R12) sont converties
  en POLYLINE 72 segments et **listées comme approximations**.
- §28 : chaque `GeometricShape` porte son `origin` ; `pre-export-check` émet
  `unreliable-scale` pour toute forme `imported` / `approximated`.
