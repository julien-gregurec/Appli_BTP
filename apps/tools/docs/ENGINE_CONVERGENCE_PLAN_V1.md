# ELSATIA Tools — Plan de convergence Engine A / Engine B (V1)

> **Document d'analyse uniquement. Aucun code modifié, aucun fichier déplacé/renommé, aucun
> commit, aucun merge.** Périmètre audité : la branche d'intégration `integration/tools-tracing-v1`
> (worktree `.worktrees/tools-tracing-integration`, HEAD `1a39b47`), qui contient réellement les
> deux moteurs côte à côte, plus le HEAD courant de `feature/tools-production-workflow`
> (`7b18d9b`, worktree principal) pour vérifier l'état committé indépendant de chaque lot.
> Toutes les affirmations ci-dessous ont été vérifiées directement dans le code (lecture de
> fichiers, `git diff`, `grep`, et un test empirique de compilation — voir §0.3), pas seulement
> reprises des documents d'audit déjà présents dans le dépôt (`docs/audits/ELSATIA_TOOLS_TRACES_INTEGRATION_AUDIT_V1.md`,
> `docs/tracing-integration-v1.md`, `docs/audits/ELSATIA_TOOLS_TRACING_INTEGRATION_V2.md`),
> qui sont traités comme des sources d'information à corroborer, pas comme une vérité acquise.

---

## 0. Constats préalables (contexte vérifié)

**0.1 — Trois lots ont été fusionnés dans `integration/tools-tracing-v1`**, sans conflit
textuel : Lot 2 (Engine B, `09adfed`) → Lot 3 (production workflow, `7b18d9b`) → Lot 1
(bibliothèque décorative Engine A étendu, `0b409cc`), tous depuis la base commune `996be15`.

**0.2 — Les deux moteurs ne s'importent jamais l'un l'autre** (vérifié par `grep` exhaustif :
zéro import croisé). `lib/tracing/` et `lib/chantier/` importent Engine B **exclusivement** via
l'adaptateur unique `lib/tracing/geometry-port.ts`, à l'exception de deux imports **type-only**
d'Engine A à la frontière export (`Quantity` dans `chantier/nomenclature.ts`, `ShapeGeometry`
dans `exports/dxf.ts`).

**0.3 — Fait vérifié empiriquement, absent des audits précédents** : sur le HEAD isolé de
`feature/tools-production-workflow` (avant fusion avec le Lot 2), `geometry-port.ts` importe
`../geometry/engine/*`, qui **n'existe pas** dans l'arbre committé de cette branche seule. Un
checkout propre de cette branche isolée échoue au typecheck (`TS2307: Cannot find module
'../geometry/engine/types'`, 7 occurrences) — vérifié en créant un worktree jetable détaché sur
ce HEAD, sans le dossier `engine/` non suivi, puis supprimé après test. **Ce n'est plus un
problème aujourd'hui** : la fusion du Lot 2 dans `integration/tools-tracing-v1` fournit le
fichier manquant et le typecheck y est vert (0 erreur, confirmé). Le signale ici uniquement
parce que c'est la preuve concrète que les trois lots ne sont **pas indépendamment livrables** —
Conv 3 dépend structurellement de Conv 2, un point à retenir pour toute future séparation de
branches.

