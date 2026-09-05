# ELSATIA Tools — Consolidation Atelier de traçage — Rapport d'intégration V2

Branche : `integration/tools-tracing-v1` (jamais fusionnée sur `main`, jamais déployée).
Base commune : `996be15`. Date : 2026-09-05.
Chef d'orchestre : agent d'intégration (aucune nouvelle fonction métier développée).

---

## A — Branches intégrées

| Lot | Branche | HEAD | Contenu | Tests du lot (isolé) |
|---|---|---|---|---|
| 1 — Bibliothèque de tracés décoratifs | `feat/tools-traces-geometry-decorative-families-v1` | `0b409cc` | Engine A + `trace-model`/`transforms`/`trace-render` + 13 modèles + `TraceViewer`/`TraceSteps`/`SiteMode`/`TraceParametersForm`/`TracesPreviewWorkspace` + route interne `/outils/traces-preview` | 272/272 (38 fichiers), typecheck OK |
| 2 — Moteur géométrique professionnel | `feature/tools-geometry-engine` | `09adfed` | `lib/geometry/engine/` (51 fichiers) : types `*2D`, transform affine, intersections, mesures, aires, offset, simplify, snap, constraints, dimensions, report, générateurs paramétriques, `api`, `validate`, `model`+sérialisation | inclus dans le total consolidé |
| 3 — Production workflow | `feature/tools-production-workflow` | `7b18d9b` (`47a97d5`, `1254439`, `7b18d9b`) | `lib/tracing/` (image, calibration, vectorisation, `TracingProject`), `lib/chantier/` (report, nomenclature, marges, LED, profils, éclairage, témoin, mosaïque, pré-check), `lib/exports/dxf.ts` (ASCII R12), `docs/production-workflow.md` | inclus dans le total consolidé |

> Note : le Lot 2 s'est auto-commité (`09adfed`, additif, identique aux fichiers non suivis
> constatés à l'audit) pendant la préparation ; aucune commit du Lot 2 n'a été créée par
> l'agent d'intégration.

## B — Commits d'intégration (branche `integration/tools-tracing-v1`)

```
29078a4  merge(integration): Lot 1 — bibliothèque de tracés décoratifs (…@0b409cc)
c1adf03  merge(integration): Lot 3 — workflow production chantier (…@7b18d9b)
2be4516  merge(integration): Lot 2 — moteur géométrique paramétrique (…@09adfed)
<hash>   docs(tools): architecture d'intégration V1 + rapport de consolidation V2
996be15  (base)
```

Ordre de fusion : **moteur (2) → production (3) → décoratif (1)**.
Justification : dépendance réelle (le Lot 3 consomme le moteur du Lot 2 via
`tracing/geometry-port.ts`) ; le Lot 1 est indépendant et le plus volumineux, donc fusionné
en dernier. L'analyse Git préalable a montré des arbres **disjoints** (aucun fichier commun
entre Lot 1 et Lot 3 ; moteur du Lot 2 sans aucun import d'Engine A), donc l'ordre n'avait
pas d'incidence sur les conflits — il suit la logique de dépendances.

## C — Architecture finale

Voir `apps/tools/docs/tracing-integration-v1.md`. En résumé :

- **Engine A** (`lib/geometry/`) : TraceModel, 13 modèles décoratifs, UI recettée, renderer SVG.
- **Engine B** (`lib/geometry/engine/`) : primitives génériques, transformations, intersections,
  validation, offsets, simplification, snap, cotation générique, report, futures formes.
- **Production workflow** (`lib/tracing/`, `lib/chantier/`, `lib/exports/dxf.ts`) : image,
  calibration, projet, exports, mosaïque, DXF, métrés, LED, dossier chantier.
- Frontières strictes : A et B ne se référencent jamais ; `tracing/`+`chantier/` passent par
  `geometry-port.ts` (adaptateur unique vers B), plus deux imports **type-only** d'Engine A
  (`Quantity`, `ShapeGeometry`) à la frontière export.

## D — Conflits rencontrés

**Aucun.** Les 3 fusions `--no-ff` se sont appliquées proprement (stratégie `ort`, 0 conflit) :

- Lot 2 : +53 fichiers (`engine/**`, `docs/geometry-engine.md`, +1 ligne `README.md`).
- Lot 3 : +25 fichiers (`tracing/**`, `chantier/**`, `exports/dxf.ts`, `docs/production-workflow.md`, 1 ligne dans `exports/document.ts`).
- Lot 1 : +46 fichiers (`models/**`, `trace-*.ts`, `transforms.ts`, composants, route, +
  extensions **additives** de `primitives.ts`/`shape-model.ts`/`plan-model.ts`).

`README.md` : seul le Lot 2 le modifie (+1 ligne) → pas de conflit.

## E — Doublons supprimés

