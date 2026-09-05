# Atelier — intersections, cycle de sélection et sélection multiple (V1)

Lot de DÉSIGNATION. Il n'ajoute aucune primitive, ne trace rien, ne modifie aucune géométrie :
il rend atteignable ce qui était déjà là — les croisements, et les entités cachées sous
d'autres.

## Découpage

| Module | Rôle | Connaît React ? |
| ------ | ---- | --------------- |
| `lib/geometry/intersections.ts` | croisements BORNÉS entre segments, arcs, cercles | non |
| `lib/geometry/snap.ts` | accrochage, dont les intersections calculées | non |
| `lib/geometry/hit-test.ts` | `hitTestAll`, ordre total déterministe | non |
| `lib/viewport/selection-cycle.ts` | quel rang désigne un clic répété | non |
| `lib/viewport/selection-set.ts` | remplacer / ajouter / retirer / élaguer | non |
| `viewport/plan-scene.ts` | `describeSceneSelection` (résumé multi) | non |
| `AtelierViewportWorkspace` | enchaîne les quatre modules ci-dessus | oui |

Le composant ne décide de rien : il convertit un pixel en point monde, appelle les modules purs
dans l'ordre, et publie le résultat. C'est ce qui permet de tester la sélection bout en bout
sans monter un seul composant React.

```
clic px → monde → hitTestAll → cycle (quel rang) → règle de sélection → publication
```

## Pourquoi des intersections BORNÉES, alors qu'Engine A en publie déjà

`primitives.ts` (Engine A) expose `lineIntersection`, `lineCircleIntersections` et
`circleCircleIntersections`. Elles raisonnent sur des supports **infinis** : la droite qui porte
le segment, le cercle entier. C'est ce qu'il faut pour construire — on veut le point même s'il
tombe hors du trait dessiné.

L'accrochage veut l'inverse. Un croisement situé au-delà de l'extrémité d'un segment, ou hors du
secteur balayé par un arc, **n'existe pas pour l'utilisateur** : l'y aimanter l'enverrait dans le
vide. D'où un module distinct, qui borne explicitement, plutôt qu'un détournement des fonctions
existantes.

Seconde différence, moins visible et plus importante : `primitives.ts` compare des
**discriminants** à un epsilon absolu. Un discriminant est homogène à une longueur⁴, donc le même
seuil ne veut pas dire la même chose sur un dessin de 10 mm et sur un dessin de 10 m. Ce module
ne compare que des **longueurs** — « la distance du centre à la droite vaut-elle le rayon ? » —
et le verdict de tangence est donc le même à toutes les échelles. Un test le vérifie
explicitement, à 5 mm puis à 5 000 mm.

### Cas limites, et ce qu'ils renvoient

| Cas | Résultat | Pourquoi |
| --- | -------- | -------- |
| tangence (segment/cercle, cercle/cercle, arc) | **1** point | deux points confondus feraient croire à deux cibles |
| parallèles distincts | 0 | — |
| colinéaires superposés, cercles confondus | **0** | l'intersection est un continuum : aucun point ne mérite d'être proposé |
| concentriques de rayons différents | 0 | — |
| segment nul, rayon nul, coordonnée non finie | 0 | jamais d'exception : ce code tourne sur un `pointermove` |
| croisement hors segment / hors secteur d'arc | 0 | il n'est pas dessiné, donc il n'existe pas |

## §7 — pourquoi les intersections ne coûtent pas O(n²)

Croiser toutes les paires à chaque mouvement de pointeur serait quadratique. La parade ne demande
ni cache, ni index spatial, ni heuristique : elle tient dans une remarque de géométrie.

> Un point d'intersection retenu est à moins de `tolérance` de la cible **et** appartient aux
> deux entités qui le produisent. Chacune de ces deux entités passe donc, elle aussi, à moins de
> `tolérance` de la cible.

Il suffit de ne garder que les entités dont le point le plus proche est dans la tolérance — un
balayage **linéaire**, la même trigonométrie que le hit-test — puis de ne croiser que celles-là.

- **Exact, pas approché** : aucune paire écartée ne pouvait produire un candidat recevable. Zéro
  faux négatif, ce qui distingue ce filtre d'une heuristique de voisinage.
- **Coût** : O(n) + O(k²), où k est le nombre d'entités passant sous le pointeur — un ou deux en
  pratique, trois ou quatre à un croisement chargé.
- **Pas de cache à invalider** : le résultat ne dépend que de la cible et de la scène. Il reste
  donc juste par construction quand la géométrie change sous une prévisualisation de poignée,
  là où un cache serait périmé exactement au mauvais moment.
- **Garde-fou** : `MAX_INTERSECTION_ENTITIES = 12` borne k dans le cas pathologique (des dizaines
  de traits confondus). Au-delà, les intersections sont abandonnées ; les autres natures
  d'accrochage continuent d'être proposées. C'est un repli, pas une panne.

