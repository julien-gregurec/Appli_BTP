# Atelier — intersections, cycle de sélection et multisélection

> ATELIER-INTERSECTIONS-MULTISELECT-V1. Complète
> [`atelier-hit-testing-snap.md`](./atelier-hit-testing-snap.md), qui reste la référence pour la
> désignation, les tolérances et le contrat d'accrochage.

Ce lot ajoute trois choses, toutes additives :

1. les **intersections géométriques** de la scène, et leur arrivée dans le moteur d'accrochage ;
2. le **cycle de sélection** — re-cliquer au même endroit pour atteindre l'entité du dessous ;
3. la **multisélection** en lecture seule, avec sa synthèse dans le panneau propriétés.

Engine B n'est **pas** modifié. Aucune primitive n'est créée, persistée ni exportée. Aucune
géométrie n'est écrite : tout ce qui suit est du calcul de lecture.

---

## 1. Intersections

### Où vit le calcul

`src/lib/geometry/intersections.ts` — module pur, sans React ni DOM.

Il ne contient **aucune formule d'intersection**. Toute la trigonométrie est celle de
`src/lib/geometry/engine/intersections.ts` (Engine B), appelée telle quelle. Le passage
Engine A → Engine B est gratuit et documenté par `geometry/adapters/point-compat.ts` : un
`Segment`/`Circle`/`Arc` d'Engine A, qui porte un `id` en plus, satisfait structurellement le
type Engine B correspondant. Réécrire ces formules aurait créé la « troisième couche
géométrique » que [`GEOMETRY_ENGINES_BOUNDARY_V1.md`](./GEOMETRY_ENGINES_BOUNDARY_V1.md)
interdit.

Ce que ce module apporte, et qu'Engine B ne peut pas connaître : l'**identité** des entités, le
**filtrage des primitives dégénérées**, la **stratégie de balayage**, et un **ordre
déterministe**.

### Couples supportés

| A | B | Résultats possibles |
| --- | --- | --- |
| segment | segment | 0 ou 1 |
| segment | cercle | 0, 1 (tangence ou corde bornée), 2 |
| cercle | cercle | 0, 1 (tangence interne ou externe), 2 |
| segment | arc | 0, 1, 2 — filtrés par le balayage de l'arc |
| arc | cercle | 0, 1, 2 — filtrés par le balayage |
| arc | arc | 0, 1, 2 — filtrés par les DEUX balayages |

Les **contours** (`polygons`) et **polylignes** (`polylines`) participent par leurs arêtes :
chaque arête est indexée comme un segment portant l'identifiant métier du parent et une clé
propre (`contour#3`). C'est ce qui fait sortir les cinq croisements internes du pentagramme de
`star-5`. Une arête n'est jamais croisée avec elle-même ; deux arêtes distinctes d'un même
contour le sont.

### Cas non définis — et ce qui est renvoyé à la place

| Situation | Réponse |
| --- | --- |
| segments colinéaires superposés | **zéro candidat** (Engine B : `coincident`) |
| cercles identiques | **zéro candidat** |
| arcs portés par le même cercle | **zéro candidat** |
| cercles concentriques de rayons différents | zéro candidat (aucune solution) |
| segment nul, ou plus court que `MIN_INTERSECTABLE_SIZE` (10⁻⁴ mm) | entité écartée de l'index |
| rayon nul, négatif ou non fini | entité écartée de l'index |
| angles d'arc non finis | entité écartée de l'index |
| intersection mathématique hors des bornes d'un segment | non retenue |
| intersection sur le cercle porteur mais hors du balayage d'un arc | non retenue |

Un couple à **infinité** de solutions rend zéro candidat. Choisir « un point au milieu » serait
inventer une donnée que la géométrie ne fournit pas — ce que ce lot s'interdit explicitement.

Aucune fonction ne lève, et **aucune coordonnée non finie n'est jamais publiée** : chaque point
est vérifié avant d'entrer dans le résultat. Le seuil `MIN_INTERSECTABLE_SIZE` n'est pas
esthétique : `segmentCircleIntersection` (Engine B) lève sous `DEFAULT_EPSILON`, et le seuil est
un ordre de grandeur au-dessus — l'exception est structurellement impossible, tout en restant
dix mille fois plus fin que le dixième de millimètre affiché par le report.

### Tangence

`GeometryIntersection.tangent` est fiable pour **tous** les couples supportés.