**Aucune suppression.** Conformément à la consigne (§4/§25 : ne pas supprimer Engine A « pour
faire plus propre », ne pas converger les moteurs maintenant), aucun code n'a été retiré.
`lib/units.ts` était déjà une source unique partagée — rien à dédupliquer côté unités.

## F — Doublons volontairement conservés (architecture de transition)

| Responsabilité | Engine A | Engine B | Raison de la coexistence |
|---|---|---|---|
| Point / Vector / Circle / Arc / Ellipse / Segment / Polyline / Polygon | `primitives.ts` (`Point {id,label,role}`) | `engine/types.ts` (`Point2D` valeur pure) | A porte l'identité de rendu ; B est immuable pour le calcul. Migration = phase dédiée. |
| Transformations | `transforms.ts` (point-à-point) | `engine/transform.ts` (matrices affines) | B plus général ; A consommé tel quel par les 13 modèles testés. |
| Intersections / mesures / divisions | `primitives.ts` | `engine/{intersections,measure,circle-tools}.ts` | idem. |
| Validation | `validateShapeGeometry` / `validateTraceModel` | `engine/validate.ts` (`validateGeometry`) | B ajoute auto-intersection / hors-bounds ; A validé par 272 tests. |
| Qualité de mesure | `Quantity.quality:"exact"|"estimate"` | `MeasuredValue.quality:"exact"|"approximated"` + `MeasurementOrigin` (5 niveaux) | À unifier en convergence. |
| Générateurs étoile/polygone/rosace/pétale/spirale/cœur | `models/*.ts` (→ `TraceModel`) | `engine/{stars,polygons,rosettes,petals,spirals,hearts}.ts` (→ `ParametricShape`) | A alimente l'UI actuelle ; B alimentera l'Atelier des formes utilisateur. |
| `models.ts` (décoratif Free hérité) vs `models/` (registre 13) | — | — | Renommage `models.ts` → `decorative-plan-models.ts` reporté en convergence. |

Frontière documentée dans `tracing-integration-v1.md` §5.

## G — Tests finaux (chiffres réels post-intégration, pas les chiffres des lots)

| Suite | Fichiers | Tests | Résultat |
|---|---|---|---|
| `apps/tools` (`vitest run`) | 67 | **425** | ✅ 425 passed |
| Package racine (`vitest run`) | 92 | **806** | ✅ 806 passed |
| **Total monorepo TS** | 159 | **1231** | ✅ |

Couverture (via les suites des lots, toutes vertes dans le total) : géométrie A + B,
conversion d'unités, sérialisation de formes, calibration (refus sans échelle), calculs
d'export, DXF, pagination mosaïque, marges/chutes, LED, validation géométrique, 13 modèles
décoratifs, navigation pas-à-pas.

## H — Typecheck

- `apps/tools` : `tsc --noEmit --incremental false` → ✅ **0 erreur**.
- Racine (`tsc --noEmit` + `apps/tools`) → ✅ **0 erreur**.
- Aucun `any`, `@ts-ignore` ni `eslint-disable` ajouté par l'intégration.

## I — Lint

