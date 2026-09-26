# Atelier — édition d'un sommet et historique (V1)

Premier lot d'ÉDITION de l'Atelier. Les lots précédents affichaient et désignaient ; celui-ci
modifie — mais uniquement à travers les **paramètres source** du modèle, jamais la géométrie.

## Le principe, en une phrase

Une poignée ne déplace pas un point : elle traduit une intention de déplacement en
`modelParams`, et Engine B recalcule la forme. Un point dont le déplacement n'est représentable
par aucun paramètre n'est pas éditable, et le dire est une réponse valide.

```
pointerdown → glissement → accrochage → inversion → quantification → bornage
            → modelParams → TracingProject → autosave → Engine B → géométrie
```

## Découpage

| Module | Rôle | Connaît React ? |
| ------ | ---- | --------------- |
| `lib/tracing/editable-handle.ts` | contrat `EditableHandle`, mesures, inversion, quantification | non |
| `lib/tracing/handle-map.ts` | matrice d'éditabilité des 13 modèles, calibration | non |
| `lib/tracing/param-history.ts` | pile annuler / rétablir sur les surcharges | non |
| `viewport/gesture-routing.ts` | arbitrage plan / poignée | non |
| `lib/tracing/use-model-editing.ts` | source unique des réglages : formulaire + poignées | oui |
| `lib/tracing/use-undo-redo-shortcuts.ts` | raccourcis clavier | oui |
| `viewport/HandleLayer.tsx` | rendu des poignées | oui |
| `AtelierViewportWorkspace` | orchestration du geste | oui |

## Pourquoi des pentes calibrées, et non des formules

L'inversion « position visée → paramètre » ne recopie **aucune** formule d'Engine B. Pour chaque
paramètre piloté, `handle-map.ts` reconstruit le modèle une fois avec ce paramètre décalé d'un
pas, et mesure de combien le point bouge :

```
pente = d(mesure) / d(paramètre)        mesuré, jamais écrit
paramètre = valeurBase + (mesureVisée − mesureCourante) / pente
```

Réécrire ici « rayon = diamètre / 2 » créerait une seconde source de vérité géométrique : elle
dériverait le jour où le modèle changerait, et l'édition renverrait alors des paramètres faux
**sans que rien n'échoue**. La calibration, elle, suit le générateur par construction.

L'écriture en écart absorbe au passage les termes constants : la pointe du cœur est à
`−(hauteur − largeur/4)`, et l'inversion n'a jamais besoin de connaître le `largeur/4`.

Cette écriture suppose la relation **affine** entre la mesure et le paramètre.
`handle-map.test.ts` le vérifie plutôt que de le supposer : sur les 13 modèles, une seconde
calibration à un écart trois fois plus grand doit donner la même pente. Et le test qui compte
vraiment vise une position, en déduit les paramètres, **reconstruit le modèle par Engine B** et
contrôle que la poignée est arrivée où on la voulait.

### Ancre gelée

Les mesures polaires et axiales partent d'une ancre **gelée** à la construction de la poignée.
Ce n'est pas un détail : sur l'arche et l'ogive, l'origine du repère se déplace avec la largeur,
et mesurer depuis une ancre mobile compterait le déplacement deux fois.

## Matrice d'éditabilité (§1)

**65 poignées de classe A, 33 de classe B, 0 de classe C** sur les 13 modèles.

- **A — éditable** : point directeur, dont le déplacement le long d'une mesure se retraduit sans
  ambiguïté en un paramètre publié.
- **B — visible, lecture seule** : point ÉPINGLÉ (centre du repère, naissance gauche de
  l'arche), DÉRIVÉ (foyers, pointes de rosace, centres d'arcs) ou CONFONDU (`L` sur `A`).
  Tout point qu'aucune règle ne déclare retombe ici : c'est le sens sûr.
- **C — forme libre uniquement** : **vide**, et c'est attendu — les 13 modèles sont
  intégralement paramétriques. La classe C existera avec le tracé libre, hors lot.

