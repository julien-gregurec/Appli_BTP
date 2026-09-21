# Atelier — hit-testing et accrochage (fondation V1)

Fondation de désignation et d'accrochage du viewport Atelier. **Aucune édition** : ce lot
calcule et affiche, il ne modifie ni la géométrie, ni les paramètres, ni le projet.

## Découpage

| Module | Rôle | Connaît l'écran ? |
| ------ | ---- | ----------------- |
| `lib/geometry/closest-point.ts` | point le plus proche, par primitive | non |
| `lib/geometry/hit-test.ts` | entité désignée dans une scène, priorité | non |
| `lib/geometry/snap.ts` | candidats d'accrochage, grille comprise | non |
| `lib/viewport/pointer-targeting.ts` | tolérance pixels → millimètres | oui |
| `AtelierViewportWorkspace` | branchement clic/survol | oui |

Les trois modules géométriques sont purs et synchrones : pas de React, pas de DOM, pas de
pixel. C'est ce qui permet de les tester contre une recherche exhaustive plutôt que contre
leurs propres résultats.

## Projections réelles, jamais de boîte englobante

Chaque primitive a sa vraie projection (§4) :

- **segment** — projection bornée, jamais sur la droite infinie ;
- **cercle** — sur le CONTOUR : un clic au centre est à `radius` du cercle, il ne le désigne
  donc pas. On sélectionne un trait, pas une surface ;
- **arc** — projection radiale si l'angle tombe dans le secteur réellement balayé, sinon
  l'extrémité la plus proche. La normalisation du balayage est celle de `createArcPath` : le
  hit-test et le rendu doivent s'accorder sur ce qui est dessiné ;
- **ellipse** — **exacte**, rotation comprise, par la bissection de Eberly sur l'équation de
  Bézout, avec les deux cas d'axe traités en forme fermée. Ce n'est pas une approximation :
  les tests la confrontent à une recherche exhaustive à 2 000 000 d'échantillons sur cinq
  ellipses, dont une très aplatie (2000 × 40) et une tournée de 37° ;
- **polyligne / contour** — meilleur côté ; le contour ajoute son côté de fermeture, la
  polyligne non.

## Tolérance (§2)

La tolérance est définie en **pixels**, puis convertie : `toleranceWorld = tolerancePx / scale`
(via `screenToWorldLength`, déjà utilisée par le pan et le zoom — une seule définition de
l'échelle dans l'application).

C'est ce qui rend la désignation stable à l'œil : vérifié en recette réelle, les mêmes seuils
en pixels valent à 100 % comme à 358 % de zoom. Une tolérance fixée en millimètres ferait
l'inverse — invisible une fois dézoomé, captant tout l'écran une fois zoomé.

| | souris | doigt |
| --- | --- | --- |
| sélection | 12 px | 20 px |
| accrochage | 10 px | 16 px |

Le doigt reçoit davantage (§8) sans quoi un point nommé, rendu avec 4 px de rayon, serait hors
d'atteinte au toucher. L'accrochage reste plus serré que la sélection : aimanter à tort se
remarque plus que ne pas aimanter.

## Priorité (§3)

`point (1) < segment = arc (2) < cercle = ellipse (3) < polyligne = contour (4)`

La priorité ne joue **qu'entre candidats déjà dans la tolérance**. C'est le point important :
dans le disque de tolérance on retient la cible la plus petite — sans quoi un contour qui
traverse l'écran capterait tous les clics des points posés dessus. Mais une entité hors
tolérance n'est jamais retenue, si prioritaire soit-elle, sinon un point lointain volerait la
sélection d'un segment sous le curseur.

Observé en recette sur un point posé sur un segment : 11 px désigne le point, 14 px désigne le
segment, 18 px au doigt redésigne le point.

Départage : priorité, puis distance, puis identifiant. Le dernier critère n'est pas cosmétique
— sans lui, deux diagonales qui se croisent seraient départagées par l'ordre de publication du
générateur, et le même clic pourrait désigner une entité différente d'un modèle à l'autre.

## Accrochage (§5/§6)

`point (1) < endpoint (2) < midpoint (3) < center (4) < grid (6)`

Couverts : points nommés du modèle, extrémités (segments, arcs, sommets de polylignes et de
contours), milieux (segments, côtés, **milieu sur l'arc** — pas le milieu de la corde), centres
(cercle, arc, ellipse), grille. Les intersections sont prévues dans `SnapKind` mais hors lot.

Les candidats au même endroit sont fusionnés en gardant le plus signifiant : un sommet partagé
par quatre segments donne un candidat, pas quatre.

La grille (§6) est déterministe, en millimètres, et **indépendante de son affichage** : le pas
est un argument, pas la lecture d'un état d'interface — on peut vouloir aimanter sans voir la
grille. Elle n'est proposée que si son noeud tombe lui aussi dans la tolérance, sinon un dézoom
fort ferait sauter le curseur à des dizaines de centimètres de la cible.

## Branchement (§7)

Le clic est converti en point monde, puis `hitTest` désigne l'entité ; un clic à vide
désélectionne. Les anciennes zones de clic SVG invisibles ont disparu : une zone par entité ne
saurait appliquer ni tolérance en pixels ni priorité entre entités superposées. `PlanSceneLayer`
ne porte donc plus aucun gestionnaire d'évènement — il dessine.

Un clic qui conclut un glissement ne sélectionne pas (`consumeDrag`) : vérifié, un pan qui
s'achève sur une entité ne la sélectionne pas.

## Feedback (§9)

Survol : épaississement du trait, pas de changement de couleur — la sélection garde l'ambre.
La sélection l'emporte sur le survol, sinon survoler l'entité retenue donnerait l'impression de
l'avoir perdue. Le point d'accrochage est une croix ambre légère. Le survol est éteint en mode
« Déplacer », par dérivation du mode courant et non par un effet de nettoyage.

## Performance (§10)

Le survol est coalescé par `requestAnimationFrame` : au plus un hit-test par image affichée.
Mesuré en recette sur une scène de 59 entités : **0,053 ms** par survol (hit-test + accrochage +
rendu) et **0,067 ms** par clic ; 0,044 ms sur une scène de 10 entités. Le coût est linéaire en
nombre d'entités, sans terme quadratique. Scène stable dès que le pointeur s'arrête.