Engine B annonce `tangent` pour cercle/cercle et segment/cercle, mais sa fonction interne
`classify` ramène le résultat à `one` dès qu'un arc filtre le second point : le drapeau se
perdait alors pour arc/arc, arc/cercle et arc/segment. Il est **reconstitué** dans ce module, à
partir des cercles porteurs (comparaisons de distances, tolérance relative au plus grand rayon).
C'est une classification, pas un nouveau calcul d'intersection, et elle n'est consultée que
lorsque Engine B a rendu un point unique — elle ne contredit jamais un résultat sécant.

### Hors périmètre

Les **ellipses** ne participent pas. Leurs intersections exigent la résolution d'un quartique
qu'Engine B ne publie pas ; l'ajouter demanderait d'écrire une formule géométrique nouvelle,
donc de franchir la frontière des moteurs, pour deux modèles sur treize. Une ellipse reste
sélectionnable et accrochable par son centre, exactement comme avant ce lot.

---

## 2. Performance

Le coût est gouverné par la **densité locale sous le pointeur**, jamais par la taille de la
scène. Trois mécanismes :

- **index de scène** — l'inventaire des entités croisables et de leurs boîtes englobantes est
  construit une fois par scène et mémorisé dans une `WeakMap` indexée par la référence de la
  scène. Le viewport conserve la même scène d'une trame de survol à l'autre, donc l'inventaire
  n'est payé qu'une fois par géométrie, sans clé à inventer ni cache à invalider ;
- **filtrage par boîte englobante** — `intersectionsNear` ne retient que les entités dont la
  boîte, dilatée du rayon d'accrochage, contient la cible ; puis, parmi celles-ci, écarte sans
  trigonométrie tout couple dont les boîtes ne se recouvrent pas. La boîte d'un arc est
  **exacte** (extrema cardinaux réellement balayés), pas celle du cercle porteur : sans cela le
  filtrage ne filtrerait plus rien sur `arch-full-round`, `ogive`, `double-s` ou `heart` ;
- **calcul uniquement dans la tolérance** — les intersections ne sont produites que par
  `snapCandidates`, seul endroit qui connaisse le rayon. `geometrySnapCandidates` garde son
  comportement d'avant ce lot.

`sceneIntersections` (balayage complet) existe pour les tests, la mesure et un futur calque
« points remarquables ». Elle n'est jamais appelée pendant une trame, et reste bornée par
`MAX_INTERSECTION_PAIRS`.

### Mesures

Machine de développement, pointeur posé **sur** un croisement dense (pire cas réaliste), moyenne
sur 2 000 appels. Budget d'une trame à 60 Hz : 16,7 ms.

| Scène | Entités | Croisables | `hitTest` | `hitTestAll` | `intersectionsNear` | `snap` | Balayage complet |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SIMPLE_SCENE | 9 | 7 | 0,0014 ms | 0,0010 ms | 0,0006 ms | 0,0021 ms | 0,003 ms |
| MEDIUM_SCENE | 17 | 15 | 0,0018 ms | 0,0013 ms | 0,0015 ms | 0,0036 ms | 0,010 ms |
| `star-5` (Engine B) | 24 | 22 | 0,0011 ms | 0,0013 ms | 0,0017 ms | 0,0050 ms | 0,019 ms |
| `turbine` (Engine B) | 28 | 26 | 0,0017 ms | 0,0014 ms | 0,0028 ms | **0,0061 ms** | 0,028 ms |
| DENSE_SCENE | 59 | 53 | 0,0027 ms | 0,0026 ms | 0,0009 ms | 0,0057 ms | 0,020 ms |

Le survol coûte **un** `hitTest` et **un** `snap` par trame (règle héritée du lot précédent),
soit 0,009 ms au pire — environ 1 800 fois sous le budget d'image. Le passage de 9 à 59 entités
multiplie le coût du survol par 2,7, pas par 43 : le filtrage large fait son travail.

---

## 3. Accrochage « intersection »

`SnapKind` déclarait déjà `intersection` ; il est désormais alimenté.

- **priorité 5**, entre `center` (4) et `grid` (6). Un point nommé, une extrémité, un milieu ou
  un centre l'emportent donc toujours sur une intersection située au même endroit ;
- **dédoublonnage par position** — la règle existante suffit : une intersection qui tombe sur
  une extrémité disparaît au profit de l'extrémité, ce qui est le comportement voulu. Le
  pentagramme publie dix points d'intersection (cinq croisements + cinq sommets partagés) ;
  seuls les cinq croisements survivent au dédoublonnage, les sommets étant déjà des extrémités ;