| Modèle | A — éditables | B — lecture seule | Paramètres sans poignée |
| ------ | ------------- | ----------------- | ----------------------- |
| circle-division | `P1…Pn` polaire → `diameter` + `startAngle` | `O` | `divisions` |
| star-5 | `T1…T5` → `outerDiameter` + `rotation` ; `V1…V5` → `innerRatio` + `rotation` | `O` | — |
| rosette-6 | `C1…C6` → `diameter` + `rotation` | `O`, `T1…T6` (pointes dérivées) | — |
| heart | `cusp` axe Y → `height` ; `leftLobe`/`rightLobe` axe X → `width` | — | — |
| arch-full-round | `B` axe X → `width` ; `S` axe Y → `width` | `O`, `A`, `L`, `R` | — |
| ogive-equilateral | `B` axe X → `width` ; `S` axe Y → `width` | `A`, `L`, `CG`, `R`, `CD` | — |
| ellipse-pedagogical | `Vx±` → `width` ; `Vy±` → `height` | `O`, `F1`, `F2` (foyers) | — |
| spiral-archimedes | `start` → `startRadius` + `rotation` ; `end` → `endRadius` | `O` | `turns` |
| flower-4 / -5 / -6-elongated | `C1…Cn` → `diameter` + `rotation` | `O` | — |
| turbine | `T1…T6` → `diameter` + `rotation` ; `V1…V6` angulaire → `twist` | `O` | `branches` |
| double-s | `S1-P0` → `height` ; `S2-P0` → `width` + `height` ; `S2-P2` → `width` | `S1-P1`, `S1-P2`, `S2-P1`, les 4 centres d'arcs | `waistRatio` |

Quatre paramètres sur 33 n'ont volontairement aucune poignée : un comptage (`divisions`,
`branches`) et un nombre de tours (`turns`) ne se tirent pas au doigt — après N tours, l'angle
mesuré est replié modulo 360° et ne distingue plus 3 tours de 4. Le bombement du double-S
(`waistRatio`) ne déplace que des centres d'arcs, c'est-à-dire des points dérivés. Tous restent
réglables au formulaire, qui écrit la même source.

Le creux de turbine mérite un mot : son rayon intérieur est un rapport figé du diamètre, donc
seul l'angle porte une information propre. La poignée n'a qu'une contrainte angulaire — elle
glisse sur son cercle et ne s'en éloigne pas.

## Un pan ne devient jamais une édition (§4)

L'arbitrage a lieu **une fois**, au `pointerdown` : le contact appartient à une poignée ou au
plan pour toute sa durée. Décider plus tard — au premier mouvement, ou après un seuil de
distance — laisserait le plan glisser de quelques pixels avant que la poignée ne prenne la
main, ce qui se voit et se ressent comme un défaut.

Tant qu'une poignée est tenue, les contacts supplémentaires sont **ignorés** : pas de pincement
à deux doigts au milieu d'un réglage, faute de quoi un doigt parasite ferait sauter le zoom et
emporterait le sommet avec lui.

L'automate vit dans `gesture-routing.ts`, pur et testé pour lui-même plutôt qu'à travers un
composant monté.

### Zone de prise

| | souris | doigt |
| --- | --- | --- |
| sélection | 12 px | 20 px |
| accrochage | 10 px | 16 px |
| **poignée** | **14 px** | **26 px** |

Plus généreuse que la sélection : en mode Édition la poignée EST la cible, et la rater fait
glisser le plan à sa place — une erreur plus coûteuse que de désigner la mauvaise entité,
puisqu'elle interrompt le réglage. Vérifié en recette : à 22 px du sommet, la souris ne prend
rien et le doigt prend la poignée.

## L'accrochage est appliqué, pas seulement affiché (§6)

C'est la position **accrochée** qui traverse l'inversion, la quantification et le bornage — pas
la position brute du curseur. Vérifié en recette réelle : en visant à 8 % d'un pas de grille,
c'est le nœud de grille qui est enregistré.

Deux règles pendant le geste :

- la scène d'accrochage est **gelée** au début du geste. Une cible qui bouge avec la géométrie
  qu'on déforme n'est pas une cible ;
- le point tenu en est **retiré**. Sans quoi il s'accrocherait à lui-même et le glissement se
  figerait définitivement.

