# ATELIER-TOOLS-FREE-DRAWING-R2-RECONCILIATION-V1

Réconciliation du tracé libre avec la seconde version du lot intersections / multisélection.

## 1. Topologie réelle

Les deux lignées ne se succèdent pas : elles sont **sœurs**.

```
2268553  feat(tools): add atelier vertex editing and undo redo   ← MERGE-BASE RÉEL
   ├── b0c55e8  feat(tools): add atelier intersections and multiselect   (V1)
   │      └── 2c8e1a7  feat(tools): add atelier free drawing foundation
   └── 528773c  feat(tools): add atelier intersections and multiselect   (R2) ← CANON
```

`git merge-base 528773c b0c55e8` = `2268553`. `b0c55e8` et `528773c` sont **deux versions
rivales du même commit** : R2 est la refonte de V1, pas sa suite. Le tracé libre a donc été
bâti et validé sur une base que le canon ne contient pas.

| Delta | Fichiers | Insertions |
|---|---|---|
| `2268553..b0c55e8` (V1) | 19 | 2 415 |
| `2268553..528773c` (R2) | 18 | 2 573 |
| `b0c55e8..2c8e1a7` (tracé libre) | 39 | 4 680 |

## 2. Stratégie retenue

**Cherry-pick de `2c8e1a7` sur `528773c`** (option A), puis résolution manuelle.

C'est la seule des quatre options qui donne la bonne base de fusion à trois points : Git
compare `2c8e1a7` à son parent `b0c55e8`, et n'applique donc **que** le delta « tracé libre ».
Le contenu R2 n'est jamais candidat au remplacement — il n'apparaît pas dans le patch.

Écartées :
- *rejeu manuel* : 4 680 lignes à retranscrire, aucun filet ;
- *merge ciblé* : ferait de `b0c55e8` un ancêtre du canon et réintroduirait V1 par les
  fichiers que le tracé libre ne touche pas (`snap.ts`, `intersections.ts`, `selection-*`) ;
- *cherry-pick partiel* : le tracé libre n'est pas séparable en sous-lots cohérents.

Aucun `reset`, aucun `--force`, aucun autre worktree touché.

## 3. Conflits et résolutions

### 3.1 Conflits Git (2 fichiers)

**`viewport/index.ts`** — conflit de commentaire d'en-tête uniquement ; les listes d'export
avaient fusionné seules. Conservé : le paragraphe « tracé libre », plus la note R2 sur les
intersections déjà présente dans le corps. Aucun export perdu de part et d'autre.

**`viewport/AtelierViewportWorkspace.tsx`** — 5 zones. R2 gagne partout où les deux versions
disent la même chose différemment ; l'extension « tracé libre » est réappliquée par-dessus.

| # | Zone | Résolution |
|---|---|---|
| 1 | import `selection-set` | API R2 (`selectSingle`, `toggleSelection`, `SelectionSet`) + `EMPTY_SELECTION` requis par §8 |
| 2 | survol hors toile | `setSnapCandidate(null)` (R2) **+** `setDrawCursor(null)` (libre) |
| 3 | survol sur toile | `setSnapCandidate(candidate)` (R2, objet complet : porte `kind`) **+** curseur de tracé |
| 4 | barre d'outils | `state={effectiveState}` ; `hasSelection={selection.length > 0}` |
| 5 | `PlanSceneLayer` | rendu R2 (`snapPoint` + `snapIsIntersection`) sous la porte `snapFeedbackVisible` du tracé libre |

Zone 3 : R2 conserve le **`SnapCandidate` entier** là où le tracé libre n'avait gardé qu'une
position. C'est ce qui permet à `snapIsIntersection` de survivre — une résolution qui aurait
pris le côté « tracé libre » aurait silencieusement supprimé le retour visuel d'intersection.

Zone 4 : `Boolean(selectedEntityId)` (R2) → `selection.length > 0`. Strictement identique hors
multisélection (`selection` s'y réduit à l'entité active) et correct avec — condition pour que
« Supprimer » s'allume sur une sélection multiple (§8).

### 3.2 Conflits sémantiques (invisibles à Git)

Fusion textuelle propre, code faux : R2 avait renommé l'API que le tracé libre appelle.
Révélés par `tsc`, pas par `git`.

