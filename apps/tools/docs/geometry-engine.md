# Moteur géométrique paramétrique (`src/lib/geometry/engine/`)

## Périmètre et positionnement

Ce module est **additif** : il ne modifie aucun fichier existant de `src/lib/geometry/`
(`primitives.ts`, `shape-model.ts`, `shapes.ts`, `plan-model.ts`, `models.ts`,
`diagram-model.ts` restent inchangés et continuent d'alimenter les outils R5/R8 actuels —
arche avancée, cercle/ellipse en pièce, couronne, fleur radiale — consommés par
`ToolDiagram.tsx`, `AdvancedPlan.tsx` et `ProCalculatorWorkspace.tsx`).

`engine/` fournit un moteur géométrique **générique et réutilisable**, indépendant de tout
composant React, destiné à alimenter le futur « Atelier de traçage ». Il ne redessine rien :
il calcule des points, segments, arcs, cercles, ellipses et polygones en **millimètres**, et
laisse le rendu (SVG, plan coté) à l'interface appelante — même principe que
`docs/tracing-engine.md` : `Saisie → mm → géométrie → rendu`, jamais l'inverse.

Aucune dépendance ajoutée : uniquement du TypeScript pur (`strict: true`), compatible Web,
PWA et wrappers Capacitor.

## Unité et repère

- unité canonique : **mm**, aucune valeur en pixels dans ce module ;
- angles en **radians** en interne (`Arc2D.startAngle/endAngle`), conversion via `angles.ts`
  (`degToRad`/`radToDeg`) aux frontières de l'API pour les paramètres utilisateur
  (`rotationDegrees`, `startAngleDegrees`, etc.) ;
- repère X vers la droite, Y vers le haut par défaut (cohérent avec `tracing-engine.md`) ;
- origine et centre toujours explicites et configurables (`centre?: Point2D` sur chaque
  générateur, jamais implicite).

## Organisation des fichiers

| Fichier | Rôle |
| --- | --- |
| `types.ts` | Types fondamentaux : `Point2D`, `Vector2D`, `Line2D`, `Segment2D`, `Circle2D`, `Arc2D`, `Ellipse2D`, `Polyline2D`, `Polygon2D`, `BoundingBox2D`, `Transform2D`, `Dimensions2D`, `GeometryQuality`. |
| `angles.ts` | Conversions degrés/radians, normalisation d'angle, balayage angulaire. |
| `transform.ts` | Translation, rotation (autour de l'origine ou d'un point), mise à l'échelle (uniforme, X/Y, autour d'un point), symétries (horizontale, verticale, axe arbitraire), composition. |
| `measure.ts` | Distance, milieu, projection, perpendiculaire, parallèle, bissectrice/médiatrice, longueurs (segment, polyligne, arc, cercle), corde/flèche, bounding box. |
| `area.ts` | Aires : cercle, ellipse, polygone (formule du lacet), secteur/segment circulaire. |
| `intersections.ts` | Ligne/ligne, segment/segment, ligne/cercle, segment/cercle, cercle/cercle, arc/ligne, arc/segment, arc/cercle, arc/arc — résultat structuré `{ kind: "none"\|"one"\|"two"\|"tangent"\|"coincident", points }`, tolérance configurable. |
| `circle-tools.ts` | Cercle par 3 points, tangentes depuis un point externe, points cardinaux, répartition/division régulière d'un cercle ou d'un segment, arc par corde + flèche signée. |
| `geometry-ops.ts` | Application générique d'une transformation à n'importe quelle primitive (`transformGeometry`), recalcul de bounding box depuis un jeu de primitives. |
| `model.ts` | `ParametricShape` (le modèle paramétrique central), `ConstructionStep`, registre `registerShapeGenerator`/`buildParametricShape`, sérialisation JSON. |
| `validate.ts` | `validateGeometry()` : valeurs non finies, rayons invalides, points confondus, hors bounding box, auto-intersection, arc incohérent, forme ouverte qui devrait être fermée, offset impossible. |
| `offset.ts` | Décalage de segment/cercle/arc/polyligne ; détecte et refuse (erreur explicite) un offset auto-intersecté ou dépassant le rayon intérieur constructible. |
| `simplify.ts` | Douglas-Peucker générique + `simplifyToConstructionElements` (balayage glouton segment/arc avec erreur maximale réellement mesurée, modes `precise`/`balanced`/`site`). |
| `snap.ts` | Candidats d'accrochage : grille, extrémité, milieu, centre, intersection, quadrant, perpendiculaire, tangente. |
| `constraints.ts` | Fondations légères (pas un solveur CAD) : horizontal, vertical, parallèle, perpendiculaire, concentrique, tangent, rayon égal, symétrie. |
| `dimensions.ts` | Cotes horizontale/verticale/alignée/rayon/diamètre/angle/entraxe/coordonnée — valeur + points d'ancrage, sans rendu. |
| `report.ts` | Table de report chantier (`getReportPoints`) : coordonnées, distance et angle depuis une origine. |
| `basic-shapes.ts`, `polygons.ts`, `stars.ts`, `arches.ts`, `radial-pattern.ts`, `petals.ts`, `rosettes.ts`, `spirals.ts`, `curves.ts`, `hearts.ts` | Générateurs paramétriques (voir ci-dessous). |
| `api.ts` | `offsetShape`, `scaleShape`, `rotateShape`, `calculateLength`, `calculateArea`, `generateConstructionSteps` opérant sur une `ParametricShape` entière. |
| `index.ts` | Point d'entrée unique : importe tous les générateurs (auto-enregistrement) et réexporte l'API publique. |

