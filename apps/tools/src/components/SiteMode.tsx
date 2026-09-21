"use client";

// Mode chantier compact et réutilisable (FIRST-FUNCTIONAL-LOT-V1 §11). Aucun texte figé propre
// à un modèle précis : tout provient de TraceModel.steps (title/instruction/measurements/
// pointIds), exactement comme le mode déjà en Production dans ProCalculatorWorkspace.tsx.
// Gros boutons, texte court, contraste fort — utilisable au soleil et avec des gants.
import type { SiteStep } from "@/lib/geometry/shape-model";
import { clampStepIndex, lastStepIndex, nextStepIndex, previousStepIndex, stepProgress } from "@/lib/geometry/trace-render";

export type SiteModeProps = {
  steps: readonly SiteStep[];
  activeIndex: number;
  onChangeIndex: (index: number) => void;
};

export function SiteMode({ steps, activeIndex, onChangeIndex }: SiteModeProps) {
  const total = steps.length;
  const index = clampStepIndex(activeIndex, total);
  const step = total > 0 ? steps[index] : null;
  if (!step) return <p className="site-mode-empty">Aucune étape chantier disponible pour ce tracé.</p>;

  return (
    <div className="site-mode">
      <div className="site-mode-progress">
        <span>ÉTAPE {index + 1} / {total}</span>
        <progress value={stepProgress(index, total)} max={1} />
      </div>
      <h2 className="site-mode-title">{step.title}</h2>
      {step.pointIds.length > 0 && (
        <p className="site-mode-points">
          <strong>Repères :</strong> {step.pointIds.join(", ")}
        </p>
      )}
      {step.measurements.length > 0 && (
        <div className="site-mode-measurements">
          {step.measurements.map((value) => <span key={value}>{value}</span>)}
        </div>
      )}
      <p className="site-mode-action">
        <strong>Action :</strong> {step.instruction}
      </p>
      <div className="site-mode-actions">
        <button type="button" onClick={() => onChangeIndex(previousStepIndex(index, total))} disabled={index === 0}>
          ← Précédent
        </button>
        <button type="button" onClick={() => onChangeIndex(nextStepIndex(index, total))} disabled={index === lastStepIndex(total)}>
          Suivant →
        </button>
      </div>
    </div>
  );
}
