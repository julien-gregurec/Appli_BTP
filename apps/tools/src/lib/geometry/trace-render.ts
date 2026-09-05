// Logique pure (sans React, testable sans DOM) partagée par TraceViewer/TraceSteps/SiteMode
// (FIRST-FUNCTIONAL-LOT-V1 §12/§19). Aucune géométrie n'est dupliquée ici : ces fonctions ne
// font que filtrer/naviguer dans les entités et étapes déjà présentes dans un TraceModel.
import type { SiteStep } from "./shape-model";

// Sans étape active (aperçu complet, "Voir tout"), une entité est toujours visible : le
// comportement des 10 outils Pro existants (dont les steps ne renseignent jamais
// visibleEntityIds) reste donc "tout afficher", inchangé.
export function isEntityVisibleAtStep(entityId: string, step: SiteStep | null | undefined): boolean {
  if (!step?.visibleEntityIds) return true;
  return step.visibleEntityIds.includes(entityId);
}

export function isEntityHighlightedAtStep(entityId: string, step: SiteStep | null | undefined): boolean {
  return Boolean(step?.highlightEntityIds?.includes(entityId));
}

export function clampStepIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.trunc(index), total - 1));
}

export function nextStepIndex(current: number, total: number): number {
  return clampStepIndex(current + 1, total);
}

export function previousStepIndex(current: number, total: number): number {
  return clampStepIndex(current - 1, total);
}

export function firstStepIndex(): number {
  return 0;
}

export function lastStepIndex(total: number): number {
  return clampStepIndex(total - 1, total);
}

export function stepProgress(current: number, total: number): number {
  if (total <= 0) return 0;
  return (clampStepIndex(current, total) + 1) / total;
}
