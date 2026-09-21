# Tracé libre de l'Atelier — fondation V1

`ATELIER-FREE-DRAWING-FOUNDATION-V1`

Ce document dit **ce que le tracé libre est**, en quoi il diffère du modèle paramétrique, où
vit sa source de vérité, et ce qu'il ne sait délibérément pas faire.

---

## 1. Paramétrique et libre : deux contrats, jamais mélangés

L'Atelier connaît désormais deux façons de produire une géométrie. Elles ne diffèrent pas par
leur richesse mais par **l'endroit où se trouve la vérité**.

| | Paramétrique (Engine B) | Libre |
| --- | --- | --- |
| Ce que le projet enregistre | `modelId` + `modelParams` (les seuls ÉCARTS aux défauts) | `freeGeometry` : les sommets eux-mêmes |
| La géométrie est… | **dérivée** — recalculée à chaque affichage | **source** — rien ne la recalcule |
| Déplacer un point | traduit en paramètre, ou refusé (classes A et B) | écrit tel quel (classe C) |
| Perdre le champ, c'est perdre… | des réglages, reconstituables | le travail lui-même |
| Faire évoluer le modèle | change les tracés existants | sans effet |

La conséquence qui structure tout le lot : **un projet ne peut pas porter les deux à la fois**.
Deux sources de vérité géométrique dans un même projet, et plus rien ne dit laquelle exporter,
laquelle coter, laquelle un « annuler » doit restaurer.

Le refus vit dans `validateTracingProject` — donc dans la validation, pas dans l'UI. C'est la
seule place qu'aucun import, aucune reprise de brouillon et aucune écriture directe en base
locale ne peut contourner.

`tracingProjectMode(project)` donne le mode réel : `parametric`, `free` ou `undecided`. Il est
**déduit** de ce que le projet porte, jamais stocké — un drapeau pourrait mentir, une déduction
non.

---

## 2. Source de vérité

```
Paramétrique :  modelId + modelParams  →  Engine B  →  TraceModel  →  scène / export
                └── source ────────┘      └── dérivé ──────────────────────────────┘

Libre :         freeGeometry  →  freeGeometryToShape  →  scène / export
                └── source ─┘     └── projection, jamais un recalcul ──┘
```

`freeGeometryToShape` ne calcule rien : elle recopie des sommets déjà en millimètres et en
déduit les bornes. Elle produit une `ShapeGeometry`, ce qui suffit à la fois au viewport (une
`PlanScene` est un sur-ensemble structurel de `ShapeGeometry`) et à l'export. Une seule
projection, deux consommateurs — deux projections dériveraient au premier ajout de primitive.

---

## 3. Primitives de la V1

Trois, et rien d'autre :

- **Point** — un sommet ;
- **Segment** — deux sommets ;
- **Polyligne** — deux sommets ou plus, ouverte.

Toutes trois partagent une seule forme (`{ id, kind, points }`) : elles ne diffèrent que par
l'arité et par ce qu'on trace entre les sommets. Trois structures distinctes auraient obligé à
écrire trois fois le déplacement, la validation et l'historique.

**Hors lot, volontairement** : cercle libre, arc libre, ellipse, spline, Bézier, contour fermé,
texte, image, calibration photo.

---

## 4. Gestes

| Outil | Geste | Validation |
| --- | --- | --- |
| Point | un clic / tap | immédiate ; l'outil reste armé |
| Segment | clic A, clic B | au second clic |
| Polyligne | clics successifs | `Entrée`, double-clic, ou le bouton **Terminer la polyligne** |

- `Échap` annule le tracé en cours, **sans historique** : rien n'ayant été enregistré, il n'y a
  rien à défaire.
- Un clic confondu avec le sommet précédent est **refusé**. Ce refus fait deux choses d'un
  coup : il écarte le segment de longueur nulle, et il absorbe le second clic d'un double-clic
  de fin de polyligne.
- Le bouton **Terminer la polyligne** apparaît dans le bandeau d'état dès que le tracé est
  validable. Sans clavier, `Entrée` n'existe pas et le double-tap n'est pas une évidence : sur
  mobile, c'est le seul geste de fin réellement découvrable.

L'automate qui porte tout cela (`free-draw-model.ts`) est **pur** : le tracé en cours n'existe
que dans son état, et la seule chose qui en sort est une primitive complète.

---

## 5. Accrochage

