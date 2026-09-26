# Convergence Engine A / Engine B — Phases C0-C2 (contrat stable)

> Complète `apps/tools/docs/ENGINE_CONVERGENCE_PLAN_V1.md` (plan complet C0-C5) et
> `apps/tools/docs/tracing-integration-v1.md` (architecture d'intégration). Ce document décrit
> uniquement ce que ce lot a livré : le **contrat d'adaptateur**, pas une nouvelle
> architecture. Aucun fichier hors `geometry/engine/types.ts` (additif) et `geometry/adapters/`
> (nouveau) n'est touché — Engine A (`geometry/models/`, `trace-model.ts`, composants
> `Trace*`), `tracing/`, `chantier/`, la persistance de projet et le module Conseils &
> Techniques restent strictement hors périmètre.

## Source de vérité

**Engine B (`geometry/engine/`) est la source de vérité géométrique paramétrique générique.**
**`TraceModel` (Engine A) reste le contrat UI/pédagogique** consommé par
`TraceViewer`/`TraceSteps`/`SiteMode`. Ce lot ne fusionne pas les deux moteurs — il construit
le pont qui permet à un générateur B d'alimenter l'écosystème A sans dupliquer la géométrie.

## Sens de dépendance

```
ParametricShape (Engine B)  →  geometry/adapters/  →  TraceModel (Engine A)
```

Le sens inverse n'existe pas et n'est pas prévu : Engine A ne dépend jamais d'Engine B, Engine
B ne dépend jamais d'Engine A (vérifié : zéro import croisé avant et après ce lot). Le seul
fichier partagé entre les deux univers est `geometry/adapters/`, symétrique au rôle que joue
déjà `tracing/geometry-port.ts` pour `tracing/`/`chantier/`.

## Contrat de l'adaptateur

```ts
parametricShapeToTraceModel(shape: ParametricShape, metadata: TraceModelMetadata, options?: ParametricShapeAdapterOptions): TraceModel
```

- **Géométrie** : vient exclusivement de `shape.primitives` — jamais recalculée, jamais
  dupliquée. Chaque primitive reçoit un id synthétique stable (`${modelId}-{catégorie}-{index}`)
  puisque `Point2D`/`Segment2D`/… n'ont pas d'identité côté B.
- **Pédagogie/UI** : vient exclusivement de `metadata` (nom, catégorie, difficulté, tags,
  paramètres affichés, explication, statut) — Engine B ne connaît, et ne doit jamais connaître,
  ce vocabulaire.
- **Rôles construction/final** (§9) : `Segment2D`/`Circle2D`/`Arc2D`/`Ellipse2D` portent
  désormais un champ optionnel `role?` (additif, vocabulaire identique à Engine A —
  `"shape"|"construction"[|"axis"]`). Absent = traité comme `"shape"`. Un segment
  `role:"construction"` part dans `constructionLines`, jamais dans `segments`.
- **Étapes de construction** : `ConstructionStep[]` → `SiteStep[]`, ordre préservé strictement.
  Une géométrie embarquée dans une étape est résolue par **égalité de valeur** (pas de
  référence) vers l'entité déjà mappée ; si elle n'apparaît dans aucune primitive finale, elle
  est matérialisée à la volée avec `role:"construction"` (une géométrie qui n'existe que dans
  une étape est presque toujours une aide de construction).
- **Cotations** : `engine/dimensions.ts` reste indépendant de `ParametricShape` (aucun
  générateur actuel n'y attache de cotes). `dimensionResultToDimension(id, label, result)`
  convertit un `DimensionResult` déjà calculé par l'appelant — l'adaptateur ne calcule et
  n'invente aucune cote.
- **Sérialisation** : l'adaptateur est une **projection runtime pure**, jamais persistée. Pour
  sauvegarder une forme adaptée, persister `{type, parameters}` (via `serializeShape` côté B) et
  reconstruire à la demande — jamais un cache de `TraceModel`.
- **Validation** : `validateTraceModel` (existant, inchangé) est appelé en sortie — toute
  `ParametricShape` valide doit produire un `TraceModel` valide, sinon c'est un bug de
  l'adaptateur, pas une exception à absorber.

## Choses interdites (pour ce lot et les suivants tant que C3 n'est pas ouvert)

- Migrer un des 13 modèles `geometry/models/*` vers Engine B.
- Supprimer un fichier ou une fonction d'Engine A ou d'Engine B.
- Modifier `TraceViewer`/`TraceSteps`/`SiteMode`/`TraceParametersForm`.
- Toucher `tracing/`, `chantier/`, la persistance de `TracingProject`, l'UI de quantités de
  report, ou le module Conseils & Techniques.
- Ajouter une dépendance externe.
- Fusionner physiquement les dossiers `geometry/` et `geometry/engine/`.

## Duplication `report` (§12) — décision de ce lot

**Reportée, non corrigée.** `chantier/report-table.ts` réimplémente une partie de
`engine/report.ts`. Une conversation parallèle (« Atelier report quantities UI ») travaille
probablement sur ce même périmètre — le corriger maintenant créerait un risque de collision de
fichier inutile. Item ouvert pour C3/C4, documenté dans `ENGINE_CONVERGENCE_PLAN_V1.md` (DUP-8).

## API stable exposée par ce lot (§17)

```ts
// apps/tools/src/lib/geometry/adapters/index.ts
parametricShapeToTraceModel(shape, metadata, options?) → TraceModel
dimensionResultToDimension(id, label, result) → Dimension
validateParametricShape(shape) → GeometryValidationError[]   // alias de engine/validate.ts::validateGeometry
validateTraceModel(model) → TraceModel                        // réexport de geometry/trace-model.ts (inchangé)
buildParametricShape(type, parameters) → ParametricShape      // réexport de engine/model.ts (inchangé)
withId(id, point2D, label?, role?) → Point
asPoint2D(point) → Point2D                                     // identité documentée
```

Toute autre fonction de `geometry/adapters/` (registre de résolution par valeur, preuves de
compatibilité de type) est un détail d'implémentation privé — ne pas l'importer directement
depuis l'extérieur du dossier.

## Stratégie de migration future

Voir `ENGINE_CONVERGENCE_PLAN_V1.md` §6 (phases C3-C5) : migration pilote d'un modèle
(`star-5`, déjà en double avec `engine/stars.ts::createStar`), puis migration par lots des 12
modèles restants, puis suppression du calcul dupliqué d'Engine A une fois plus aucun
consommateur — jamais avant.

## Critères avant de supprimer une ancienne API

Identiques à `ENGINE_CONVERGENCE_PLAN_V1.md` §9 : zéro référence textuelle restante, couverture
de test non régressée, documentation à jour avant suppression (pas après), build/typecheck/
lint/tests verts après suppression sur une branche dédiée, recette manuelle si un outil Pro
commercial est concerné, décision tracée, migration de données si un type sérialisé est
concerné.