Deux tests tiennent cette propriété : l'un vérifie qu'aucune paire n'est formée au milieu d'une
maille vide, l'autre que **doubler** le nombre d'entités ne quadruple pas le coût.

## §3 — pourquoi l'ordre de `hitTestAll` a dû devenir un ordre total

Le comparateur d'origine tenait deux distances pour égales si `|a − b| < ε`. Cette relation
**n'est pas transitive** : avec ε = 1, 0 ≈ 0,6 et 0,6 ≈ 1,2, mais 0 ≉ 1,2. `Array.sort` suppose
un ordre total ; nourri d'un comparateur intransitif, il rend un résultat qui dépend de l'ordre
d'entrée et du moteur JavaScript.

Tant que seule la **tête** du classement était consommée, cela ne se voyait pas. Le cycle parcourt
toute la liste et exige, lui, un ordre reproductible d'un clic à l'autre — sans quoi re-cliquer
pourrait sauter un cran ou revenir en arrière. Les distances sont donc désormais arrondies sur une
grille de pas ε (`distanceRank`) avant comparaison, ce qui rétablit la transitivité ; l'identifiant
départage ensuite, et il est unique.

`hitTest` renvoie toujours exactement le premier élément de `hitTestAll` : une seule règle de
priorité dans l'application, pas deux classements qui pourraient diverger. Un test l'affirme.

## §4 — ce qui ferme le cycle

Un cycle est une conversation : « pas celle-là, la suivante ». Elle n'a de sens que si les deux
clics parlent du même endroit et de la même scène. Quatre changements la referment :

| Changement | Pourquoi |
| ---------- | -------- |
| la cible bouge au-delà de la tolérance (18 px) | viser ailleurs est une nouvelle demande |
| le zoom change de plus de ×1,25 | à un autre grossissement, la tolérance ne couvre plus les mêmes entités |
| la scène change (modèle, étape, paramètre) | les identifiants mémorisés peuvent avoir disparu |
| la liste des candidats change, **ordre compris** | l'index mémorisé désignerait autre chose |

La comparaison de position se fait en coordonnées **monde**, ce qui traite le pan sans avoir à le
mesurer : déplacer le plan sous un curseur immobile change le point monde visé, donc referme le
cycle — ce qu'on veut, puisque les entités sous le curseur ne sont plus les mêmes.

L'ancre reste celle du **premier** clic du cycle. Si elle suivait le pointeur, une dérive de
quelques pixels par clic — inévitable à la main, surtout au trackpad — promènerait l'ancre aussi
loin qu'on veut sans jamais franchir la tolérance, et le cycle continuerait sur des entités qui ne
sont plus sous le curseur.

## §5 — Maj+clic n'avance pas le cycle

Les deux gestes se disputent le même clic répété au même endroit, et il a fallu trancher.

Si un Maj+clic faisait avancer le cycle, Maj+cliquer deux fois au même croisement descendrait
dans la pile et **ajouterait** l'entité du dessous. Il deviendrait alors impossible de retirer par
Maj+clic ce qu'un Maj+clic vient d'ajouter — alors que c'est ce que ce geste veut dire partout
ailleurs. Le clic additif lit donc le rang **courant** sans le changer (`advance: false`).

L'entité du dessous reste atteignable, et sans ambiguïté : on clique normalement jusqu'à elle — le
cycle avance — puis on la compose au Maj+clic.

Autre asymétrie volontaire : un clic simple dans le vide vide la sélection ; un **Maj+clic** dans
le vide la préserve. Détruire une sélection patiemment construite parce qu'un Maj+clic a raté sa
cible de trois pixels serait une perte sèche — la sélection n'entre pas dans l'historique, donc
rien ne permettrait de la récupérer.

## Compatibilité

`selectedEntityIds` / `onSelectEntities` s'ajoutent, ils ne remplacent pas. Un parent resté en
sélection unique fonctionne sans changement : `onSelectEntity` continue d'être appelé, avec
l'entité **principale** (la dernière désignée). Les deux ne peuvent pas diverger, puisque la
principale est dérivée de la liste et jamais transmise à part.

## Limites assumées de ce lot

- pas de tracé libre, pas de création de primitive, pas d'édition groupée (le panneau multi est
  descriptif) ;
- les polylignes et contours ne sont pas décomposés en arêtes pour l'intersection : l'aiguillage
  `intersectionsBetween` est le seul point à étendre le jour où ce sera utile ;
- `lineSegmentIntersections` existe et est testée, mais n'est branchée sur rien : aucune scène ne
  publie de `Line` aujourd'hui. Elle attend le tracé libre ;
- le mobile n'a pas de geste d'ajout : le contrat (`additive`) est exprimé en intention, pas en
  touche, pour qu'un appui long ou un mode dédié puisse le satisfaire sans rien changer en
  dessous.
