# Atelier — contour libre fermé, surface et périmètre

`ATELIER-FREE-CONTOUR-AREA-QUANTITIES-V1`

Première primitive libre réellement exploitable pour le métré. Elle ajoute au tracé libre une
forme **fermée**, et avec elle les deux grandeurs que cette fermeture rend démontrables : une
**surface** et un **périmètre**.

Ce lot n'ouvre pas un moteur CAD général : ni cercle, ni arc, ni texte, ni calibration photo.
Engine B reste la source de vérité des modèles paramétriques, `freeGeometry` celle des tracés
libres, et les deux ne coexistent toujours pas dans un même projet.

## La primitive

| Nature | Identifiant | Sommets | Fermeture |
| ------ | ----------- | ------- | --------- |
| `point` | `pt-n` | 1 | — |
| `segment` | `sg-n` | 2 | — |
| `polyline` | `pl-n` | 2 à 500 | non |
| **`polygon`** | **`pg-n`** | **3 à 500** | **implicite** |

### Pourquoi `polygon` et pas `contour`

Chaque nature libre porte le nom du champ d'export qu'elle alimente : `point` → `points`,
`segment` → `segments`, `polyline` → `polylines`, `polygon` → `polygons`. Cette correspondance
mot pour mot est ce qui rend la projection lisible, et c'est aussi le vocabulaire déjà employé
par la primitive `Polygon`, par le hit-test, par `createPolygonPath` et par le `closed: true`
du DXF. Introduire `contour` dans le code aurait fait exister deux mots pour une seule forme.

Le mot **contour** reste celui de l'interface : c'est le libellé français de la nature, celui du
bouton de la barre d'outils et celui de la fiche propriétés.

### Fermeture implicite

Le dernier sommet rejoint le premier, et **le premier n'est jamais répété en fin de liste**.

Un sommet répété serait une donnée que rien ne maintient : déplacer le sommet 1 devrait en
déplacer deux, l'oublier ouvrirait le contour sans que le document le dise, et le nombre de
sommets affiché mentirait d'une unité. `freeEntityEdges` est le seul endroit qui matérialise le
côté de fermeture ; tout ce qui parcourt les arêtes passe par lui.

### Version du document

`FREE_GEOMETRY_VERSION` reste à **1**, et aucune migration n'est nécessaire. Un tracé écrit avant
ce lot se relit inchangé. Dans l'autre sens, une version antérieure de l'application refuse
précisément ce qu'elle ne sait pas lire — « la nature "polygon" n'existe pas dans cette
version » — au lieu de refuser en bloc tout document, contours ou non, ce qu'une incrémentation
aurait provoqué.

## Création

| Geste | Effet |
| ----- | ----- |
| clics successifs | posent les sommets |
| clic sur le **premier sommet** | referme, à partir de trois sommets |
| `Entrée` / double-clic | referme, à partir de trois sommets |
| bouton « Fermer le contour » | idem — seule voie fiable sans clavier |
| `Échap` | abandonne, **sans historique** |

Le sommet arrive dans l'automate **déjà accroché** (grille, extrémité, milieu, centre,
intersection) : la position enregistrée est la position accrochée, jamais celle du curseur.

La **fermeture par clic** obéit à une autre règle, et il faut dire pourquoi. Les sommets d'un
tracé en cours ne sont pas dans la scène — ils ne sont pas encore engagés — donc l'accrochage ne
les propose pas comme cibles : exiger que le clic tombe au millième de millimètre sur le premier
sommet rendrait la fermeture à la souris impossible. Le seuil est donc la **tolérance de visée**
de la désignation (`selectionTolerancePx`, convertie en millimètres à la vue courante).

Cela ne coûte aucune précision, et c'est la raison qui rend la règle admissible : le clic de
fermeture **n'enregistre aucun sommet**. Il valide les sommets déjà posés, avec leurs positions
accrochées. Approcher le premier sommet ne le déplace pas et n'en crée pas de jumeau — c'est ce
qui distingue ce clic de tous les autres, où la précision de la position décide de la donnée.

