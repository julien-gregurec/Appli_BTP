# Atelier → Engine B : résolution du modèle d'un tracé

Lot `ELSATIA-TOOLS-ATELIER-MODELID-ENGINE-B-BRIDGE-V1`.

## 1. La chaîne, avant ce lot

`TracingProject.modelId` était un slug libre validé par une simple expression régulière, choisi
dans une liste de 7 entrées **propre à l'Atelier** (`lib/tracing/atelier-models.ts`), sans aucun
rapport avec les 13 modèles du registre géométrique. Le fichier le disait explicitement :
« ce lot NE reconstruit PAS le catalogue géométrique et n'importe AUCUN module de
`geometry/engine/**` ni `geometry/models/**` ».

Conséquence : un projet d'Atelier n'avait jamais de géométrie. `AtelierExportWorkspace` appelait
`tracingProjectToChantierExportDocument(project)` sans second argument, donc `ResolvedAtelierGeometry`
restait vide et `document.geometry` ne pouvait venir que d'un tracé photo/manuel. SVG, DXF, PNG,
mosaïque et 1:1 étaient donc indisponibles pour tout projet basé sur un modèle.

La table « modèle → paramètres → générateur » existait, mais **dans un composant React**
(`components/TracesPreviewWorkspace.tsx`), inaccessible à l'Atelier, à l'export et aux tests.

## 2. La chaîne, après ce lot

```
TracingProject.modelId + TracingProject.modelParams
  → findTraceModelDescriptor()          lib/geometry/models/catalog.ts
  → normaliseModelParameters()          défauts du modèle + surcharges projet + validation
  → descriptor.build(params)            create<Nom>Geometry(...)
  → ParametricShape (Engine B) → parametricShapeToTraceModel → TraceModel
  → resolvedAtelierGeometry()           lib/exports/atelier-resolved-geometry.ts
  → tracingProjectToChantierExportDocument(project, resolved)
  → ChantierExportDocument → PDF / SVG / DXF / PNG / mosaïque / 1:1 / partage
```

Le point d'entrée unique est `resolveTracingProjectModel(project)`
(`lib/tracing/model-resolver.ts`) : fonction **pure, synchrone, sans React**. Elle ne calcule
aucune géométrie et n'en corrige aucune — le générateur du modèle, adossé à Engine B, reste la
seule source de vérité.

## 3. `modelId`

Le vocabulaire accepté est **exactement** celui du registre (`traceModelRegistry`), garanti par
`catalog.parity.test.ts` :

`circle-division`, `star-5`, `rosette-6`, `heart`, `arch-full-round`, `ogive-equilateral`,
`ellipse-pedagogical`, `spiral-archimedes`, `flower-4`, `flower-5`, `flower-6-elongated`,
`turbine`, `double-s`.

| Cas | Résultat |
| --- | --- |
| slug du registre | `resolved` — géométrie Engine B |
| `modelId` absent | `none` — « décider plus tard » reste un choix valide |
| slug inconnu | `unknown-model` — **aucun repli** vers un autre modèle |
| paramètres hors bornes | `invalid-params` — **aucun clamp silencieux** |
| générateur qui refuse | `failed` — message du générateur remonté tel quel |

La résolution passe par une `Map`, jamais par un accès indexé sur l'objet littéral : un
`modelId` persisté valant `constructor` ou `toString` doit rester inconnu, pas résoudre vers un
membre de `Object.prototype`.

### Anciens slugs

Les 6 slugs de l'assistant d'avant ce lot désignaient les **mêmes** modèles. Ils sont traduits
par `LEGACY_MODEL_ID_ALIASES` **et la traduction est signalée** dans `warnings` puis affichée à
l'écran. Ce n'est pas un repli silencieux : c'est un renommage assumé et visible.