## Le modèle paramétrique (`ParametricShape`)

```ts
type ParametricShape<TParameters> = {
  id: string; type: string; parameters: TParameters;   // le paramètre est la source de vérité
  primitives: { points, segments, circles, arcs, ellipses, polylines, polygons };
  boundingBox: BoundingBox2D; centre: Point2D; width: number; height: number; rotation: number;
  metadata: Record<string, unknown>;
  constructionSteps: ConstructionStep[];   // chaque étape référence de la vraie géométrie, pas seulement du texte
  quality: "exact" | "approximated"; errorTolerance?: number;
};
```

Un type de forme s'enregistre une fois (`registerShapeGenerator("star", createStar)`) ; le
recharger avec de nouveaux paramètres reconstruit **toute** la géométrie :

```ts
import { buildParametricShape, serializeShape, deserializeShape } from "@/lib/geometry/engine";

const rosette = buildParametricShape("rosette", { outerDiameter: 2000, innerDiameter: 400, count: 8 });
const saved = serializeShape(rosette);          // { id, type, parameters, metadata } uniquement
const reloaded = deserializeShape(saved);       // reconstruit depuis type + parameters, jamais depuis un cache de points
```

Changer un paramètre et rappeler `buildParametricShape` (ou la fonction `createXxx` directement)
régénère intégralement points/segments/arcs — jamais une liste figée.

## Exemples d'utilisation

```ts
import { createArch, createRosette, createStar, calculateLength, validateGeometry } from "@/lib/geometry/engine";

// Arche gothique (ogive équilatérale), largeur 1200 mm
const ogive = createArch({ type: "lancet", width: 1200, pointedness: "equilateral" });
validateGeometry(ogive); // []

// Rosace à 8 pétales
const rosace = createRosette({ outerDiameter: 2800, innerDiameter: 500, count: 8, elementType: "petal" });
calculateLength(rosace); // longueur totale des arcs, en mm

// Étoile à 5 branches
const star = createStar({ points: 5, outerRadius: 300, innerRadius: 120 });
```

## Simplification chantier vs courbe mathématique (§12)

`createMathematicalSpiral` expose la formule exacte `r(θ)` (`quality: "exact"`) — la polyligne
renvoyée n'est qu'un échantillonnage pour l'affichage, jamais une cote de chantier.
`approximateSpiralWithArcs` fournit la version constructible (arcs de rayon constant par
paliers) et renvoie systématiquement `quality: "approximated"` avec l'**erreur maximale
réellement mesurée** (`errorTolerance`), jamais une tolérance simplement supposée respectée.
Le même principe s'applique à `simplifyToConstructionElements` (§24).

## Sécurité métier (§30)

Aucune fonction n'invente de mesure : une construction non définie (ex. arche à quatre
centres dont les rayons ne permettent pas de tangence, offset qui franchit le centre d'un
contour, trois points alignés pour un cercle) lève une erreur explicite en français plutôt que
de renvoyer une géométrie approximative présentée comme exacte.

## Limites connues (assumées, pour rester dans le périmètre)

- `transformGeometry` sur un cercle/arc sous mise à l'échelle non uniforme suit l'échelle de
  l'axe X (un cercle ne peut pas devenir elliptique par construction — utiliser une ellipse).
- `offsetPolyline`/`hasSelfIntersection` couvrent le cas général par intersection de segments
  et un garde-fou par distance au centroïde pour les contours convexes ; un polygone très
  concave en offset extrême reste un cas limite (pas de clipping robuste type Vatti/Weiler-Atherton).
- `constraints.ts` fournit des briques directes (pas de solveur itératif multi-contraintes) —
  volontairement, pour rester léger (§23 l'autorise explicitement).
- La rosace à éléments "petal" et le calcul de largeur par défaut choisissent une valeur
  raisonnable (`0.85×` la corde entre éléments) pour éviter le chevauchement ; `elementWidth`
  permet de l'ajuster explicitement.

## Tests

23 fichiers de tests colocalisés (`*.test.ts`), 103 tests, couvrant au minimum : distances,
rotations/symétries, les 8 couples d'intersections, tangences, cercles, arcs, polygones
réguliers, étoiles, répétition circulaire, offsets (y compris échecs attendus), les 4 types
d'arches (dont la vérification de tangence interne de l'arche composée), rosaces,
coordonnées/report chantier et longueurs/aires. Exécution :

```bash
npm run test --prefix apps/tools -- src/lib/geometry/engine
```