Le moteur d'accrochage existant est réutilisé tel quel : points nommés, extrémités, milieux,
centres, intersections, grille. Rien de nouveau n'a été écrit.

**La position accrochée est celle qui est enregistrée**, à la création comme au déplacement —
pas seulement celle qui est affichée. Un accrochage qui ne serait qu'un retour visuel
produirait des sommets faux d'un ou deux millimètres : invisibles à l'écran, coûteux au mur.
C'est vérifié deux fois dans `free-drawing-integration.test.ts`.

Pendant un glissement, la scène d'accrochage est **gelée et privée de l'entité tenue**. Son
autre extrémité n'est pas une cible souhaitable — s'y accrocher produirait le segment nul que
la validation refuse — et ses propres sommets suivraient le geste, donc s'accrocheraient à
eux-mêmes.

---

## 6. Poignées : la classe C

`handle-map.ts` annonçait cette classe et constatait qu'elle était vide :

> aucun point des 13 modèles actuels n'y tombe […] la classe C existera avec le tracé libre.

Elle arrive ici, et son contrat est **plus simple** que les deux autres :

- **classe A** — le point est directeur : son déplacement se retraduit en paramètre, après
  CALIBRATION sur la géométrie réelle ;
- **classe B** — le point est dérivé, épinglé ou confondu : lecture seule, avec sa raison ;
- **classe C** — le sommet EST la donnée : rien à calibrer, rien à inverser, aucune raison de
  refuser. Tous les sommets libres sont éditables.

`EditableHandle.vertex` porte cette distinction. Sa présence dit que le déplacement s'écrit
dans la source ; son absence, qu'il passe par `modelParams`. Tout le reste du geste — prise au
pointeur, arbitrage pan/poignée, gel, accrochage, rendu, historique, autosave — est **partagé**
entre les trois classes.

---

## 7. Historique

`param-history.ts` empile l'état source d'un modèle paramétrique : quelques nombres.
Impossible de transposer tel quel — l'état source du tracé libre est la liste complète des
entités, et cent instantanés feraient porter à un téléphone cent copies du tracé.

`free-history.ts` empile donc **l'opération**, pas l'état :

| Opération | Ce qu'elle porte | Comment on la défait |
| --- | --- | --- |
| `create` | l'entité créée | on la retire |
| `delete` | les entités ET leur rang | on les remet à leur rang |
| `move-vertex` | l'entité, le rang du sommet, l'avant et l'après | on remet l'avant |

Une entrée pèse ce qu'elle a réellement changé. Aucune ne demande de relire le tracé pour être
inversée. Profondeur bornée à 100, comme la pile paramétrique.

Sont historisés : création de point, de segment, de polyligne ; déplacement de sommet ;
suppression simple et multiple. Ne l'est pas : un tracé abandonné par `Échap`, qui n'a jamais
existé.

---

## 8. Suppression

`Suppr` / `Retour arrière` transmet la **sélection telle quelle**. Le filtrage a lieu dans
`deletableFreeEntityIds`, qui ne retient que ce qui appartient au document libre.

C'est la garantie de §8 — « ne jamais supprimer une primitive Engine B dérivée » — rendue
**structurelle** : la fonction ne sait supprimer que du tracé libre, donc elle ne peut pas
toucher autre chose, quelle que soit la sélection reçue.

---

## 9. Persistance

`TracingProject.freeGeometry`, schéma projet **v4**.

- Migration v3 → v4 : rien à renseigner. Aucun projet antérieur ne pouvait porter de tracé
  libre — la primitive n'existait pas — donc son absence est déjà l'état juste, et aucun
  projet migré ne peut violer l'exclusivité du §1.
- Migration **strictement locale** (IndexedDB `elsatia-atelier`). Aucune base, aucun Supabase.
- Un document libre VIDE est ramené à `undefined` : les deux décrivent le même fait, et n'en
  garder qu'une écriture évite qu'une comparaison de projets signale une différence inexistante.
- Le document porte sa propre version (`FREE_GEOMETRY_VERSION`), distincte de celle du projet :
  les primitives évolueront plus vite que l'enveloppe, et un seul numéro obligerait à migrer
  tous les projets pour un changement qui n'en concerne qu'une partie.

