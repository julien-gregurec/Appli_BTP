# Moteur de traçage Tools Pro

## Chaîne de données

Le moteur R5 suit une seule direction :

```text
Saisie en unités chantier
→ conversion en millimètres
→ ShapeGeometry
→ plan coté et annotations
→ transformation d’affichage
→ SVG
```

`ShapeGeometry` constitue la source exportable. Le SVG n’est jamais une source de données et ne recalcule aucune cote métier. Un futur export PDF, SVG ou impression pourra consommer le même modèle.

## Repère et unités

- unité canonique : millimètre ;
- origine : `P0` pour une pièce, `O` pour une forme isolée ;
- axe X vers la droite ;
- axe Y vers le haut ;
- précision complète conservée dans tous les calculs ;
- arrondi appliqué uniquement aux libellés et instructions ;
- pixels limités à `createPlanTransform`, après le calcul métier.

Le renderer inverse l’orientation Y au moment de la projection vers l’écran. Le zoom modifie seulement la taille visuelle, jamais la géométrie.

## Primitives

`primitives.ts` formalise `Point`, `ConstructionPoint`, `Vector`, `Segment`, `Circle`, `Ellipse`, `Arc`, `Axis`, `BoundingBox`, `Angle` et `Dimension`.

Les opérations communes incluent distance, milieu, projection, rotation, translation, coordonnées polaires, angle entre vecteurs, intersections ligne/ligne, ligne/cercle et cercle/cercle, tangentes, longueur d’arc, corde, flèche et bounding box. Elles refusent les données nulles ou non finies et ne dépendent ni du DOM ni de React.

## Modèle de forme et plan coté

Une forme publie son repère, ses limites, axes, points nommés, segments, cercles, ellipses, arcs, lignes de construction, dimensions, contrôles, quantités et étapes chantier.

Les identifiants sont uniques dans leur espace métier. `validateShapeGeometry` refuse une valeur `NaN`/`Infinity`, un identifiant dupliqué ou une étape qui référence un point absent.

Les annotations restent distinctes de la géométrie. Le renderer place les libellés en fonction des extrémités et offsets déclarés par les dimensions. Les couches forme, construction, cotes, axes, points et labels sont activables séparément.

## Formes R5

- Arche avancée : plein cintre, segmentaire, rayon imposé, flèche imposée et hauteur totale avec départ du cintre.
- Niche cintrée : géométrie de face, profondeur, longueur d’arc, périmètre et surface intérieure explicitement estimée.
- Plafond circulaire : position centrée, coordonnées ou distances aux murs, avec contrôles des quatre côtés.
- Ellipse : ellipse mathématique exacte, foyers et méthode reproductible de la ficelle. Le périmètre est identifié comme approximation de Ramanujan.
- Couronne : deux cercles concentriques définis par largeur de bande ou diamètre intérieur.
- Fleurs 4/5/6/8 et rosace simple : moteur radial commun, centres de pétales et rayons déterministes.

## Moteur radial

`createRadialPattern` reçoit un centre, un diamètre, un diamètre central, un nombre de secteurs parmi 4, 5, 6 ou 8 et une rotation initiale. L’angle de secteur est exactement `360° / N`.

Chaque centre de pétale se trouve sur un cercle directeur à la moitié du rayon général. Chaque pétale est un cercle de même rayon. La forme est donc construite au compas et non dessinée arbitrairement. La rosace simple réutilise le même modèle et conserve les rayons de secteur.

## Positionnement dans une pièce

`positionInRoom` est partagé par le cercle et l’ellipse et prévu pour les futures formes de plafond. Il accepte : centrage, coordonnées du centre ou retraits depuis les murs gauche et bas. Il calcule les quatre dégagements et refuse une forme qui dépasse la pièce.

Le tableau de points expose les coordonnées depuis le repère pièce et depuis le centre O. Les valeurs restent en millimètres pour l’implantation au laser.

## Instructions chantier

Chaque étape contient un identifiant, un titre, une instruction, les mesures affichées, les points utilisés et éventuellement un contrôle. Les nombres incorporés aux textes sont formatés à partir des résultats du moteur. Les tests comparent plusieurs dimensions afin de vérifier que les instructions évoluent réellement avec la géométrie.

Le mode chantier présente une étape à la fois, avec précédent, suivant et retour au plan complet. Les contrôles sont indépendants du geste de tracé afin de détecter un décalage.

## Quantités et précision

Chaque quantité porte `quality: exact | estimate`. Longueur d’arc, circonférence, aire de cercle/couronne/ellipse et longueur de ficelle sont géométriques. Le périmètre elliptique (Ramanujan) et la surface intérieure développée d’une niche sont présentés comme estimations. Aucun nombre de plaques, montants ou fixations n’est déduit sans calepinage.

## Accès et offline

L’accès est déclaré dans `catalog.ts` par `access=pro` et par capabilities. Les composants métier ne prennent aucune décision commerciale locale. Sans entitlement, la page n’exécute pas le moteur Pro. Le droit interne de développement est explicite et ne dépend d’aucun service distant.

Tous les calculs sont TypeScript purs et fonctionnent dans le Web, la PWA et les wrappers Capacitor. Le service worker met les routes descriptives en cache ; le bundle natif embarque les mêmes pages statiques.

## Tests

Les suites couvrent primitives, intersections, tangences, arches valides et impossibles, foyers et symétries, dépassements de pièce, 4/5/6/8 secteurs, somme angulaire, rotation, coordonnées, bounding boxes, transformations SVG, identifiants, absence de valeurs non finies, cotes, instructions dynamiques et exécution de chaque exemple du catalogue Pro.