- `SnapCandidate.entityIds` porte les **deux** entités du couple ; `entityId` reste la première
  dans l'ordre déterministe, pour tous les lecteurs écrits avant ce lot ;
- `SnapCandidate.tangent` distingue une tangence d'un croisement franc ;
- désactiver la nature via `SnapOptions.kinds` **évite complètement** le calcul.

L'accrochage d'un glissement de poignée en bénéficie sans code dédié : la scène gelée du geste
passe par le même `snap`.

---

## 4. `hitTestAll` et l'ordre déterministe

`hitTestAll` existait déjà (introduit par le lot précédent, alors inutilisé) : il rend **tous**
les candidats dans la tolérance, triés par priorité, puis distance, puis identifiant.

`hitTest` n'y délègue **pas**. C'est délibéré : `hitTest` est appelé à chaque trame de survol et
son balayage linéaire n'alloue rien, là où `hitTestAll` construit et trie un tableau. L'équation
`hitTest === hitTestAll[0]` est en revanche **vérifiée par test** sur les sept modèles de la
recette, pour chaque entité de chaque scène : la garantie est obtenue sans en payer le coût.

L'ordre ne dépend jamais de l'ordre du tableau source — vérifié en inversant les listes de la
scène.

---

## 5. Cycle de sélection

`src/lib/viewport/selection-cycle.ts` — module pur.

Au centre d'une rosace, huit cercles, deux axes et un point nommé tiennent dans un disque de
12 px. La priorité du hit-test tranche toujours dans le même sens, ce qui la rend prévisible,
mais rend les entités du dessous inatteignables. Le cycle est la réponse : re-cliquer au même
endroit descend d'un cran, puis reboucle.

**Le cycle est ancré à trois choses**, et un changement de l'une d'elles en ouvre un nouveau :

| Ancrage | Rayon / clé | Réinitialise quand |
| --- | --- | --- |
| un **endroit** | `CYCLE_ANCHOR_PX` = 5 px (souris), `TOUCH_CYCLE_ANCHOR_PX` = 16 px (doigt) | le clic tombe hors du rayon |
| un **contexte** | `viewKey` + outil courant | projet, modèle ou mode change |
| une **liste** | les identifiants candidats | la scène a bougé sous le pointeur |

Un clic à vide **ferme** le cycle : le clic suivant au même endroit repart de la tête plutôt que
de reprendre au milieu d'une liste périmée. L'ancre ne dérive pas d'un clic à l'autre — sinon
un décalage d'un pixel par clic finirait par sortir de la zone sans qu'on ait cliqué ailleurs.

