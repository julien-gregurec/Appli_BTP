# ELSATIA Tools — Tracés & Géométrie — Audit d'intégration (V1, pré-intégration)

> Agent 4 / Intégration-Recette. Rapport produit **avant toute modification** (règle §1).
> Date : 2026-09-05. Working dir : `feature/tools-production-workflow`.
> **Statut : AUDIT UNIQUEMENT — aucune fusion effectuée. Voir §H (GO/NO-GO).**

---

## A. Cartographie réelle des travaux

### A.1 Ce que le prompt suppose vs. la réalité du dépôt

Le prompt décrit 3 conversations parallèles produisant 3 branches distinctes susceptibles
de se chevaucher/entrer en conflit. La réalité est différente :

| # | Périmètre attendu | État réel |
|---|---|---|
| Conv 1 | Tracés, familles décoratives, bibliothèque de modèles, UX atelier | **Livré et commité** (Engine A). 8 modèles paramétriques + renderer + pas‑à‑pas + route preview interne. |
| Conv 2 | Moteur géométrique, primitives, arcs, intersections, transformations | **Dédoublé** : une partie commitée (extensions de `primitives.ts`), une partie **non commitée** (`geometry/engine/` = « Engine B », réécriture complète). |
| Conv 3 | Import photo, calibration, exports PDF/SVG/DXF, gabarits 1:1, mosaïque, métrés, LED | **Squelette non commité uniquement** : `lib/tracing/` (3 fichiers). Aucun export, aucun PDF, aucun gabarit. |
| Agent 4 | Intégration / audit / recette | Ce document. |

### A.2 Branches Git

`merge-base` commun à tout : `4d92ddb`.

| Branche | HEAD | Contenu propre | Origin |
|---|---|---|---|
| `feat/tools-traces-geometry-engine-foundation-v1` | `c7506b3` | Commit 1 (fondation moteur) | oui |
| `feat/tools-traces-geometry-first-functional-lot-v1` | `1a0bb93` | Commits 1→2 (3 modèles + UI) | oui |
| `feat/tools-traces-geometry-fundamental-models-v1` | `ac1c1ec` | Commits 1→3 (8 modèles) | oui |
| `feat/tools-traces-geometry-decorative-families-v1` | `ac1c1ec` | **Identique à `fundamental-models`** (`git diff` vide) | **non (ref locale orpheline)** |
| `feature/tools-production-workflow` *(courant)* | — | R9/R10 monétisation (ancien), **ne contient pas** la pile géométrie | oui |

**Les 3 commits géométrie forment une pile linéaire** (14:26 → 14:51 → 15:15, même journée,
même auteur, tous poussés) :

```
c7506b3  feat(tools): add geometry engine foundation for trace models
1a0bb93  feat(tools): add first functional trace geometry models
ac1c1ec  feat(tools): add fundamental parametric trace models
```

→ **Aucun conflit Git entre ces branches** : ce sont des sur-ensembles successifs.
→ `feat/tools-traces-geometry-decorative-families-v1` est un doublon strict à supprimer ou repointer.

### A.3 Travail non commité présent dans le working tree (ni indexé, ni sur une branche)

```
apps/tools/src/lib/geometry/engine/     angles.ts area.ts circle-tools.ts intersections.ts
                                        measure.ts model.ts polygons.ts stars.ts transform.ts
                                        types.ts validate.ts            (11 fichiers, ~1100 l., 0 test)
apps/tools/src/lib/tracing/             geometry-port.ts measurement-origin.ts reference-image.ts
```

- **Non wiré** : aucune route, aucun composant, aucun `catalog.ts` n'importe `geometry/engine/*`
  (seul `tracing/geometry-port.ts` le fait, lui-même non wiré).
- **Zéro test** dans `engine/` et `tracing/`.
- `tracing/reference-image.ts` déclare explicitement que le décodage image / `<canvas>` /
  warp de perspective « restent à la couche interface » → **incomplet par conception**.
- Également non lié : suppression working-tree de `output/video/Liria_Gestion_Pro_Guide_Video_Complet.mp4`
  (56 Mo) — relève de l'ops, **hors périmètre intégration**.

---