- `apps/tools` : `eslint src next.config.ts capacitor.config.ts` → ✅ **0 problème**.
- Racine : `eslint .` → ✅ **0 erreur** (3 warnings pré-existants `@next/next/no-img-element`
  dans `src/app/(app)/boutique/*` et `src/components/SignatureEmploye.tsx` — hors périmètre,
  non introduits par l'intégration).

## J — Build

- `apps/tools` : `next build --webpack` → ✅ **succès**. 37 pages statiques générées,
  **26 routes d'outils commerciales** (`/outils/[id]`) inchangées + `/outils/traces-preview`
  (interne, `robots:{index:false}`, absente du catalogue et du sitemap).
- Build racine (`elsatia-gestion-pro`) : **non relancé** — l'intégration ne touche **aucun
  fichier hors `apps/tools/`** (`git diff --stat 996be15..HEAD -- ':!apps/tools'` vide).

## K — Fonctions opérationnelles

- Moteur A : 13 modèles décoratifs paramétriques, `TraceViewer` (6 calques, zoom/pan),
  `TraceSteps`, `SiteMode`, formulaire de paramètres.
- Moteur B : primitives, transformations affines, intersections (toutes combinaisons
  point/segment/droite/cercle/arc), aires, offset, simplification Douglas–Peucker, snap,
  contraintes, cotations génériques, table de report, générateurs, `validateGeometry`,
  `serializeShape`/`deserializeShape`.
- Production : import/format d'image, redressement px, **calibration px→mm avec refus si non
  calibrée**, vectorisation/simplification, `TracingProject` + `migrateProject`,
  `report-table`, `nomenclature`, `margins` (10 m +10 % → 11 m), `led`, `profiles`,
  `lighting`, `witness`, `mosaic` (feuilles/recouvrement/numérotation/plan d'assemblage),
  `pre-export-check`, **export DXF ASCII R12** (LINE/CIRCLE/ARC/LWPOLYLINE/TEXT, mm).
- Exports pré-existants intacts : SVG, PDF simple.

## L — Fonctions différées (préparées, jamais présentées comme terminées, aucun bouton fictif)

rendu `<canvas>` de l'image · auto-détection de contour (CV) · décodage HEIC réel (format
reconnu = non supporté, testé) · PDF « dossier chantier » multi-pages · pages mosaïque
imprimées + gabarit 1:1 PDF · export PNG · persistance `TracingProject` (IndexedDB + sync) ·
partage · undo/redo.

Documentées dans `docs/production-workflow.md` § « Volontairement différé » et
`docs/tracing-integration-v1.md` §10.

## M — Régressions détectées / corrigées

**Aucune régression.**

- Les 26 routes d'outils commerciales sont inchangées (build identique avant/après).
- Les tests historiques d'`apps/tools` (calculateurs, navigation, auth, favoris, paramètres)
  passent : 425/425.
- Aucune correction n'a été nécessaire — les 3 lots étaient déjà verts isolément et leurs
  périmètres de fichiers sont disjoints. Aucun commit « corrections » n'a donc été créé.

## N — Risques restants

1. **Deux moteurs géométriques** coexistent (transition assumée §4/§25). Risque de dérive si
   de nouveaux modules choisissent le « mauvais » moteur → mitigé par la table de frontières
   (`tracing-integration-v1.md` §5). Convergence = phase dédiée ultérieure.
2. **Vocabulaires de qualité divergents** (`estimate` vs `approximated` vs `MeasurementOrigin`)
   — cosmétique tant que chaque couche reste dans son moteur ; à unifier en convergence.
3. **UI Atelier commerciale absente** : `/outils/traces-preview` (interne) est la seule entrée.
   La recette porte sur la logique + la preview, pas sur un parcours commercial complet.
4. **Chaîne PDF chantier multi-pages / gabarit 1:1 imprimé non branchée** : la géométrie de
   pagination existe (`mosaic.ts`) mais le rendu jsPDF page-à-page reste à faire. Ne pas
   annoncer le gabarit 1:1 imprimable comme opérationnel.
5. **Persistance `TracingProject` non implémentée** (modèle + `migrateProject` prêts).
6. Détail d'environnement : la branche d'intégration utilise des `node_modules` liés
   symboliquement depuis le worktree principal (les `package.json` sont identiques à la base) —
   sans impact sur le code livré.

## O — GO / NO-GO pour recette utilisateur **interne**

### ✅ GO — recette utilisateur interne.

| Critère §29 | État |
|---|---|
| Branches propres | ✅ 3 lots commités, 3 fusions sans conflit |
| Aucun changement non commité critique | ✅ (docs de ce rapport inclus dans le commit docs) |
| Typecheck vert | ✅ racine + `apps/tools` |
| Lint vert | ✅ 0 erreur |
| Tests verts | ✅ 425 (`apps/tools`) + 806 (racine) |
| Build vert | ✅ `apps/tools` (racine non concernée) |
| Bibliothèque décorative intacte | ✅ 13 modèles, 272 tests dans le total |
| Nouveau geometry engine intact | ✅ autonome, ses tests dans le total |
| Production workflow intact | ✅ tracing/chantier/dxf verts |
| Calibration fiable | ✅ refus px→mm sans échelle, testé |
| Aucun bouton fictif | ✅ 0 TODO/MOCK/PLACEHOLDER, preview interne non liée au catalogue |
| Pas de contenu tiers | ✅ 0 asset binaire/image ajouté |
| Architecture documentée | ✅ `tracing-integration-v1.md` + ce rapport |

### Périmètre de la recette interne recommandé

- Scénario A (rosace 6 pétales, pièce 5000×4000, Ø 2400) via `/outils/traces-preview`.
- Scénarios B/C (photo → calibration → mesure ; gorge LED → offset → longueur → quantité)
  au niveau logique (`tracing/`, `chantier/`) — pas encore de parcours UI complet.
- DXF : ouvrir un export simple dans un lecteur DXF, vérifier unités mm et coordonnées finies.

### Reste explicitement HORS recette (différé, documenté)

Rendu canvas, CV contour, HEIC, PDF chantier multi-pages, pages mosaïque imprimées,
gabarit 1:1 PDF, PNG, persistance projet, partage, undo/redo, UI Atelier commerciale,
publication au catalogue.

### Interdits respectés

Pas de merge `main`, pas de déploiement, pas de publication au catalogue, `/outils/traces-preview`
reste interne/noindex, convergence des moteurs non entamée.