Un clic sur le premier sommet **avant** le troisième est refusé sur-le-champ, en disant ce qui
manque, plutôt qu'ajouté comme un sommet en double que la validation rejetterait plus tard.

## Unités

Tout est en **millimètres monde**. La source ne porte aucun arrondi.

| Grandeur | Source | Affichage |
| -------- | ------ | --------- |
| périmètre | mm | mm (`formatMillimetres`) |
| surface | mm² puis m² (`areaM2`) | m², 3 décimales (`formatSquareMetres`) |

L'arrondi vit à l'affichage et nulle part ailleurs. Les deux écritures sont exportées depuis
`plan-scene.ts`, pour que le chiffre lu pendant le tracé soit celui relu dans la fiche.

## Surface, périmètre, orientation

`lib/tracing/free-contour.ts` — module pur.

- **surface** : formule du lacet (`signedPolygonArea`, empruntée au moteur via `geometry-port`) ;
- **périmètre** : somme des côtés, **fermeture comprise** ;
- **orientation** : lue dans le SIGNE de l'aire. Le repère a Y vers le haut, donc une aire
  positive est un parcours antihoraire. **L'ordre des sommets n'est jamais réécrit** : c'est la
  donnée que l'utilisateur a produite en cliquant, et la retourner en silence ferait mentir le
  report et le DXF sur l'ordre réel du tracé.

## Validité — deux frontières, pas une

La distinction structure tout le lot.