La valeur produite est ensuite alignée sur le pas du paramètre **depuis son minimum**, comme le
fait `isOnStep` dans `model-resolver.ts` : aligner depuis une autre base produirait une valeur
que le résolveur refuserait alors qu'elle est dans les bornes. Un test parcourt les 33
paramètres du registre et vérifie que toute valeur quantifiée est acceptée par
`normaliseModelParameters`.

## Historique (§7)

Une entrée porte les `modelParams` **avant** et **après** — les surcharges, pas les valeurs
effectives, et surtout pas un instantané de `TraceModel`. Trois raisons, par ordre d'importance :
un instantané serait une seconde source de vérité géométrique ; les défauts appartiennent au
modèle et peuvent évoluer avec lui ; et le poids.

### La prévisualisation est un état séparé — et c'est le point délicat

Pendant un glissement, la géométrie suit le doigt à chaque trame sans rien enregistrer. La
tentation serait d'écrire dans `values` et de ne « valider » qu'au relâchement. C'est un piège :
au relâchement, l'état d'avant le geste aurait déjà été écrasé par la dernière trame, et
l'entrée d'historique aurait un `before` égal à son `after` — annuler ne ferait plus rien.

`preview` est donc un calque transitoire posé **par-dessus** `values`, jamais dedans. Vérifié en
recette : « Annuler » reste désactivé pendant tout le glissement et ne s'active qu'au
relâchement.

### Fusion des saisies

Taper « 2000 » dans un champ nombre émet quatre changements. Les entrées consécutives de même
clé `source` déclarées fusionnables sont réunies en une seule, en gardant le `before` de la
première — une correction, une annulation. Un glissement ne se déclare jamais fusionnable :
deux glissements successifs sur la même poignée restent deux gestes.

### Raccourcis

| geste | effet |
| ----- | ----- |
| `Cmd/Ctrl + Z` | annuler |
| `Cmd/Ctrl + Maj + Z` | rétablir |
| `Ctrl + Y` | rétablir (convention Windows) |

`Cmd+Y` n'est pas lié : sur macOS il appartient au navigateur. Et **les champs de saisie gardent
leur annulation native** — détourner le raccourci ferait remonter l'historique du tracé alors
que l'utilisateur croit corriger un chiffre à moitié tapé. Le bouton « Annuler » de la barre
reste accessible dans ce cas.

## Une seule source pour le formulaire et les poignées (§10)

Les deux appellent `commitValues`, qui empile l'historique, met à jour le projet et déclenche
l'autosave. Il n'existe pas de « valeurs du viewport » distinctes des « valeurs du formulaire » :
l'exigence est structurelle, pas surveillée — il n'y a rien à synchroniser, donc rien qui puisse
diverger. Vérifié dans les deux sens en recette réelle.

`overridesOnly`, qui vivait en local dans `NouveauTraceWorkspace`, a rejoint `param-history.ts` :
une seule définition de « ce qui est enregistré », partagée par le formulaire, les poignées,
l'annulation et l'autosave.

### Correction au passage : la reprise ne perd plus les réglages

La reprise d'un tracé enregistré repose l'utilisateur sur l'étape « modèle » avec son modèle
déjà sélectionné, et le geste naturel pour continuer est de le re-toucher — ce qui effaçait
`modelParams`. `modelParamsAfterModelChoice` conserve désormais les surcharges quand le modèle
ne change pas, et ne les abandonne que sur un vrai changement (où elles n'auraient plus de sens).

## Persistance (§9)

Rien de nouveau : l'édition emprunte le chemin existant — `touchTracingProject` puis
`scheduleAutosave`, debounce compris, `flushAutosave` compris, schéma v3 inchangé. Une
annulation est enregistrée comme n'importe quel autre état : c'est un état, pas un oubli.
« Continuer » ne sauvegarde plus rien puisque chaque réglage l'a déjà été — quitter la page en
cours de réglage ne perd plus rien.

## Hors lot

Intersections avancées, sélection multiple, tracé libre, calibration photo, import d'image,
persistance du pan/zoom, DB/Supabase, modification structurelle d'Engine B.
