"use client";

// Pas-à-pas générique pour le futur module "Tracés & Géométrie" (FIRST-FUNCTIONAL-LOT-V1 §10).
// Extraction du mode déjà existant dans ProCalculatorWorkspace.tsx (non modifié), généralisé à
// n'importe quel TraceModel.steps — jamais de dessin dupliqué : c'est TraceViewer qui lit
// `activeIndex` (via isEntityVisibleAtStep) pour la révélation progressive, ce composant ne
// contient aucune géométrie.
import type { SiteStep } from "@/lib/geometry/shape-model";
import { clampStepIndex, firstStepIndex, lastStepIndex, nextStepIndex, previousStepIndex, stepProgress } from "@/lib/geometry/trace-render";

export type TraceStepsProps = {
  steps: readonly SiteStep[];
  // null = "Voir tout" (aucune étape active, tout le tracé est affiché).
  activeIndex: number | null;
  onChangeIndex: (index: number | null) => void;
};

export function TraceSteps({ steps, activeIndex, onChangeIndex }: TraceStepsProps) {
  const total = steps.length;
  const showingAll = activeIndex === null;
  const index = activeIndex === null ? 0 : clampStepIndex(activeIndex, total);
  const step = total > 0 ? steps[index] : null;

  return (
    <div className="trace-steps">
      <div className="trace-steps-header">
        <p className="eyebrow">PAS-À-PAS</p>
        {!showingAll && total > 0 && (
          <div className="trace-steps-progress">
            <span>Étape {index + 1}/{total}</span>
            <progress value={stepProgress(index, total)} max={1} />
          </div>
        )}
      </div>

      {showingAll || !step ? (
        <p className="trace-steps-all">Tracé complet affiché — utilisez « Étape par étape » pour suivre la construction dans l&apos;ordre.</p>
      ) : (
        <div className="trace-steps-content">
          <h3>{step.title}</h3>
          <p>{step.instruction}</p>
          {step.measurements.length > 0 && (
            <div className="trace-steps-measurements">
              {step.measurements.map((value) => <span key={value}>{value}</span>)}
            </div>
          )}
        </div>
      )}

      <div className="trace-steps-actions">
        <button type="button" onClick={() => onChangeIndex(firstStepIndex())} disabled={showingAll && total === 0}>
          Retour au début
        </button>
        <button type="button" onClick={() => onChangeIndex(showingAll ? firstStepIndex() : previousStepIndex(index, total))} disabled={!showingAll && index === 0}>
          ← Précédent
        </button>
        <button type="button" onClick={() => onChangeIndex(showingAll ? firstStepIndex() : nextStepIndex(index, total))} disabled={!showingAll && index === lastStepIndex(total)}>
          Suivant →
        </button>
        <button type="button" aria-pressed={showingAll} className={showingAll ? "active" : ""} onClick={() => onChangeIndex(null)}>
          Voir tout
        </button>
      </div>
    </div>
  );
}