**Document abîmé → refusé** (`validateFreeEntity`, O(n), à l'écriture) :

- moins de trois sommets ;
- coordonnée non finie, ou hors des limites du projet (±1 km) ;
- côté de longueur nulle, **fermeture comprise** — un contour dont le dernier sommet retombe sur
  le premier porte un sommet fantôme, et c'est l'erreur qu'un clic de fermeture mal placé produit
  le plus souvent.

**Forme inexploitable → conservée, mais sans surface** (`freeContourMeasures`, à la demande) :

| Statut | Cause | Surface |
| ------ | ----- | ------- |
| `valid` | — | mesurée |
| `self-intersecting` | deux côtés non adjacents se croisent | **`null`** |
| `degenerate` | aire sous `FREE_CONTOUR_MIN_AREA_MM2` (1 mm²) | **`null`** |

La règle du lot : **le contour reste, la surface se tait**. `areaMm2` vaut `null`, **jamais `0`** —
un zéro se lit comme une mesure, et « ce plafond fait 0 m² » est plus dangereux que « surface non
exploitable ». Refuser le contour lui-même ferait disparaître le travail de l'utilisateur sous
ses yeux, alors qu'un sommet déplacé suffit souvent à rendre la forme mesurable.

L'auto-intersection est testée **avant** la dégénérescence : un nœud papillon symétrique a une
aire algébrique nulle, et serait autrement diagnostiqué « sommets alignés » — un diagnostic faux.

Le **périmètre** reste publié dans tous les cas : c'est l'aire, pas la longueur, que le
croisement rend ambiguë.

### Coût de la détection

`freeContourSelfIntersects` est quadratique en nombre de côtés, et elle est appelée pendant un
glissement de sommet. Le prédicat reste celui du moteur (`segmentSegmentIntersection`) ; seul le
PARCOURS change, par un rejet préalable en boîtes englobantes qui écarte la quasi-totalité des
paires d'une forme d'ouvrage avant tout calcul. `free-contour.test.ts` vérifie l'accord des deux
fonctions sur une batterie de formes : le filtre doit accélérer la réponse, jamais la changer.

Pour la même raison, `freeGeometryToShape` ne calcule les quantités que sur demande
(`quantities: true`, voie d'export). Le viewport ne les paie à aucune trame.

## Édition

Chaque sommet publie une poignée de **classe C** : la position EST la donnée, elle s'écrit telle
quelle, sans inversion ni calibration. Après un déplacement, surface et périmètre sont recalculés
immédiatement ; `Annuler` / `Rétablir` rendent les mesures d'origine à l'identique.

**Hors lot** : insertion et suppression d'un sommet isolé. Le lot livre le déplacement de sommet
et la suppression du contour entier, qui suffisent à corriger une forme ; l'insertion demanderait
de décider sur quel côté insérer, comment le désigner et comment l'annuler — un contrat à part
entière, qui appartient au lot suivant.

## Sélection, accrochage, intersections

Aucun moteur spécial n'a été écrit : le contour entre dans les mécaniques existantes par le champ
`polygons` de la scène.

- **hit-test** : meilleur côté, fermeture comprise ;
- **accrochage** : sommets et milieux de côtés, milieu du côté de fermeture compris ;
- **intersections R2** : les arêtes du contour participent comme celles d'une polyligne ;
- **cycle de sélection, multisélection, suppression multiple** : identiques aux autres natures.

## Fiche propriétés (lecture seule)

Sommets · Périmètre · Surface · Orientation · Statut.

La ligne « Surface » ne disparaît jamais : un contour inexploitable y affiche « Non exploitable »,
et la ligne « Statut » dit pourquoi. Une ligne absente se lirait comme un oubli ; une raison
écrite se lit comme un refus motivé, et dit quoi corriger.

## Report et quantités

`ShapeGeometry.quantities` porte, par contour **exploitable** :

| Identifiant | Grandeur | Unité | Qualité |
| ----------- | -------- | ----- | ------- |
| `q-<id>-area` | surface | `m²` | `exact` |
| `q-<id>-perimeter` | périmètre | `mm` | `exact` |

Un contour inexploitable ne publie **aucune** ligne de surface, et garde sa ligne de périmètre.

Ces quantités passent par `nomenclatureFromQuantities` — l'adaptateur qui existait déjà pour les
quantités du moteur — et s'**ajoutent** aux matières saisies par l'utilisateur au lieu de les
remplacer. Elles ne portent aucune hypothèse de matière : **ni chute, ni prix, ni nombre de
plaques, ni volume**. Ces calculs appartiennent à des lots métier ultérieurs.

La table de report continue de ne porter que des **coordonnées de sommets**, chacune une seule
fois : le premier sommet n'y est pas répété, la fermeture étant dite par la nature de l'entité.

## Export

Rien du pipeline n'a changé — c'est le champ `polygons` qui referme la forme partout à la fois.

| Format | Ce qui sort |
| ------ | ----------- |
| SVG | `<path>` terminé par un `Z` unique, sans sommet dupliqué |
| DXF | `POLYLINE` de calque `FINAL`, groupe 70 = 1 (fermée), autant de `VERTEX` que de sommets |
| PDF / PNG | chemin fermé ; section « Quantités » alimentée par la nomenclature |
| mosaïque / 1:1 | dimensionnées sur les bornes du **contenu**, jamais sur le viewport |

## Retour visuel pendant le tracé

- côté de **fermeture** dessiné dès le deuxième sommet : la surface enfermée est visible avant le
  dernier clic ;
- **halo** autour du premier sommet dès qu'un clic dessus refermerait — même fonction et même
  tolérance que celles que l'automate consultera au clic suivant, donc le halo ne peut pas
  promettre une fermeture que le clic refuserait ;
- **surface approchée** dans le bandeau d'état, qui se tait sur une forme croisée ;
- consigne qui suit ce que le prochain geste peut réellement faire, à chaque étape.

Aucune modale.

## Mobile

Boutons d'outils à 44 px de haut. Le bouton « Fermer le contour » passe à 44 px sur pointeur
grossier : sur un téléphone, refermer en visant le premier sommet demande une précision que le
doigt n'a pas, et un geste de fin raté oblige à recommencer le contour. La barre reste en
`flex-wrap` — douze boutons se répartissent sur quatre rangs à 375 px, sans débordement.

## Limites connues

- pas d'insertion ni de suppression de sommet isolé (voir « Édition ») ;
- pas de trou ni de contour multiple : un `polygon` est un anneau simple ;
- un contour auto-intersecté n'est pas réparé automatiquement — il est signalé ;
- l'orientation n'est jamais normalisée ;
- aucune quantité métier n'est déduite de la surface.