| Appel du tracé libre (V1) | Équivalent R2 | Sites |
|---|---|---|
| `publishSelection(...)` | `applySelection(...)` | `AtelierViewportWorkspace.tsx` |
| `pruneSelection(sel, ids)` | `retainExisting(sel, ids)` | `FreeDrawingBoard.tsx`, `AtelierFreePreviewWorkspace.tsx`, test d'intégration |
| `applySelectionClick(sel, id, additive)` | éclaté dans le workspace R2 | test d'intégration |

`pruneSelection` ≡ `retainExisting` : même filtre préservant l'ordre, même renvoi de la
référence courante quand rien ne disparaît. Renommage pur.

`applySelectionClick` n'a pas d'équivalent : R2 a réparti la règle entre la branche additive
et la branche cycle du workspace. Le harnais de test **reproduit désormais la règle R2**
(`toggleSelection` / `selectSingle`) au lieu d'appeler un helper parallèle — un helper qui
aurait pu diverger du composant sans que rien ne le signale.

## 4. Régression R2 corrigée : ordre total de `hitTestAll`

V1 quantifiait les distances avant comparaison (`distanceRank`). **R2 ne l'a pas repris** et
son comparateur est redevenu intransitif : « à moins de ε » n'est pas une relation d'ordre
(0 ≈ 0,6ε et 0,6ε ≈ 1,2ε, mais 0 ≉ 1,2ε). `Array.prototype.sort` en exige une.

Mesuré avant correction, sur une chaîne de 40 distances espacées d'un demi-ε avec des
identifiants anti-corrélés : **80 permutations de la même scène → 80 ordres différents.**

`hitTest` n'en souffrait pas (il ne lit que la tête). Le **cycle de sélection**, lui, compare
la liste d'un clic à l'autre : un ordre instable le rouvre en silence et « re-cliquer pour
prendre l'entité en dessous » cesse de tenir.

§3 du lot fait gagner R2 lorsqu'il porte « l'ordre déterministe R2 ». Ici R2 ne le porte pas :
`distanceRank` est **reporté depuis `b0c55e8`** dans `lib/geometry/hit-test.ts`. Le résultat
est inchangé dans tous les cas non dégénérés, et les 1 329 tests R2 passent sans modification.
Verrouillé par deux tests dans `free-drawing-intersections-r2.test.ts`.

## 5. Ce qui est préservé

**Côté R2** — intact, aucun fichier repris de V1 hormis la correction ci-dessus :
`intersections.ts` (segment/segment, segment/cercle, cercle/cercle, segment/arc, arc/cercle,
arc/arc, contours par arêtes, tangence, broad-phase WeakMap + bounds), `snap.ts` (accrochage
intersection), `selection-cycle.ts` (cycle tactile, `cycleAnchorPx`), `selection-set.ts`,
`PlanSceneLayer.tsx`, `ResolvedModelViewport.tsx`, `AtelierViewportPreviewWorkspace.tsx`,
`intersections-integration.test.ts`.

**Côté tracé libre** — intégral : schéma v4, `freeGeometry`, `FREE_GEOMETRY_VERSION`,
exclusivité `modelId` XOR `freeGeometry`, modes `parametric`/`free`/`undecided`, point /
segment / polyligne, aperçu, accrochage appliqué, poignées classe C, glissement de sommet,
suppression simple et multiple, undo/redo (profondeur 100), autosave, persistance IndexedDB,
exports, report, mobile.

## 6. Ce qui n'a pas été repris de `b0c55e8`, et pourquoi

`multiselect-integration.test.ts` (V1) n'existe pas dans R2. Comparaison cas par cas : R2 le
couvre par `selection-set.test.ts`, `selection-cycle.test.ts` et la section multisélection de
`intersections-integration.test.ts` — **sauf** six cas, dont trois portent sur des contrats
que R2 a délibérément remplacés :

| Cas V1 | Sort |
|---|---|
| Maj+clic manqué préserve la sélection | **repris**, reformulé sur la règle R2 |
| entités listées dans l'ordre de sélection | **repris** |
| résumé vide sans exception | **repris** (R2 rend `null`, pas un résumé vide) |
| cumul des longueurs | **écarté** — R2 supprime la somme (« ni somme, ni moyenne, ni plage ») |
| aucune longueur cumulée si une entité n'en a pas | **écarté** — même raison |
| rôle commun seulement si toutes le partagent | **écarté** — `roles` est l'union en R2, l'intersection vit dans `commonRows` |

