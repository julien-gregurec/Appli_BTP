# Frontière entre les deux moteurs géométriques (`src/lib/geometry/`)

> C5-CLEANUP-V1. À lire **avant** d'ajouter le moindre calcul géométrique dans `apps/tools`.
> Objectif de ce document : empêcher la création d'une troisième couche géométrique.

Il existe **deux** moteurs, tous les deux vivants, tous les deux légitimes. Ils ne sont pas
en concurrence : ils servent deux produits différents. Il ne doit **jamais** en exister un
troisième.

## Engine B — `geometry/engine/` : bibliothèque de tracés paramétriques (Atelier)

- **Source de vérité géométrique** de la bibliothèque de tracés / de l'Atelier.
- Type pivot : `ParametricShape` (`engine/model.ts`) — primitives `Point2D`/`Circle2D`/… sans
  identifiant, plus `constructionSteps` génériques.
- Générique, réutilisable, sans vocabulaire produit : le moteur ne connaît ni nom commercial,
  ni catégorie, ni difficulté, ni texte pédagogique.
- Documenté en détail dans [`geometry-engine.md`](./geometry-engine.md).

Les **13 modèles** de `geometry/models/` sont tous alimentés par Engine B et convertis vers le
contrat UI par `geometry/adapters/parametric-to-trace-model.ts`.

## Engine A — `geometry/primitives.ts` + `geometry/shapes.ts` : moteur Pro historique

- **N'est pas du code mort.** `shapes.ts` alimente `pro-engine.ts` et les outils Pro
  (arche avancée, niche cintrée, plafond circulaire, ellipse en pièce, couronne, motif radial).
- Type pivot : `ShapeGeometry` (`shape-model.ts`) — primitives **portant un `id`**, cotes,
  contrôles, quantités et `SiteStep` déjà rédigés.
- Spécificité irremplaçable côté Pro : le **positionnement dans une pièce**
  (`positionInRoom`, murs, cotes aux murs) — notion absente d'Engine B et qui n'a pas
  vocation à y entrer.

## Règle de frontière

1. **Nouveau tracé de la bibliothèque / Atelier → Engine B**, puis
   `parametricShapeToTraceModel`. Jamais une formule géométrique locale dans `models/`.
2. **Outil Pro existant → Engine A**, tel quel. Ne pas le migrer « au passage ».
3. **Ne jamais mélanger les deux sans adaptateur.** Les points d'Engine A ont un `id`, ceux
   d'Engine B non : le seul pont autorisé est `geometry/adapters/` (`point-compat.ts`,
   `parametric-to-trace-model.ts`). Toute autre conversion ad hoc est un début de troisième
   couche.
4. **Aucun `SiteStep` écrit à la main dans `models/`.** Si une étape manque, elle s'ajoute
   dans le générateur Engine B, sous forme d'option générique (exemple :
   `RosetteParameters.centralCircleRatio`, qui produit à la fois le cercle central décoratif et
   son étape). Un `SiteStep` local rendrait le pas-à-pas désynchronisable de la géométrie.
5. **Le contenu pédagogique reste hors moteur** : nom, catégorie, tags, explication et
   paramètres affichés passent par `TraceModelMetadata`, jamais par Engine B.

## Collisions de noms — lues correctement

Les deux moteurs exposent des identifiants homonymes. C'est sans danger **tant que l'on sait
lequel on importe** : le chemin d'import est discriminant.

| Nom | Engine A (`./primitives`, `./shapes`) | Engine B (`./engine/*`) |
| --- | --- | --- |
| `distance`, `midpoint`, `boundsFromPoints`, `arcLength`, `chordLength`, `sagitta`, `vectorLength`, `divideCircle`, `assertFinitePositive` | opèrent sur `Point` (**avec `id`**) | opèrent sur `Point2D` (**sans `id`**) |

Sémantique identique, types incompatibles. Ne pas les renommer : la surface de diff serait
large pour un gain nul une fois le chemin d'import lu.

En revanche, les deux **générateurs de formes** homonymes ont été renommés côté Engine A
(C5-CLEANUP-V1 §3), parce que leurs sémantiques divergent réellement :

| Avant (Engine A) | Après (Engine A) | Homonyme Engine B conservé |
| --- | --- | --- |
| `shapes.ts::createEllipse` | **`createRoomEllipse`** — ellipse positionnée dans une pièce (cohérent avec `createRoomCircle`) | `engine/ellipse.ts::createEllipse` — ellipse paramétrique générique |
| `shapes.ts::createRadialPattern` | **`createRadialMotif`** — motif fleur/rosace fini, avec cotes et pas-à-pas | `engine/radial-pattern.ts::createRadialPattern` — répétition d'une primitive source autour d'un centre |

## Ce qui n'a pas été supprimé, et pourquoi

`primitives.ts` expose des helpers actuellement non importés ailleurs (`EPSILON`, `midpoint`,
`vector`, `vectorLength`, `normalize`, `translate`, `angleBetween`, `lineIntersection`,
`lineCircleIntersections`, `circleCircleIntersections`, `tangentPoints`, `chordLength`,
`divideCircle`). Ils sont **conservés** : ce sont les briques de calcul du moteur Pro, la
plupart sont couverts par `primitives.test.ts`, et les supprimer ferait perdre à Engine A
l'autonomie qui justifie son existence — sans rien simplifier pour autant. Ne pas confondre
« non importé aujourd'hui » et « mort ».