## B. Inventaire par lot

### B.1 Engine A — commité (`c7506b3` → `ac1c1ec`)

**Créés**
- `lib/geometry/transforms.ts` — `scale`, `reflect`, `repeatRadial` (point-wise, sur types existants).
- `lib/geometry/trace-model.ts` — `TraceModel = ShapeGeometry & {...}`, `TraceParameter`,
  `TraceExplanation`, `TraceStatus`, `validateTraceModel()` (enveloppe `validateShapeGeometry`).
- `lib/geometry/trace-render.ts` — logique pure de visibilité/navigation par étape (sans DOM).
- `lib/geometry/models/` — `index.ts` (registre lazy `import()` par slug) + 8 modèles :
  `circle-division`, `star`, `rosette`, `heart`, `arch-full-round`, `ogive`,
  `ellipse-pedagogical`, `spiral` (+ 8 `*.test.ts`).
- `components/` — `TraceViewer.tsx` (SVG générique, 6 calques, zoom/pan), `TraceSteps.tsx`,
  `SiteMode.tsx`, `TraceParametersForm.tsx`, `TracesPreviewWorkspace.tsx`.
- `app/outils/traces-preview/page.tsx` — route **interne**, `robots:{index:false}`, absente
  de `catalog.ts` / `sitemap.ts`, **aucun lien de navigation** (vérifié).

**Modifiés (strictement additif, comportement inchangé)**
- `primitives.ts` — types `Line/Ray/Polyline/Polygon`, `divideCircle()`, `Point.role += "center"`,
  `Dimension.kind += "aligned"|"annotation"`, `EPSILON` exporté.
- `shape-model.ts` — `ShapeGeometry.polylines?/polygons?`, `SiteStep.visibleEntityIds?/highlightEntityIds?`,
  `ShapeLayer += "centers"`.
- `plan-model.ts` — `createPolygonPath` / `createPolylinePath`.