Les trois écartés auraient **contredit** le canon, pas protégé une couverture.

## 7. Nouveau : `free-drawing-intersections-r2.test.ts`

Ce qu'aucune des deux lignées ne pouvait vérifier — les primitives libres dans le moteur R2 :

- deux segments libres qui se croisent publient leur intersection ;
- les **arêtes** d'une polyligne libre croisent les segments (`poly-1#0`, `poly-1#1`) ;
- la jonction de deux arêtes consécutives ne produit qu'**un** accrochage (fusionnée en
  extrémité par §5 — vérifié pour qu'un futur lot ne « corrige » pas l'index en cassant le
  dédoublonnage) ;
- l'index de scène est mémorisé (WeakMap) sur une scène libre comme paramétrique ;
- accrochage intersection / extrémité / milieu / point / grille sur géométrie libre ;
- `hitTestAll` déterministe, cycle, Maj+clic, synthèse multi sans métré inventé ;
- performance : treillis 100 points + 100 segments + polyligne 100 sommets (~2 500
  croisements) sous 1,5 ms ; pire cas de 100 segments concourants sous une trame.

## 8. Vérifications

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit` | OK |
| `eslint` | OK |
| `vitest run` | **1 455 / 1 455**, 138 fichiers (3 exécutions consécutives) |
| `next build --webpack` | OK, 45 pages |
| `build:native` | OK, 45 pages |

Comptes : R2 seul 1 329 (130 fichiers) → réconcilié 1 455 (138). Delta +126 = 99 (tracé libre)
+ 27 (suite de réconciliation). Aucune couverture R2 perdue.

Recette navigateur (`/atelier-free-preview`, dev webpack) :

- **1440, interactif** : point, segment, polyligne (dont bouton « Terminer la polyligne »),
  accrochage grille (0,002 px d'un nœud), accrochage extrémité (clic à ~3 px → **0,000 px** de
  l'extrémité), accrochage intersection (point créé à **0,00 px** du croisement calculé de deux
  segments **libres**), marqueur `snapIntersection` rendu sur scène 100 % libre, glissement de
  sommet classe C (développé 8 900 → 9 370,4 mm, annulation exacte), cycle au croisement
  (A → B → A), Maj+clic ajout/retrait, **Maj+clic à vide préserve**, suppression multiple
  (4 → 2 primitives), undo/redo.
- **375 / 430 / 768 / 1440, structurel** : aucun débordement horizontal, 11 outils présents,
  canevas dans la largeur, émulation tactile active à 375/430 (5 points, UA Android).

## 9. Réserves

- **DXF, point isolé** : `shapeGeometryToDxf` n'émet aucune entité pour un point isolé (il n'en
  émettait pas davantage pour les points nommés d'un modèle). Un point libre sort en SVG, PNG,
  PDF et dans le report, pas en DXF. Limitation **antérieure**, toujours vraie, documentée dans
  `ATELIER_FREE_DRAWING_V1.md` — non corrigée ici, hors périmètre.
- **Cible tactile minimale 38 px** sur les boutons d'outil à toutes les largeurs (repère iOS :
  44 px). Constat de la recette, antérieur à ce lot, non traité ici.
- **Recette 375/430/768 non interactive** : le volet navigateur a été replié en cours de
  session ; les actions dépendant du rendu (survol, glissement, défilement) ne pouvaient plus
  aboutir. Ces largeurs sont vérifiées structurellement ; le comportement tactile reste couvert
  par les tests (`TOUCH_CYCLE_ANCHOR_PX`, `cycleAnchorPx("coarse")`).

## 10. Périmètre

- Engine B : **non touché**.
- Supabase / migrations / Production : **aucun accès, aucune migration**. Le schéma v4 est
  IndexedDB uniquement.
- Nouveau canon Atelier : `integration/tools-free-drawing-r2-reconciliation-v1`.
- `b0c55e8` et `2c8e1a7` : **plus nécessaires** — tout leur contenu utile est ici.