| Ancien | Nouveau |
| --- | --- |
| `cercle-division` | `circle-division` |
| `rosace` | `rosette-6` |
| `etoile` | `star-5` |
| `arche-plein-cintre` | `arch-full-round` |
| `ogive` | `ogive-equilateral` |
| `ellipse` | `ellipse-pedagogical` |
| `trace-libre` | *(aucun modèle → `none`)* |

`trace-libre` n'a jamais désigné un modèle : il signifiait « composer à la main », ce que
l'absence de `modelId` exprime déjà.

## 4. Paramètres

- **defaults** : publiés par le modèle (`TraceParameter.defaultValue`). L'Atelier n'en redéfinit
  aucun.
- **overrides** : `TracingProject.modelParams`, qui ne contient **que les écarts** voulus par
  l'utilisateur. Les défauts ne sont jamais recopiés dans le projet.
- **normalisation** : `params = { ...defaults, ...overrides valides }`.
- **validation** : bornes `min`/`max` et alignement sur `step` (tolérance relative 1e-6, pour que
  `innerRatio` au pas 0,01 et `turns` au pas 0,25 restent acceptés). Hors limites ⇒ erreur, jamais
  une valeur ramenée dans les bornes.
- **paramètre inconnu du modèle** : ignoré et signalé en avertissement — le projet ne connaît pas
  le catalogue, il ne peut pas être refusé pour cela.

## 5. Contrôle pré-export

`runPreExportChecks` refusait tout projet basé sur un modèle : `scale-undefined` (le projet reste
`scaleStatus: "undefined"` tant qu'aucune calibration photo n'a eu lieu) et `empty-drawing`
(`project.shapes` est vide — le tracé n'est pas dessiné, il est calculé).

Un modèle est construit en millimètres exacts. `buildPreExportInputFromProject` reçoit donc un
troisième argument `hasResolvedModelGeometry` : il pose `scaleDefined: true` et
`PreExportInput.hasResolvedModelGeometry`, qui neutralise le seul contrôle `empty-drawing`. Le
chemin photo/manuel est inchangé : le drapeau n'est vrai que pour une géométrie venue du moteur.

## 6. Persistance et versionnage

Le projet ne stocke **que** `modelId` et `modelParams` : aucune géométrie dérivée, aucun cache de
points. La géométrie est recalculée par Engine B à chaque lecture — recalcul déterministe vérifié
par test (`JSON.stringify` identique avant/après aller-retour de sérialisation).

`TRACING_PROJECT_SCHEMA_VERSION` passe de 2 à 3 (ajout de `modelParams`, optionnel et additif).
`migrateTracingProject` gère v1→v2→v3 sans rien renseigner : sans surcharge, un projet v2 se
résout avec les seuls défauts du modèle, c'est-à-dire exactement son comportement d'avant.
**Aucune migration Supabase** : `TracingProject` est un document local (IndexedDB).

### `modelVersion` / `engineVersion` : non ajouté, et pourquoi

Le risque est réel : la géométrie étant recalculée, un changement de générateur modifie
rétroactivement un tracé déjà utilisé sur chantier. Mais un champ de version posé aujourd'hui ne
protégerait de rien — il n'existe ni générateurs versionnés à épingler, ni mécanisme de
résolution par version. Ce serait un champ mort qui coûterait une migration de schéma sans rien
garantir.

Le champ devient justifié le jour où l'une de ces conditions est remplie :
1. un générateur change de formule (pas une correction de bug, un changement de tracé) ;
2. les tracés sont partagés entre appareils ou versions d'application ;
3. un export signé/archivé doit être reproductible à l'identique.

D'ici là, la garantie repose sur les tests de parité (`*.parity.test.ts`) qui figent la géométrie
produite par chaque modèle.

## 7. États d'erreur à l'écran

`buildModelResolutionViewModel` (`components/atelier/model/`) projette les cinq états de
résolution vers un couple ton/titre/message toujours renseigné. Aucun chemin ne rend « rien », et
`AtelierExportWorkspace` capture en plus un échec d'assemblage du document : ni écran blanc, ni
exception non gérée.