**Le cycle vit dans une `ref`, jamais dans un `useState`.** Un état serait recréé à chaque
cascade de rendu (survol, zoom, prévisualisation d'un paramètre) et le deuxième clic ne
descendrait alors jamais d'un cran.

Le rayon d'ancrage est volontairement plus **serré** que la tolérance de désignation (12 px) :
le cycle doit se déclencher sur une intention de re-cliquer, pas sur deux clics voisins qui
visaient deux entités différentes.

---

## 6. Multisélection

`src/lib/viewport/selection-set.ts` — module pur.

Une sélection est une **liste ordonnée sans doublon**, pas un `Set` : l'ordre porte
l'information « quelle entité est active » (la dernière désignée), et c'est elle que
`selectedEntityId` continue de recevoir.

### Gestes

| Geste | Effet |
| --- | --- |
| clic sur une entité | sélection simple, **avec cycle** |
| clic à vide | désélection, cycle fermé |
| **Maj + clic** sur une entité | ajoute, ou **retire** si déjà présente ; le cycle est contourné |
| **Maj + clic à vide** | **ne change rien** |

Maj + clic contourne délibérément le cycle : on construit une sélection, on n'explore pas une
pile, et faire les deux à la fois rendrait le geste imprévisible.

Maj + clic à vide **préserve** la sélection. `Maj` est un modificateur *additif* ; détruire une
sélection de dix entités parce que le doigt a glissé de trois pixels serait le pire résultat
possible du geste. Un clic simple à vide reste la façon de tout désélectionner.

### Compatibilité

`selectedEntityId` / `onSelectEntity` sont **inchangés**. `selectedEntityIds` /
`onSelectEntities` sont additifs et optionnels : sans eux, la multisélection est inerte (Maj +
clic se comporte comme un clic simple) et `AtelierViewportWorkspace` est exactement celui
d'avant ce lot — l'écran d'export n'a pas eu à être touché.

Le workspace notifie **un seul** des deux rappels. Notifier les deux ferait dépendre le résultat
de l'ordre de traitement de deux `setState` chez le parent.

Une entité qui disparaît de la scène (étape de chantier qui restreint la visibilité) quitte la
sélection : `retainExisting` est appliqué en dérivation, jamais recopié dans un état.

### Tactile

La multisélection avancée reste **desktop** : `PointerEvent.shiftKey` vaut toujours `false` au
doigt, et inventer un geste tactile dédié (appui long, lasso, mode dédié) aurait élargi le
périmètre bien au-delà de ce lot. Ce qui fonctionne au doigt :

- la sélection simple, inchangée ;
- **le cycle**, avec un rayon d'ancrage plus généreux (16 px) — vérifié à 375, 430 et 768 ;
- le pan à un doigt, le pincement et le glissement de poignée, tous inchangés.

C'est une limite assumée, pas un oubli : aucun geste tactile existant n'a été modifié.

---

## 7. Panneau propriétés — sélection multiple

`describeSceneSelection` produit, en **lecture seule** :

- le nombre d'éléments ;
- la répartition par nature (`Segment × 1 · Cercle × 3`), dans l'ordre stable de
  `listSceneEntities` ;
- les rôles présents, dédoublonnés et triés ;
- la liste des entités, dans l'ordre de désignation ;
- les **propriétés communes** — les lignes dont le libellé *et* la valeur sont identiques sur
  toutes les entités retenues. Trois cercles de même rayon affichent donc « Rayon (commun)
  55 mm ». Un centre différent n'est pas annoncé comme commun.

Aucune somme, aucune moyenne, aucune plage : ce seraient des contrats métier que ce lot n'a pas
à inventer. Aucun formulaire groupé, aucune modification géométrique multiple — le réglage reste
entité par entité, par sa poignée ou par le formulaire de paramètres, pour que l'historique et
l'autosave restent lisibles.

---

## 8. Retour visuel

Trois niveaux, jamais plus :

| État | Rendu |
| --- | --- |
| entité **active** | ambre, trait 3,4 px (`.selected`) |
| entité **retenue** parmi d'autres | ambre, trait 2,4 px, opacité 0,85 (`.coselected`) |
| entité **survolée** | encre, trait 3 px (`.hovered`) |

Même teinte pour actif et retenu — c'est bien le même état métier : l'œil compte les entités
retenues d'un coup, l'épaisseur dit laquelle le panneau détaille. Un quatrième état rendrait un
plan dense illisible, ce qu'on cherche précisément à éviter en le sélectionnant.

L'accrochage sur intersection reçoit une croix **en X** là où un point du modèle reçoit une
croix **droite**. La forme suffit à dire « ce point est calculé, il n'est pas dessiné », sans
ajouter de couleur ni d'étiquette.

---

## 9. Interaction avec l'édition de sommets

Rien du lot précédent n'a changé :

- l'arbitrage poignée / plan a toujours lieu au `pointerdown`, une fois ;
- un glissement de poignée n'est ni un cycle de sélection, ni une multisélection : le clic n'est
  pas émis après un glissement (`consumeDrag`) ;
- le pan, le zoom et le pincement sont inchangés ;
- l'accrochage du glissement voit les intersections, puisqu'il passe par le même `snap` ;
- aucune mutation directe du `TraceModel`, aucune modification de la philosophie `modelParams`.

---

## 10. Limites connues et suites possibles

- **ellipses** — pas d'intersection (voir §1). Le premier lot qui en aura besoin devra décider
  où placer la résolution du quartique : dans Engine B, pas ici ;
- **multisélection tactile** — desktop seulement (voir §6) ;
- **pas d'édition groupée** — hors périmètre, et volontairement pas préparée : le contrat
  d'une modification multiple mérite son propre lot ;
- **pas de calque « points remarquables »** — `sceneIntersections` le rendrait immédiat, mais
  afficher toutes les intersections d'un tracé chargé demande un travail de lisibilité qui
  dépasse ce lot ;
- **`MAX_INTERSECTION_PAIRS`** borne le balayage complet à 20 000 couples (environ 200 entités
  croisables). Au-delà, il s'arrête plutôt que de bloquer ; le survol n'est pas concerné.
