/**
 * ATELIER-RESOLVED-MODEL-VIEWPORT-INTEGRATION-V1 §2/§3/§4/§8 — raccord entre le modèle
 * résolu par Engine B et le viewport de l'Atelier.
 *
 * Ce module ne calcule AUCUNE géométrie et n'en corrige aucune. Il n'appelle pas le moteur :
 * il reçoit une `TracingModelResolution` déjà produite par `resolveTracingProjectModel` et se
 * contente de la présenter au viewport. C'est un point de passage volontairement étroit —
 * pur, synchrone, sans React — pour que la chaîne
 *
 *   `TracingProject` → `resolveTracingProjectModel` → `TraceModel` → `PlanScene`
 *
 * soit testable de bout en bout sans monter de composant.
 *
 * Aucun adaptateur de géométrie n'est nécessaire : `TraceModel extends ShapeGeometry`, et
 * `PlanScene` a été défini comme un sur-ensemble structurel de `ShapeGeometry`. Un modèle
 * résolu EST donc une scène — le « pont » se réduit à une lecture, jamais à une recopie de
 * points, de segments, d'arcs, d'ellipses, de polylignes ni de contours (§3).
 */

import type { SiteStep } from "../../../lib/geometry/shape-model";
import type { TraceModel } from "../../../lib/geometry/trace-model";
import type { TracingModelResolution } from "../../../lib/tracing/model-resolver";
import type { PlanScene } from "./plan-scene";

/**
 * Scène du viewport pour une résolution donnée — `null` dès que la géométrie n'existe pas
 * (`none`, `unknown-model`, `invalid-params`, `failed`). L'appelant affiche alors l'état UX
 * déjà prévu par `buildModelResolutionViewModel` : jamais d'écran vide, jamais d'exception.
 */
export function resolvedPlanScene(resolution: TracingModelResolution): PlanScene | null {
  return resolution.status === "resolved" ? resolution.model : null;
}

/**
 * §4 — identité de la vue. Le cadrage automatique ne doit repartir de zéro que sur un vrai
 * changement de sujet : autre projet, autre modèle. Les bornes en sont volontairement
 * ABSENTES, car elles bougent à chaque réglage de paramètre et refitteraient la vue à chaque
 * frappe (§5).
 */
export function atelierViewKey(projectId: string | undefined, modelSlug: string | undefined): string {
  return `${projectId ?? "sans-projet"}::${modelSlug ?? "sans-modele"}`;
}

/**
 * §8 — scène restreinte aux entités visibles d'une étape de chantier.
 *
 * `SiteStep.visibleEntityIds` est le mécanisme d'étapes DÉJÀ publié par `ShapeGeometry` : on
 * le lit, on n'en invente pas un autre. Une étape sans `visibleEntityIds` ne restreint rien
 * (comportement historique des 10 outils Pro, qui ne renseignent pas ce champ), et la scène
 * est alors renvoyée telle quelle — même référence, donc aucun rendu inutile.
 *
 * Les bornes ne sont jamais recalculées : filtrer la visibilité d'une étape ne doit pas
 * déplacer le cadrage, sans quoi le plan sauterait d'une étape à l'autre sur le chantier.
 */
export function planSceneForStep(scene: PlanScene, step: SiteStep | null | undefined): PlanScene {
  const visible = step?.visibleEntityIds;
  if (!visible || visible.length === 0) return scene;
  const keep = new Set(visible);
  const filter = <T extends { id: string }>(items: readonly T[] | undefined): readonly T[] | undefined =>
    items && items.filter((item) => keep.has(item.id));

  return {
    ...scene,
    points: filter(scene.points),
    segments: filter(scene.segments),
    constructionLines: filter(scene.constructionLines),
    arcs: filter(scene.arcs),
    circles: filter(scene.circles),
    ellipses: filter(scene.ellipses),
    polylines: filter(scene.polylines),
    polygons: filter(scene.polygons),
  };
}

/** Étape active d'un modèle résolu, bornée à la liste réelle — jamais d'index hors plage. */
export function stepAt(model: TraceModel, index: number | null): SiteStep | null {
  if (index === null || model.steps.length === 0) return null;
  return model.steps[Math.min(Math.max(index, 0), model.steps.length - 1)] ?? null;
}