**0.4 — Une duplication réelle, non signalée par les deux audits précédents, a été trouvée** :
`chantier/report-table.ts` réimplémente à la main (via `distance`/`polarAngle` importés
d'Engine B par `geometry-port`) exactement ce que fait déjà `engine/report.ts`
(`buildReportPointsTable`/`getReportPoints`), sans appeler ces fonctions. Voir concept 19.

---

## 1. Cartographie Engine A (`apps/tools/src/lib/geometry/` hors `engine/`)

| Fichier | Rôle | Statut |
|---|---|---|
| `primitives.ts` | `Point{id,x,y,label?,role?}`, `Vector`, `Segment`, `Circle`, `Arc`, `Ellipse`, `Axis`, `Line`, `Ray`, `Polyline`, `Polygon`, `BoundingBox`, `Dimension` ; distance/milieu/projection/rotation/polaire/angle/intersections ligne-ligne/ligne-cercle/cercle-cercle/tangentes/`divideCircle`/longueurs/`boundsFromPoints`. `EPSILON` exporté. | **Recetté**, consommé par les 26 outils Pro commerciaux. |
| `shape-model.ts` | `ShapeGeometry` (le modèle exportable complet), `Quantity{quality:"exact"|"estimate"}`, `SiteControl`, `SiteStep{…,visibleEntityIds?,highlightEntityIds?}`, `ShapeLayer`, `validateShapeGeometry` (fail-fast, lève une exception). | **Recetté**. |
| `shapes.ts` | Générateurs métier historiques : arche avancée, cercle/ellipse en pièce, couronne, motif radial 4/5/6/8, niche cintrée. Fonctions nommées `create<X>` retournant un `ShapeGeometry`, appelées directement (pas de registre). | **Recetté**, consommé par `ProCalculatorWorkspace.tsx`. |
| `plan-model.ts` | Projection mm → SVG (`createPlanTransform`, `createArcPath`, `createPolylinePath`, `createPolygonPath` — ces deux derniers ajoutés par le Lot 1). Seul point de conversion pixel du dépôt. | **Recetté** + extension additive. |
| `models.ts` | Modèles géométriques **historiques** des outils Free (`createCircleGeometry`, `createSegmentalArchGeometry`) consommés par `diagram-model.ts`/`ToolDiagram.tsx`. Nom proche de `models/` (registre décoratif) → ambiguïté déjà identifiée par les deux audits précédents, jamais corrigée. | **Recetté**, sans rapport fonctionnel avec `models/`. |
| `diagram-model.ts` | Projette `models.ts` vers des primitives d'annotation SVG pour les outils Free. | **Recetté**. |
| `trace-model.ts` *(Lot 1)* | `TraceModel = ShapeGeometry & {slug,categoryId,difficulty,tags,parameters,status,explanation?,realisticPreview?}`, `TraceParameter`, `validateTraceModel` (enveloppe `validateShapeGeometry` + contrôle des paramètres). | Nouveau, additif, **non consommé par l'UI commerciale**. |
| `trace-render.ts` *(Lot 1)* | Logique pure de navigation/visibilité par étape (`isEntityVisibleAtStep`, `clampStepIndex`, `stepProgress`…), sans DOM. | Nouveau, additif. |
| `transforms.ts` *(Lot 1)* | `scale`, `reflect`, `repeatRadial` — transformations **point-à-point**, retournent un nouveau `Point` (id conservé), consomment `primitives.ts`. | Nouveau, additif. |
| `models/` *(13 fichiers + `index.ts`, Lot 1)* | `circle-division`, `star`, `rosette`, `heart`, `arch-full-round`, `ogive`, `ellipse-pedagogical`, `spiral`, `flower4`, `flower5`, `flower6-elongated`, `turbine`, `double-s`. Chacun exporte `create<Nom>Geometry(params) → TraceModel`, **nom de fonction propre à chaque module** (pas d'interface commune). `models/index.ts` : registre `Record<string, () => Promise<Module>>` par slug, import paresseux, **jamais invoqué génériquement** (chaque consommateur importe et appelle la fonction nommée dont il a besoin). | Nouveau, additif, **preview interne uniquement** (`/outils/traces-preview`, `robots:{index:false}`, absent de `catalog.ts`/sitemap). |
| Composants `TraceViewer`/`TraceSteps`/`SiteMode`/`TraceParametersForm`/`TracesPreviewWorkspace` | Renderer SVG générique (6 calques, zoom/pan), navigation pas-à-pas, formulaire de paramètres. | Nouveau, additif, preview interne. |

**Consommateurs d'Engine A** : `AdvancedPlan.tsx`, `ToolDiagram.tsx`, `ProCalculatorWorkspace.tsx`,
`CalculatorWorkspace.tsx` (26 routes `/outils/[id]` commerciales) + `TraceViewer.tsx` et la route
interne `/outils/traces-preview` (13 modèles preview).

---

## 2. Cartographie Engine B (`apps/tools/src/lib/geometry/engine/`)

| Domaine | Fichiers | Rôle |
|---|---|---|
| Types | `types.ts` | `Point2D`, `Vector2D`, `Line2D`, `Segment2D`, `Circle2D`, `Arc2D`, `Ellipse2D`, `Polyline2D{points,closed?}`, `Polygon2D`, `BoundingBox2D`, `Transform2D` (matrice affine 2×3), `Dimensions2D`, `MeasuredValue{quality:"exact"|"approximated"}`. Tous des types **valeur pure**, sans identité (`id`). |
| Calcul | `angles.ts`, `transform.ts` (affine composable : `compose`, `composeAll`, `rotationAround`, `scaleAround`, `mirrorAxis`…), `measure.ts`, `area.ts`, `intersections.ts` (8 couples, incluant les 4 combinaisons arc absentes d'A), `circle-tools.ts`, `geometry-ops.ts` (`transformGeometry` générique + recalcul de bounding box). | Pur, testable, sans DOM. |
| Atelier | `offset.ts` (avec détection d'auto-intersection **et** de franchissement du centroïde), `simplify.ts` (Douglas-Peucker + ajustement d'arc glouton, avec erreur mesurée), `snap.ts`, `constraints.ts` (fondations, pas un solveur), `dimensions.ts`, `report.ts`. | **Fonctionnalités inexistantes côté A.** |
| Modèle | `model.ts` — `ParametricShape<T>{id,type,parameters,primitives,boundingBox,centre,width,height,rotation,metadata,constructionSteps,quality,errorTolerance?}`, `ShapeGenerator<T> = (params:T) => ParametricShape<T>` (**interface commune**), registre `Map` + `registerShapeGenerator`/`buildParametricShape` (invocation générique immédiate), `serializeShape`/`deserializeShape` (recalcul depuis `type`+`parameters`, **jamais un cache de points**). | **Fonctionnalités inexistantes côté A** (pas d'interface de générateur commune, pas de sérialisation). |
| Générateurs | `basic-shapes.ts`, `polygons.ts`, `stars.ts`, `arches.ts` (4 types dont l'arche à 4 centres), `radial-pattern.ts` (générique, tout élément), `petals.ts`, `rosettes.ts`, `spirals.ts` (math vs chantier), `curves.ts` (S/8/cercles reliés), `hearts.ts`. | Tous via l'interface `ShapeGenerator`. |
| API | `api.ts` — `offsetShape`, `scaleShape`, `rotateShape`, `calculateLength`, `calculateArea`, `generateConstructionSteps` (opèrent sur une `ParametricShape` entière). | — |
| Validation | `validate.ts` — `validateGeometry(shape) → GeometryValidationError[]` : **collecte toutes les erreurs, ne lève jamais** (contrat différent d'A). Couvre en plus l'auto-intersection, le hors-bounding-box, l'offset impossible. | Contrat différent d'A (§ concept 18). |

**Consommateurs d'Engine B aujourd'hui** : `lib/tracing/*` et `lib/chantier/*` (via
`geometry-port.ts`, calcul pur, **aucun rendu visuel**). **Zéro** composant React ne consomme B
directement — c'est la lacune la plus significative (§ concept 25).

---

## 3. Duplications réelles

| # | Duplication | Gravité | Détail |
|---|---|---|---|
| DUP-1 | Types géométriques parallèles (Point/Circle/Arc/Ellipse/Segment/Polyline/Polygon/BoundingBox/Vector) | 🟡 faible en pratique | **Structurellement compatibles dans le sens A→B** (voir §4, note structurelle) — la duplication existe dans le code source mais pas dans les valeurs runtime. |
| DUP-2 | Transformations (`transforms.ts` point-à-point vs `transform.ts` matrices affines) | 🟠 moyenne | Deux paradigmes différents, pas juste deux implémentations de la même chose. |
| DUP-3 | Intersections ligne/cercle/cercle-cercle/tangentes | 🟠 moyenne | Formules identiques, **contrats de retour différents** (valeur nue vs `IntersectionResult{kind,points}`). |
| DUP-4 | Longueurs (`arcLength`/`chordLength`/`sagitta`) | 🟢 nulle en pratique | Formules mathématiquement identiques, signatures quasi identiques — duplication de code source pure, zéro divergence de valeur. |
| DUP-5 | Validation géométrique (`validateShapeGeometry`/`validateTraceModel` vs `validateGeometry`) | 🟠 moyenne | Contrats différents (exception vs collecte) **et** périmètres différents (B couvre l'auto-intersection, A non). |
| DUP-6 | Qualité de mesure (3 vocabulaires : `"exact"\|"estimate"`, `"exact"\|"approximated"`, `MeasurementOrigin` à 5 niveaux) | 🟡 cosmétique tant que chaque couche reste dans son moteur | Même concept, pas de contradiction de valeur. |
| DUP-7 | Générateur "étoile 5 branches" (`models/star.ts` → `TraceModel` vs `engine/stars.ts` → `ParametricShape`) | 🟠 moyenne | Même algorithme (2 cercles concentriques, sommets alternés), deux implémentations complètes, deux formats de sortie. Candidat naturel de pilote de migration (§6, Phase C3). |
| DUP-8 | **Table de report** (`chantier/report-table.ts` vs `engine/report.ts`) | 🔴 évitable immédiatement | Les deux calculent distance+angle depuis une origine à partir des **mêmes fonctions primitives de B** (`distance`, `polarAngle`), mais `chantier/report-table.ts` réimplémente la boucle au lieu d'appeler `buildReportPointsTable`. Corrigeable **sans attendre la convergence A/B** — c'est une duplication interne à B. |
| DUP-9 | `models.ts` (décoratif Free hérité) vs `models/` (registre 13 modèles) | 🟡 nommage seulement | Aucun rapport fonctionnel, juste un nom voisin trompeur. Renommage documenté depuis deux audits, jamais fait. |
| DUP-10 | `Ellipse`/`Ellipse2D` : aire absente côté A, présente côté B (`ellipseArea`) | 🟢 lacune, pas doublon | Les 8+13 modèles A qui ont besoin d'une aire d'ellipse la recalculent inline (`Math.PI * a * b`). |

---

## 4. Incompatibilités

**Note structurelle importante (réduit fortement le risque perçu de la convergence)** :
Engine A définit `Point{id,x,y,label?,role?}`, `Circle{id,centre:Point,radius,role?}`,
`Segment{id,start,end,role?}`, `Arc{id,centre,radius,startAngle,endAngle,counterClockwise?,role?}`,
`Ellipse{id,centre,radiusX,radiusY,rotation?,role?}` — chacun est un **sur-ensemble structurel**
du type Engine B correspondant (`Point2D`, `Circle2D`, `Segment2D`, `Arc2D`, `Ellipse2D`). En
TypeScript, une valeur d'un type plus riche est assignable là où le type plus pauvre est attendu
(hors vérification de propriété excédentaire, qui ne s'applique qu'aux littéraux). **Concrètement :
n'importe quelle fonction pure d'Engine B (`distance`, `circleArea`, `lineCircleIntersection`,
`offsetCircle`…) peut déjà être appelée aujourd'hui avec un `Point`/`Circle`/`Arc` d'Engine A,
sans aucune conversion, aucun adaptateur, aucun changement de fichier.** L'asymétrie inverse
existe : un `Point2D` de B ne peut pas être utilisé où un `Point` d'A est requis, car il lui
manque `id` (obligatoire côté A) — ceci définit la direction naturelle et à faible coût de tout
pont : **A → B est gratuit, B → A nécessite de fournir un id** (une opération génétarget, pas
juste un cast).

| # | Incompatibilité | Nature | Concepts touchés |
|---|---|---|---|
| INC-1 | Polyline : A n'a pas de notion de fermé/ouvert (toujours ouvert par convention écrite, `Polygon` sert de "fermé") ; B porte un flag `closed?:boolean` explicite sur le même type. | Sémantique | 8 |
| INC-2 | Transformations : A retourne un nouveau point nommé à chaque appel (perd toute notion de matrice réutilisable) ; B compose des matrices affines réutilisables puis les applique. Migrer une séquence de transformations d'A vers B change le modèle de calcul, pas seulement la syntaxe. | API/paradigme | 11 |
| INC-3 | Intersections : A a des signatures de retour hétérogènes par fonction (`Point\|null`, `Point[]`) ; B a un contrat uniforme `IntersectionResult{kind,points}`. | Contrat de retour | 13 |
| INC-4 | Validation : A **lève une exception** au premier problème (fail-fast) ; B **retourne un tableau** de toutes les erreurs (jamais d'exception). Les deux ont des périmètres de contrôle différents (B couvre l'auto-intersection, pas A). | Contrat d'appel | 18 |
| INC-5 | Construction steps : A référence des entités **déjà nommées** dans le modèle englobant par `pointIds`/`controlId` (jamais de géométrie ad hoc) ; B peut **embarquer** une géométrie non nommée directement dans l'étape (`{kind:"arc",arc:Arc2D}`), plus flexible mais pas rattachable tel quel à un `ShapeGeometry.points`. | Référence vs valeur | 17 |
| INC-6 | Dimensions : `Dimension` d'A porte un `id` (unicité vérifiée par `validateShapeGeometry`) et un `label` pré-formaté ; `DimensionResult` de B est un résultat de calcul brut, sans id ni label, pensé pour être mis en forme par l'appelant. | Modèle de données | 16 |
| INC-7 | Modèle paramétrique : A n'a **aucune interface de générateur commune** (13 noms de fonction distincts, appelés nommément) ; B a `ShapeGenerator<T>` uniforme + registre invocable génériquement. Rétro-fitter A nécessiterait de renommer/re-typer les 13 fonctions existantes. | Architecture | 24 |
| INC-8 | Registre : le registre d'A optimise le **chargement paresseux** (import dynamique par slug, bundle scindé) ; le registre de B optimise l'**invocation générique** mais charge tout en un seul module synchrone (`index.ts` importe tous les générateurs). Aucun des deux ne fait les deux à la fois. | Registre | 26 |
| INC-9 | Renderer : **B n'a aucun module de rendu.** Aucun chemin, direct ou adapté, n'existe aujourd'hui pour afficher une `ParametricShape` en SVG. | Lacune bloquante | 25 |

---

## 5. Matrice complète des 26 concepts

| Concept | Engine A | Engine B | Duplication | Incompatibilité | Source de vérité recommandée | Stratégie de migration |
|---|---|---|---|---|---|---|
| **Point** | `Point{id,x,y,label?,role?}` (`primitives.ts`) | `Point2D{x,y}` (`types.ts`) | Oui (type source) | Faible — A⊃structurellement B, asymétrique (voir §4) | `Point2D` pour le calcul pur ; `Point` reste le raffinement "point nommé" | Adaptateurs `asPoint2D` (identité) et `withId(id,p,label?,role?)`, sans toucher `primitives.ts` |
| **Vector** | `Vector{x,y}` | `Vector2D{x,y}` | Oui, totale et inoffensive (types identiques) | Aucune | `Vector2D` | Ré-export `export type Vector = Vector2D` dès Phase C1 |
| **Segment** | `Segment{id,start,end,role?}` | `Segment2D{start,end}` | Oui | Aucune (subtyping) | `Segment2D` | Adaptateur trivial, A→B gratuit |
| **Line** | `Line{id,point,direction,role?}` (Lot 1, non consommé par le rendu) | `Line2D{point,direction}` | Oui, quasi identique | Aucune | `Line2D` | `Line` d'A est un candidat direct de suppression (§9) une fois vérifié zéro consommateur |
| **Circle** | `Circle{id,centre,radius,role?}` | `Circle2D{centre,radius}` | Oui | Aucune (subtyping) | `Circle2D` | Les fonctions B (aire, intersections) sont **déjà appelables** sur un `Circle` d'A sans conversion |
| **Arc** | `Arc{id,centre,radius,startAngle,endAngle,counterClockwise?,role?}` | `Arc2D` (même champs, sans id/role) | Oui | Aucune (subtyping) | `Arc2D` pour le calcul (B couvre 4 combinaisons d'intersection en plus) | `Arc` d'A reste pour le rendu tant que le renderer n'est pas migré |
| **Ellipse** | `Ellipse{id,centre,radiusX,radiusY,rotation?,role?}` | `Ellipse2D` (idem sans id/role) | Oui | Aucune (subtyping) | `Ellipse2D` | `ellipseArea` de B comble une lacune d'A (aires calculées inline aujourd'hui) |
| **Polyline** | `Polyline{id,points,role?}`, toujours ouverte par convention | `Polyline2D{points,closed?}` | Oui | **Réelle** (INC-1 : fermeture explicite absente côté A) | `Polyline2D` | Adaptateur qui fixe `closed:false` pour toute `Polyline` d'A (sûr, car la convention A est "toujours ouvert") |
| **Polygon** | `Polygon{id,points,role?}`, fermeture implicite (dernier point non dupliqué) | `Polygon2D{points}`, même convention | Oui, mais compatible | Aucune (même convention de fermeture) | `Polygon2D` | Adaptateur trivial |
| **BoundingBox** | `BoundingBox{minX,minY,maxX,maxY}` | `BoundingBox2D` (identique) | Oui, totale | Aucune | `BoundingBox2D` | Ré-export direct dès Phase C1 |
| **Transformations** | `transforms.ts` : point-à-point (`scale`,`reflect`,`repeatRadial`), id conservé | `transform.ts` : matrices affines composables `Transform2D` | Oui | **Réelle** (INC-2, paradigme) | `Transform2D`/`transform.ts` | Adaptateur `applyToNamedPoint(t,source):Point` qui ré-injecte id/label/role après `applyTransform` |
| **Unités** | `lib/units.ts` | `lib/units.ts` (même fichier) | **Aucune** — déjà une source unique partagée | Aucune | `lib/units.ts` (déjà correct) | Aucune action — modèle à suivre pour le reste |
| **Intersections** | ligne/ligne, ligne/cercle, cercle/cercle, tangentes ; retours hétérogènes | 8 couples (+ seg/seg + 4 combinaisons arc) ; `IntersectionResult{kind,points}` uniforme | Oui | **Réelle** (INC-3, contrat de retour) | `IntersectionResult` (B) | Adaptateur qui déballe vers la forme historique d'A (`.points[0] ?? null`, `.points`) pour ne pas casser `shapes.ts` immédiatement |
| **Tangences** | `tangentPoints(external,circle)→Point[]` | `tangentPointsFromExternal(...)→Point2D[]`, même formule | Oui, totale | Aucune | `tangentPointsFromExternal` (B) | `tangentPoints` d'A devient un alias fin de B + réinjection d'id |
| **Offset** | **Absent** | `offset.ts` (segment/cercle/arc/polyligne, détection d'impossibilité) | Non — lacune comblée | — | B (unique implémentation) | Déjà consommé en production par `chantier/led.ts`/`margins.ts` via `geometry-port` — premier usage métier réel de B |
| **Dimensions** | `Dimension{id,kind,from,to,label,value,unit,offset?}`, intégré au `ShapeGeometry` rendu | `dimensions.ts` : `create*Dimension()→DimensionResult{kind,value,unit,anchors}`, sans id/label, non consommé par un renderer | Oui | **Réelle** (INC-6, modèle de données) | Garder séparés : B = calcul brut réutilisable, A = objet de rendu final | Adaptateur `toDimension(id,label,result)` pour afficher une cote B dans le renderer A actuel — gain rapide indépendant de la fusion complète |
| **Construction steps** | `SiteStep{...,pointIds,controlId?,visibleEntityIds?,highlightEntityIds?}`, référence des entités déjà nommées | `ConstructionStep{id,instruction,geometry:ConstructionStepGeometry[]}`, peut embarquer une géométrie ad hoc non nommée | Oui | **Réelle** (INC-5, référence vs valeur) | Les deux coexistent : B pour la génération, A pour le rendu pas-à-pas | Adaptateur qui synthétise des ids de construction temporaires pour les géométries embarquées de B avant de produire un `SiteStep` |
| **Validation** | `validateShapeGeometry`/`validateTraceModel`, lève une exception (fail-fast) | `validateGeometry`, retourne `GeometryValidationError[]` (collecte), couvre l'auto-intersection en plus | Oui | **Réelle** (INC-4, contrat d'appel) | Garder les deux contrats ; ne pas fusionner la logique (périmètres différents) | Adaptateur `assertValidGeometry(shape)` (B→style A) pour les call-sites qui préfèrent fail-fast (ex. `pre-export-check.ts`) |
| **Coordonnées de report** | Pas de table dédiée (SiteControl sert un usage voisin) | `report.ts` : `buildReportPointsTable`/`getReportPoints` | **Oui, ET une 3ᵉ implémentation** (`chantier/report-table.ts`, DUP-8) | Aucune entre B et chantier (mêmes fonctions primitives), juste une réimplémentation évitable | `engine/report.ts` (calcul), `chantier/report-table.ts` (enrichissement métier par-dessus) | **Correction immédiate possible, indépendante de la convergence A/B** : faire consommer `buildReportPointsTable` par `report-table.ts` |
| **Mesure longueur** | `arcLength`/`chordLength`/`sagitta` (`primitives.ts`) | `measure.ts` : mêmes formules + `polylineLength`/`totalLength` hétérogène | Oui, formules identiques | Aucune (zéro divergence de valeur) | `measure.ts` (B, plus complet) | Ré-export direct des fonctions d'A vers B, zéro changement de comportement |
| **Surface** | **Absent** (aires recalculées inline dans `shapes.ts`/`models/*`) | `area.ts` : cercle/ellipse/polygone (lacet)/secteur/segment circulaire | Non — lacune comblée | — | B (unique implémentation générique) | Remplacer les formules inline d'A par des appels à `circleArea`/`polygonArea` — même résultat mathématique, zéro risque |
| **Sérialisation** | **Absente** (un `TraceModel` est reconstruit en rappelant `create*Geometry(params)`, jamais persisté) | `serializeShape`/`deserializeShape` (recalcul depuis `type`+`parameters`) | Non — lacune comblée | — | B (unique implémentation) | Base directement réutilisable pour la persistance différée de `TracingProject` (au lieu d'inventer un 3ᵉ mécanisme) |
| **Qualité / exactitude** | `Quantity.quality:"exact"\|"estimate"` | `MeasuredValue.quality:"exact"\|"approximated"` **+** `MeasurementOrigin` à 5 niveaux (`tracing/`) | Oui (3 vocabulaires) | Vocabulaire seulement, pas de contradiction de valeur | `MeasurementOrigin` (5 niveaux, le plus riche, déjà pensé pour la confiance décroissante) | Fonctions de conversion `qualityToOrigin`/`originToQuality`, sans toucher les 3 types tant que leurs consommateurs respectifs ne migrent pas |
| **Modèle paramétrique** | `TraceModel` = `ShapeGeometry` + métadonnées produit, reconstruit par appel nommé | `ParametricShape<T>` + `ShapeGenerator<T>` uniforme | Oui | **La plus profonde** (INC-7, pas d'interface commune côté A) | `ParametricShape`/`ShapeGenerator` (B) pour toute **nouvelle** forme | Ne pas rétro-fitter les 13 modèles A sans raison métier ; migration pilote par lots (Phases C3/C4) |
| **Renderer** | `plan-model.ts` + composants `TraceViewer`/`AdvancedPlan`/`ToolDiagram` (SVG, calques, zoom/pan) | **Absent** (aucun fichier de rendu) | Non — lacune bloquante côté B | **Bloquante** (INC-9) | `plan-model.ts` (A), étendu pour projeter les primitives de B | Priorité n°1 de la convergence (Phase C2) : pont de rendu réutilisant `createPlanTransform`/`createArcPath`/`createPolygonPath`/`createPolylinePath` grâce à la compatibilité structurelle |
| **Registre des formes** | `traceModelRegistry` : `Record<slug, () => Promise<Module>>`, lazy, jamais invoqué génériquement | `Map` + `registerShapeGenerator`/`buildParametricShape`, invocation générique, chargement synchrone total | Oui | **Réelle** (INC-8, lazy vs générique) | Fusion à terme : registre de B étendu pour accepter un loader paresseux | Ajout additif à `registerShapeGenerator` (accepter `() => Promise<ShapeGenerator>`), sans casser l'API existante |

---

## 6. Architecture cible

**Principe** : ne proposer une arborescence en dossiers que là où elle correspond à une
distinction déjà réelle dans le dépôt. La disposition `core/primitives/operations/parametric/
construction/measurement/validation/render/adapters` suggérée en entrée **ne correspond pas
exactement** à la structure actuelle (Engine B est un dossier plat `engine/*.ts`, sans
sous-dossiers) — je l'adapte donc en **groupements logiques réalistes**, réalisables d'abord par
des barrels de ré-export (zéro risque, zéro déplacement physique), le déplacement physique réel
restant optionnel et différé en toute fin (Phase C5) :

```
apps/tools/src/lib/geometry/
├── primitives.ts, shapes.ts, shape-model.ts, models.ts, diagram-model.ts   ← Engine A (calcul), inchangé jusqu'à C5
├── plan-model.ts                                                          ← RENDER commun (cible : reçoit aussi Engine B)
├── trace-model.ts, trace-render.ts, transforms.ts                         ← Engine A (couche "atelier"/UI), inchangé
├── models/                                                                ← registre Engine A (13 modèles), migré par lots en C3/C4
│
├── engine/                          ← Engine B, déjà organisé par domaine (fichiers plats) :
│   ├── types.ts, angles.ts                          (= "core")
│   ├── transform.ts, geometry-ops.ts                (= "core/operations")
│   ├── measure.ts, area.ts, circle-tools.ts          (= "measurement")
│   ├── intersections.ts, offset.ts, simplify.ts,
│   │   snap.ts, constraints.ts, dimensions.ts        (= "operations")
│   ├── model.ts                                      (= "parametric" — le cœur du modèle)
│   ├── basic-shapes.ts, polygons.ts, stars.ts,
│   │   arches.ts, radial-pattern.ts, petals.ts,
│   │   rosettes.ts, spirals.ts, curves.ts, hearts.ts (= "parametric/generators")
│   ├── report.ts                                     (= "construction")
│   ├── validate.ts                                   (= "validation")
│   ├── api.ts, index.ts
│   └── render/            ← NOUVEAU (Phase C2) : seul dossier physique à créer avant C5,
│                             car il n'existe nulle part ailleurs. Pont ParametricShape → SVG,
│                             réutilise plan-model.ts d'Engine A.
│
└── adapters/               ← NOUVEAU (généralisation du pattern déjà prouvé par
                               `tracing/geometry-port.ts`) : point unique de conversion A ↔ B.
                               Ex. point-bridge.ts, transform-bridge.ts, quality-bridge.ts,
                               render-bridge.ts, trace-model-bridge.ts (Phase C3+).
```

**Ce que je NE recommande PAS** : renommer/déplacer `engine/*.ts` dans des sous-dossiers
`core/`, `measurement/`, etc. dès maintenant. Le gain de lisibilité est réel mais le risque
(51 fichiers à déplacer, tous les imports à corriger) est disproportionné tant que la
convergence fonctionnelle n'est pas terminée. Les noms entre parenthèses ci-dessus sont des
**groupements documentaires**, pas des dossiers à créer immédiatement.

**`geometry/adapters/`** est la seule vraie nouveauté structurelle nécessaire à court terme : il
généralise `tracing/geometry-port.ts` (qui restera, lui, définitivement en place — voir §7,
Phase C0 — comme le pont production/Engine B) à un pont **Engine A ↔ Engine B**, absent
aujourd'hui.

---

## 7. Plan de convergence — Phases C0 à C5

### C0 — Gel, inventaire, correction locale à coût nul

**Objectif** : établir une baseline mesurable, sans toucher à un seul chemin de code consommé.

- Geler l'API publique de B (`engine/index.ts` + `engine/api.ts`) : figer les noms et
  signatures exportés, tenir un `CHANGELOG` interne à `apps/tools/docs/geometry-engine.md`.
- Inventaire exhaustif (script `grep`/`ts-morph`) de tous les consommateurs actuels d'Engine A
  et d'Engine B — la liste devient la checklist de non-régression des phases suivantes.
- **Corriger DUP-8** (`chantier/report-table.ts` → doit appeler `buildReportPointsTable`
  d'`engine/report.ts`) : gain immédiat, zéro dépendance à la convergence A/B, aucun risque sur
  Engine A.

**Risques** : quasi nul — un seul fichier de production touché (`report-table.ts`), déjà
100 % dans le périmètre Engine B/production workflow, jamais consommé par les 26 routes
commerciales.

**Tests obligatoires avant de sortir de C0** : suite complète actuelle verte (425 tests
`apps/tools` au dernier état connu) ; test spécifique de `report-table.ts` comparant l'ancien et
le nouveau calcul sur les mêmes points (doit produire des valeurs identiques).

---

### C1 — Adaptateurs de type, zéro changement de comportement

**Objectif** : exploiter la compatibilité structurelle A→B (§4) pour que les deux moteurs
partagent les mêmes valeurs runtime, sans qu'aucun fichier consommateur existant ne change de
comportement observable.

- Créer `geometry/adapters/point-bridge.ts` : `asPoint2D` (identité documentée), `withId(id,p,
  label?,role?)`.
- Ré-exporter les types strictement identiques (`Vector`, `BoundingBox`) comme alias.
- Remplacer les fonctions mathématiques pures et sans divergence de valeur d'A par des
  ré-exports fins de B : `arcLength`, `chordLength`, `sagitta` (concept 20), `tangentPoints`
  (concept 14, avec réinjection d'id).

**Risques** : faible — uniquement un risque de câblage (import cassé), détecté immédiatement
par le typecheck ; zéro risque mathématique (mêmes formules, vérifiable caractère pour
caractère).

**Tests obligatoires** : 100 % des tests existants de `primitives.test.ts`/`shapes.test.ts`
restent verts **sans modification de leur contenu** — toute modification de test à cette phase
est un signal d'alerte, pas un refactor normal.

---

### C2 — Pont de rendu (priorité n°1 : lève la lacune bloquante INC-9)

**Objectif** : rendre visible une `ParametricShape` de B dans l'UI existante, sans toucher aux
13 modèles A ni à `TraceViewer`.

- Créer `geometry/engine/render/svg.ts` : convertit `ShapePrimitives` (B) en structure
  consommable par `createPlanTransform`/`createArcPath`/`createPolygonPath`/`createPolylinePath`
  (A) — remapping de champs quasi direct grâce à la compatibilité structurelle de C1.
- Ajouter une route de démonstration **interne** (`noindex`, hors catalogue, sur le modèle de
  `/outils/traces-preview`) affichant une `ParametricShape` de B via ce pont.

**Risques** : modéré — première fois que du rendu touche B ; risque de bug visuel (sens de
balayage d'arc, orientation). Mitigé par des tests de coordonnées projetées sur des cas connus.

**Tests obligatoires avant fusion** : tests unitaires du pont (cercle, arc 90°, polygone —
coordonnées projetées comparées à des valeurs attendues calculées à la main) + validation
visuelle manuelle sur la route de démonstration + zéro test A existant modifié.

---

### C3 — Migration pilote d'un modèle décoratif (preuve bout-en-bout)

**Objectif** : valider la convergence sur un cas réel à faible enjeu commercial (preview
interne, pas un des 26 outils Pro).

- Choix recommandé : **`star-5`**, car il existe déjà en miroir quasi identique côté B
  (`engine/stars.ts::createStar`, DUP-7) — comparaison directe possible.
- Créer `geometry/adapters/trace-model-bridge.ts::parametricShapeToTraceModel(shape, meta)`.
- Réécrire `models/star.ts` pour déléguer à `createStar` puis adapter le résultat.
- Écrire un test de non-régression comparant point par point (aux ids/labels près) l'ancienne
  et la nouvelle géométrie, **avant** de remplacer le fichier.

**Risques** : moyen — premier vrai remplacement de logique métier, mais blast radius limité
(modèle preview interne, non catalogué).

**Tests obligatoires** : test de non-régression dédié (temporaire, supprimable après
validation) + `star.test.ts` existant inchangé et vert + build/typecheck verts.

**Critère de GO pour la suite** : zéro différence numérique détectée entre l'ancien et le
nouveau `star-5`.

---

### C4 — Migration par lots des 12 modèles restants + unification qualité/registre

**Objectif** : généraliser C3, modèle par modèle ou par petits lots homogènes (ex. les 3
fleurs, structurellement proches de `radial-pattern.ts`/`rosettes.ts` côté B).

- Même recette que C3 pour chaque modèle : déléguer → adapter → comparer → remplacer.
- Unifier le vocabulaire qualité (concept 23) via les fonctions de conversion définies en C1/C0.
- Faire évoluer `registerShapeGenerator` pour accepter un loader paresseux (INC-8), puis migrer
  `traceModelRegistry` vers le registre de B.

**Risques** : cumulatif moyen — 12 migrations répétées ; risque principal = régression
silencieuse sur un modèle peu testé visuellement, mitigé par le triplet de tests systématique
de C3, répété à chaque modèle. **Ne pas migrer le lot suivant avant que le lot précédent soit
GO en recette interne.**

**Tests obligatoires par modèle migré** : comparaison ancien/nouveau + tests unitaires du
modèle inchangés et verts + build/typecheck.

---

### C5 — Suppression du code mort + réorganisation cosmétique optionnelle

**Objectif** : supprimer réellement le calcul dupliqué d'Engine A, uniquement une fois plus
aucun consommateur direct (voir critères §9).

- Appliquer les critères de suppression module par module (`transforms.ts`, parties calcul de
  `primitives.ts` déjà ré-exportées en C1, `Line` non consommé…).
- Renommer `models.ts` → `decorative-plan-models.ts` (dette documentée depuis deux audits,
  jamais réalisée).
- Réorganisation physique optionnelle de `engine/*.ts` en sous-dossiers (§6), uniquement si
  jugée utile — chaque déplacement = un commit `git mv` isolé + shim de ré-export, jamais un
  déplacement et une réécriture simultanés.

**Risques** : faible si C0–C4 ont été respectées à la lettre (plus aucun consommateur) ; élevé
si une étape est sautée — une suppression prématurée toucherait potentiellement les 26 routes
commerciales génératrices de revenu, le pire scénario possible.

**Tests obligatoires** : `grep -rn` exhaustif confirmant zéro référence restante **avant**
suppression (pas après) ; suite complète verte après suppression ; recette manuelle des 26
routes commerciales (`npm run verify` racine) avant tout merge vers `main`.

---

## 8. Tableau consolidé des risques par phase

| Phase | Risque | Nature du pire scénario | Mitigation |
|---|---|---|---|
| C0 | Quasi nul | Aucun — un seul fichier hors chemin commercial | Tests avant/après identiques |
| C1 | Faible | Import cassé (détecté au build, pas en prod) | Typecheck + suite verte inchangée |
| C2 | Modéré | Bug visuel sur la route de démo interne (jamais publique) | Tests de coordonnées + revue visuelle |
| C3 | Moyen | Régression sur un modèle preview interne (non catalogué) | Comparaison numérique systématique avant remplacement |
| C4 | Moyen (cumulatif) | Idem C3, répété 12 fois | Même triplet de tests, lot par lot, jamais en parallèle |
| C5 | Faible si respecté / Élevé sinon | Suppression prématurée touchant une des 26 routes commerciales | `grep` exhaustif + recette manuelle obligatoire avant merge |

---

## 9. Critères permettant de supprimer une ancienne API

1. **Zéro référence textuelle restante** (`grep -rn`, y compris dans les tests et les docs) au
   symbole/fichier candidat, dans tout `apps/tools/src`.
2. Le remplacement est couvert par au moins un test qui exerçait auparavant l'ancien symbole
   (portée de test non régressée, pas seulement "un test existe quelque part").
3. Le symbole n'est documenté comme API stable dans aucun `README.md`/`docs/*.md` restant — sinon
   mettre à jour la documentation **avant** la suppression, jamais après.
4. Build + typecheck + lint + suite complète verts **après** suppression, sur une branche
   dédiée, avant tout merge.
5. Recette manuelle des parcours commerciaux impactés, si le symbole touchait — même
   indirectement — une des 26 routes Pro. Pas seulement les tests automatisés.
6. Décision tracée (message de commit ou doc) : quelle phase C_n a rendu la suppression
   possible — pour l'auditabilité future, éviter une suppression silencieuse.
7. Pour un **type** (pas une fonction) : vérifier qu'aucune donnée sérialisée existante (ex. un
   futur `TracingProject` persisté) ne référence l'ancien type par son nom dans un champ
   `type`/`kind` — sinon prévoir une migration de données (`migrateProject` existe déjà dans
   `tracing/project.ts`, à étendre plutôt qu'à dupliquer).

---

## 10. Estimation d'effort relatif

Échelle relative (XS/S/M/L), **pas** une estimation en jours — dépend de la vélocité de
l'équipe et du nombre de conversations en parallèle.

| Phase | Effort relatif | Justification |
|---|---|---|
| C0 | XS | Audit déjà largement fait par ce document + un seul fichier corrigé |
| C1 | S | Ré-exports et alias de types, aucune nouvelle logique |
| C2 | M | Nouveau pont de rendu + tests de coordonnées + route de démo |
| C3 | M (mais critique) | Un seul modèle, mais construit tout l'outillage de comparaison réutilisé ensuite |
| C4 | **L** (le plus gros poste) | 12 modèles + unification qualité + registre paresseux ; effort décroissant modèle après modèle grâce à l'outillage de C3 |
| C5 | S à M | S si nettoyage de code mort seul ; M si réorganisation physique des dossiers en plus |

**Ordre de grandeur relatif global** : `C4 > C2 ≈ C3 > C5 > C1 > C0`.

---

## 11. Sujets transverses (synthèse)

- **Compatibilité des types** : traitée concept par concept en §5 ; le fait central est la
  compatibilité structurelle A→B gratuite (§4).
- **Stratégie des IDs de points** : `withId`/`asPoint2D` (§7, C1) — direction unique A→B libre,
  B→A nécessite de fournir un id.
- **Gestion mm** : déjà unifiée (`lib/units.ts`, DUP absent) — aucune action requise, modèle à
  suivre.
- **exact / approximated / estimate** : unifier vers `MeasurementOrigin` (5 niveaux) via des
  fonctions de conversion, sans toucher aux 3 types tant que leurs consommateurs ne migrent pas
  (concept 23).
- **Sérialisation** : `serializeShape`/`deserializeShape` de B, base directe pour la persistance
  différée de `TracingProject`, sans inventer un 3ᵉ mécanisme.
- **Versionnement** : `CHANGELOG` interne pour l'API publique de B (C0) ; envisager un champ de
  version de schéma sur `ParametricShape.type` à terme, sur le modèle de
  `TRACING_PROJECT_SCHEMA_VERSION`/`migrateProject` déjà existant côté `tracing/project.ts`.
- **Migration des modèles décoratifs** : Phases C3 (pilote) puis C4 (lots), jamais en bloc.
- **Migration du production workflow** : **déjà faite** — `tracing/`/`chantier/` consomment B
  exclusivement via `geometry-port.ts`, qui doit rester en place **définitivement** comme
  frontière imposée (pas un candidat de suppression, contrairement aux doublons d'Engine A).
- **Compatibilité DXF/PDF/SVG** : aujourd'hui, SVG et PDF (pré-existants) ne consomment
  qu'Engine A ; seul le nouvel export DXF consomme Engine B (+ un type-only d'A). Le pont de
  rendu de la Phase C2 unifie cela en permettant à SVG/PDF de rendre aussi des formes B, sans
  toucher à l'export DXF existant.