**Dépendances** : aucune ajoutée. **DSL/eval** : aucun. **Supabase/migration** : rien.
**QA revendiquée par les commits** : 234/234 tests `apps/tools`, typecheck/lint/build OK,
26 routes outils commerciales inchangées + 1 route preview interne. *(À revérifier au moment de l'intégration.)*

### B.2 Engine B — non commité (`geometry/engine/`)

Réimplémentation autonome, sans DOM, unité canonique mm :
- `types.ts` — `Point2D`, `Vector2D`, `Line2D`, `Segment2D`, `Circle2D`, `Arc2D`, `Ellipse2D`,
  `Polyline2D`, `Polygon2D`, `Transform2D` (matrice affine), `Angle`, `MeasuredValue{quality:"exact"|"approximated"}`.
- `measure.ts` — distances, projections, bissectrices, médiatrices, longueurs (segment/polyligne/arc/cercle),
  `totalLength` hétérogène, bounding boxes.
- `intersections.ts` — line/line, seg/seg, line/circle, seg/circle, circle/circle **+ variantes arc**
  (arc/line, arc/seg, arc/circle, arc/arc) — plus riche qu'Engine A.
- `transform.ts` — transformations **affines composables** (`compose`, `composeAll`,
  `rotationAround`, `scaleAround`, `mirrorAxis`, …).
- `circle-tools.ts` — `circleFromThreePoints`, `tangentPointsFromExternal`, `cardinalPoints`,
  `pointsOnCircle`, `divideCircle`, `divideSegment`.
- `area.ts` — aire cercle/ellipse/polygone (lacet), secteur, segment circulaire. *(absent d'Engine A)*
- `model.ts` — `ParametricShape`, `ShapePrimitives`, `ConstructionStep`, **registre `Map` +
  `registerShapeGenerator` / `buildParametricShape`**, **`serializeShape` / `deserializeShape`
  (recalcul depuis type+paramètres, jamais un cache de points)**. *(sérialisation absente d'Engine A)*
- `validate.ts` — `validateGeometry` : non-finis, rayon ≤ 0, **points confondus**, **hors bounding box**,
  **auto-intersection** polygone/polyligne, offset impossible. Plus complet qu'Engine A.
- `polygons.ts` / `stars.ts` — générateurs `ParametricShape` (polygone régulier, étoile N branches).

### B.3 Conv 3 — non commité (`lib/tracing/`)

- `geometry-port.ts` — **adaptateur unique** vers `geometry/engine/*` (bonne intention anti-doublon,
  §34) + `perpendicularDistance`, `simplifyPolyline` (Douglas–Peucker itératif).
- `measurement-origin.ts` — `MeasurementOrigin` (`exact>manual>calibrated>imported>approximated`),
  `combineOrigins` (maillon faible), `originWarning` (§28 : jamais de mesure inventée).
- `reference-image.ts` — formats acceptés, `detectFormat`, redressement (pixels), **calibration
  `pixelsToMillimetres` qui lève tant que l'échelle n'est pas définie** (§4/§16). Décodage/canvas
  non fait. Utilise `lib/units.ts` (partagé — pas de doublon d'unités ✅).

---

## C. Doublons & source de vérité

### C.1 Matrice des doublons (Engine A commité ↔ Engine B non commité)

| Responsabilité | Engine A (`primitives.ts`, `shape-model.ts`, `transforms.ts`) | Engine B (`geometry/engine/`) |
|---|---|---|
| Point | `Point {id,x,y,label?,role?}` | `Point2D {x,y}` (immuable, sans id) |
| Vector / Segment / Circle / Arc / Ellipse / Line / Ray / Polyline / Polygon | `primitives.ts` | `engine/types.ts` |
| distance / midpoint / polar / rotate / angleBetween | `primitives.ts` | `engine/measure.ts` |
| Intersections | line/line, line/circle, circle/circle, tangentes | idem **+ seg/seg + toutes variantes arc** |
| Transformations | `scale` / `reflect` / `repeatRadial` (point à point) | **matrices affines** `Transform2D` composables |
| `divideCircle` | `(centre, radius, count, start, prefix)` → `Point[]` avec id | `(Circle2D, parts, start)` → `Point2D[]` sans id |
| arcLength / chordLength / sagitta / bounds | `primitives.ts` | `engine/measure.ts` |
| Aires | — | `engine/area.ts` |
| Modèle forme / projet | `ShapeGeometry` + `TraceModel` | `ParametricShape` + `ShapePrimitives` |
| Registre de modèles | `models/index.ts` (`import()` lazy par slug) | `engine/model.ts` (`Map` + `registerShapeGenerator`) |
| Sérialisation projet | — (recréé en appelant `create*Geometry`) | **`serializeShape` / `deserializeShape`** |
| Validation géométrie | `validateShapeGeometry` + `validateTraceModel` | `validateGeometry` (auto-intersection, hors-bounds, points confondus…) |
| Générateurs étoile / polygone | `models/star.ts` (→ `TraceModel`) | `engine/stars.ts` + `engine/polygons.ts` (→ `ParametricShape`) |
| Unités mm↔cm↔m↔in | `lib/units.ts` | `lib/units.ts` **(partagé — OK ✅)** |
| Fiabilité mesure | `Quantity.quality:"exact"|"estimate"` ; `RealisticPreviewMetadata` | `MeasuredValue.quality:"exact"|"approximated"` + `tracing/measurement-origin.ts` |

### C.2 Incohérences de nommage (§47)

- Enum qualité : `"exact"|"estimate"` (Engine A `Quantity`) vs `"exact"|"approximated"`
  (Engine B `MeasuredValue`) vs `MeasurementOrigin` à 5 niveaux (`tracing/`). **À unifier.**
- `Point` (avec identité de rendu) vs `Point2D` (valeur pure). Convention à trancher et documenter.
- `models.ts` (décoratif hérité, consommé par `AdvancedPlan.tsx`) coexiste avec `models/index.ts`
  (nouveau registre) → paire ambiguë, renommer l'hérité (`decorative-plan-models.ts`).

### C.3 Ce qui n'est PAS en doublon (bon signe)

- `lib/units.ts` : source unique, réutilisée des deux côtés.
- Aucun 2ᵉ `Point2D`/`Circle` ailleurs dans le repo (`git grep` — hors les deux moteurs ci-dessus).
- Les 8 modèles Engine A sont **réellement paramétriques** : ils consomment
  `circleCircleIntersections`, `divideCircle`, `tangentPoints`, `createAdvancedArch`, `boundsFromPoints`…
  — pas de SVG codé à la main, pas de coordonnées figées, explications FR chantier réelles,
  `quality:"exact"` là où c'est mathématiquement exact (§10, §22, §23 : conformes).
- Aucun contenu tiers (image/logo/watermark) détecté dans les assets/seed/modèles (§45).

---

## D. Conflits & risques d'intégration

| # | Nature | Gravité | Détail |
|---|---|---|---|
| D1 | **Deux moteurs géométriques concurrents** | 🔴 bloquant | Engine A (commité, testé, wiré) vs Engine B (non commité, 0 test, non wiré). Impossible de livrer les deux. Décision de SoT requise **avant** d'empiler du code Conv 3 dessus. |
| D2 | Conv 3 bâtit sur Engine B | 🔴 bloquant | `tracing/*` importe `geometry/engine/*`. Si Engine A est retenu, tout `tracing/` est à réécrire ; si Engine B est retenu, les 8 modèles + renderer + tests Engine A sont à porter. |
| D3 | Périmètre Conv 3 inexistant | 🔴 bloquant recette | §15–§25 (import, calibration, PDF, gabarit 1:1, mosaïque, SVG, DXF, métrés, LED) : **rien de livré**. Rien à recetter. |
| D4 | Travail non commité | 🟠 | Engine B + `tracing/` vivent dans un working tree sale, sur aucune branche. Toute intégration doit d'abord les faire commiter par Conv 2 / Conv 3. |
| D5 | `decorative-families-v1` = doublon de `fundamental-models-v1` | 🟡 | Ref locale orpheline, sans origin. Supprimer ou repointer. |
| D6 | Enum `quality` divergents | 🟡 | 3 vocabulaires de fiabilité. Unifier avant recette (§32/§49). |
| D7 | Engine B sans tests | 🟠 | ~1100 lignes de maths sans filet. `serializeShape`, `validateGeometry`, intersections d'arcs non couverts. |
| D8 | `models.ts` vs `models/index.ts` | 🟡 | Nommage ambigu (§46/§47). |

**Aucun conflit textuel Git** entre les branches poussées (pile linéaire).

---

## E. Stratégie d'intégration recommandée

### E.1 Préalables (à demander aux 3 conversations)

1. **Conv 2** : commiter Engine B sur sa branche + trancher : Engine B remplace-t-il Engine A,
   ou complète-t-il ? Ajouter les tests manquants.
2. **Conv 3** : commiter `tracing/` sur sa branche ; livrer au minimum
   **import + calibration + export PDF gabarit 1:1** (cœur de recette §16/§18).
3. Supprimer `feat/tools-traces-geometry-decorative-families-v1` (doublon).

### E.2 Décision de source de vérité géométrique (D1) — recommandation

Le prompt (§5) désigne « le moteur de la Conversation 2 » comme SoT. Deux lectures possibles :

- **Option A — promouvoir Engine B.** Plus propre (valeur immuable, transformations affines,
  sérialisation depuis paramètres, validation auto-intersection/hors-bounds, aires). *Coût* :
  réécrire les 8 modèles + `TraceViewer`/`TraceSteps`/`SiteMode` + 234 tests sur Engine B ;
  supprimer les ajouts trace de `primitives.ts`/`transforms.ts`. *Risque* : régression sur du
  code déjà testé et validé en navigateur.
- **Option B — garder Engine A comme SoT, absorber le meilleur d'Engine B.** Engine A est ce
  qui tourne (234 tests, UI wirée, 26 routes intactes). *Action* : réintégrer dans Engine A,
  en modules additifs, uniquement les apports réels d'Engine B — `Transform2D` affine,
  `serializeShape`/`deserializeShape`, `validateGeometry` (auto-intersection, hors-bounds,
  points confondus), `area.ts`, intersections d'arcs — puis Conv 3 branche `tracing/` sur
  Engine A via `geometry-port.ts`.

> **Recommandation : Option B** pour la cible commercialisable (§54).
> Motif : §54 exige build+typecheck+tests verts, parcours principal fonctionnel, **moteur unique**,
> aucune régression majeure. L'Option A réinjecte un risque important sur du code déjà recetté
> pour une préférence d'architecture ; l'Option B atteint « commercialisable » plus vite et
> converge quand même sur **un seul** moteur. Engine B devient la feuille de route d'évolution
> du moteur unique, pas un 2ᵉ moteur.

### E.3 Séquence (une fois les préalables levés)

1. Créer `integration/tools-tracing-v1` depuis la pile géométrie (`ac1c1ec`).
2. Commit « intégration » : moteur unique retenu (Option B), `geometry-port.ts` pointant dessus.
3. Commit « doublons » : suppression Engine B redondant, `models.ts` → `decorative-plan-models.ts`,
   enum `quality` unifié.
4. Commit « Conv 3 » : import + calibration + exports rebranchés sur le moteur unique.
5. Commit « tests » : couverture géométrie / conversion d'unités / sérialisation / calibration /
   pagination PDF / marges / gabarit 1:1.
6. Commit « corrections » : erreurs build/typecheck/lint résiduelles.
7. Recette §50 (scénarios A/B/C) → rapport final §51.

---

## F. Tests effectués dans cet audit

- Cartographie des 5 branches, `merge-base`, équivalence `decorative-families` ≡ `fundamental-models`.
- Lecture intégrale des 3 commits géométrie (messages + diffs de fichiers).
- Lecture d'Engine A : `primitives.ts`, `shape-model.ts`, `trace-model.ts`, `trace-render.ts`,
  `transforms.ts`, `models/index.ts`, `models/rosette.ts`, route preview.
- Lecture d'Engine B : `types.ts`, `measure.ts`, `intersections.ts`, `transform.ts`, `angles.ts`,
  `area.ts`, `circle-tools.ts`, `model.ts`, `validate.ts`, `stars.ts`, `polygons.ts`.
- Lecture Conv 3 : `geometry-port.ts`, `measurement-origin.ts`, `reference-image.ts`.
- `git grep` doublons de types géométriques hors des deux moteurs → néant.
- Dépendances : aucune ajoutée par la pile géométrie (`jspdf` déjà présent). Licences : rien de neuf.
- **Non exécuté** (délibérément, §55 — travaux en cours) : build/typecheck/tests réels, recette navigateur.

---

## G. Risques restants

- Engine B / `tracing/` peuvent ne pas typechecker une fois commités (jamais compilés wirés).
- Le choix de SoT non tranché par Conv 2 peut invalider une partie de `tracing/`.
- Périmètre export/gabarit/mosaïque/DXF entièrement à faire → planning recette non prévisible ici.
- `divideCircle` a deux signatures incompatibles selon le moteur : tout code appelant devra être audité.

---

## H. GO / NO-GO pour la recette utilisateur

### 🔴 NO-GO — la recette utilisateur ne peut pas démarrer.

Bloquants :
1. **Deux moteurs géométriques concurrents**, dont un (Engine B) non commité et non testé — §54
   « moteur géométrique unique » non satisfait.
2. **Tout le périmètre Conversation 3** (import photo, calibration UI, PDF, gabarit 1:1, mosaïque
   A4/A3, SVG, DXF, métrés, LED) — soit §15 à §25 de la recette — **n'existe pas**.
3. **Aucune branche d'intégration** ; travaux clés dans un working tree non commité.
4. Engine B : **0 test**.

Ce qui est déjà solide (réutilisable tel quel à l'intégration) :
- Engine A : 8 modèles réellement paramétriques, renderer 6 calques, pas‑à‑pas piloté par la
  géométrie, route preview correctement masquée (noindex, hors catalogue/sitemap, sans lien).
- `lib/units.ts` : source d'unités unique et partagée.
- Aucun contenu tiers, aucune dépendance douteuse, aucun DSL/eval, aucune migration touchée.

**Prochain jalon d'intégration réaliste** : après que Conv 2 a commité un moteur unique retenu
et que Conv 3 a commité au minimum import + calibration + export PDF 1:1. Créer alors
`integration/tools-tracing-v1` et dérouler §E.3.