Chemin d'écriture : `useFreeDrawing` → `touchTracingProject` → `scheduleAutosave`. Exactement
celui des réglages paramétriques — donc autosave debouncée, flush au masquage de l'onglet et
reprise de brouillon, sans une ligne nouvelle côté persistance.

---

## 10. Export

`freeAtelierGeometry(project)` produit une `ResolvedAtelierGeometry`, **le même type** que
`resolvedAtelierGeometry(resolution)` pour un modèle. Les deux ne peuvent jamais s'appliquer au
même projet, donc l'écran d'export les enchaîne sans arbitrage à écrire.

Le pipeline d'export n'a **pas bougé d'une ligne** : SVG, DXF, PNG et PDF lisent déjà les
champs `points` / `segments` / `polylines` d'une `ShapeGeometry`.

| Format | Ce qui sort |
| --- | --- |
| SVG | points nommés, segments, polylignes |
| DXF | `LINE` par segment, `POLYLINE` par polyligne |
| PNG / PDF | rendus depuis la même géométrie |
| Report | un sommet par ligne, coté depuis l'origine, origine de mesure `exact` |

**Limite connue et assumée** : `shapeGeometryToDxf` n'émet pas d'entité pour un point isolé
(il n'en émettait pas non plus pour les points nommés d'un modèle). Un point libre apparaît
donc en SVG, en PNG, en PDF et dans le report, mais pas comme entité DXF. Le corriger
demanderait de modifier l'export, ce qui déborde du lot.

**Aucune quantité n'est inventée** : ni nomenclature, ni plan LED, ni profils, ni surface. Un
tracé libre ne dit pas ce qu'il représente ; en déduire un métré serait une invention.

---

## 11. Unités et validation

Tout est en **millimètres monde**. Aucun pixel n'est jamais persisté : la conversion écran ↔
monde appartient au viewport, seule couche à connaître le zoom.

Sont refusés : `NaN`, `Infinity`, une coordonnée hors de ±1 km, un identifiant dupliqué, une
polyligne de moins de deux sommets, un segment qui n'en a pas exactement deux, un segment de
longueur nulle, une nature de primitive inconnue.

Limites — larges à dessein, pour écarter un document corrompu sans rationner le travail :

| Limite | Valeur |
| --- | --- |
| Entités | 1 000 |
| Sommets par polyligne | 500 |
| Sommets au total | 5 000 |
| Étendue d'une coordonnée | ±1 000 000 mm |
| Profondeur d'historique | 100 |

Le repère de charge du lot (100 points, 100 segments, une polyligne de 100 sommets) est très en
deçà, et `free-drawing-load.test.ts` le mesure.

---

## 12. Où c'est

| Fichier | Rôle |
| --- | --- |
| `lib/tracing/free-geometry.ts` | contrat, validation, limites, mutations pures |
| `lib/tracing/free-shape.ts` | projection en `ShapeGeometry` (scène + export) |
| `lib/tracing/free-history.ts` | annulation par opérations |
| `lib/tracing/free-handles.ts` | poignées de classe C |
| `lib/tracing/use-free-drawing.ts` | source unique : état, historique, persistance |
| `components/atelier/viewport/free-draw-model.ts` | automate du geste de création |
| `components/atelier/viewport/FreeDrawPreviewLayer.tsx` | rendu du tracé en cours |
| `components/atelier/free/FreeDrawingBoard.tsx` | plan de travail (scène + poignées + viewport) |
| `lib/exports/atelier-free-geometry.ts` | raccord export |
| `/atelier-free-preview` | banc d'essai interne, `noindex`, sans persistance |

---

## 13. Prochaines extensions

Dans l'ordre où elles deviennent utiles :

1. **contour fermé** — un quatrième `kind`, une ligne de plus dans la projection ; c'est ce qui
   manque pour qu'un tracé libre porte une surface, donc un métré ;
2. **cercle et arc libres** — deux `kind` de plus, dont la forme n'est plus « une liste de
   sommets » : c'est la première extension qui touchera vraiment le contrat ;
3. **déplacement d'une entité entière** (et non d'un seul sommet) — une quatrième opération
   d'historique ;
4. **édition groupée** — la multisélection existe déjà et ne sert aujourd'hui qu'à supprimer ;
5. **cotation manuelle** — la seule façon honnête de faire porter des mesures à un tracé libre ;
6. **calibration photo**, qui donnerait au tracé libre l'usage pour lequel il est réellement
   attendu : décalquer un relevé.
