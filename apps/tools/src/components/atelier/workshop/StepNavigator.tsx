"use client";

/**
 * §13 — construction pas à pas, pensée pour être suivie sur le chantier lui-même.
 *
 * Le texte affiché est celui que le modèle publie (`SiteStep.title`, `instruction`,
 * `measurements`) : rien n'est reformulé, rien n'est complété. Les mesures d'une étape sont
 * mises en évidence parce que ce sont elles qu'on lit en tenant le mètre.
 *
 * Quand l'étape déclare des entités visibles, le plan est déjà restreint en amont
 * (`workshopScene`) : la navigation ne se contente pas de commenter, elle montre.
 */

import type { SiteStep } from "@/lib/geometry/shape-model";
import styles from "./workshop.module.css";

export type StepNavigatorProps = {
  step: SiteStep | null;
  progressLabel: string | null;
  canPrevious: boolean;
  canNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onExit: () => void;
  onStart: () => void;
  /** Nombre d'étapes publiées par le modèle : 0 = pas de pas-à-pas possible. */
  total: number;
};

export function StepNavigator({
  step,
  progressLabel,
  canPrevious,
  canNext,
  onPrevious,
  onNext,
  onExit,
  onStart,
  total,
}: StepNavigatorProps) {
  if (total === 0) {
    return <p className={styles.empty}>Ce modèle ne publie pas d’étapes de construction.</p>;
  }

  if (!step) {
    return (
      <div className={styles.stepper}>
        <p className={styles.hint}>
          {total} étapes de construction, à suivre une par une sur le plan. Le mode d’affichage passe en
          Construction et le plan ne montre que ce que l’étape concerne.
        </p>
        <div className={styles.stepNav}>
          <button type="button" className="primary" onClick={onStart}>
            Démarrer le pas à pas
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.stepper}>
      <p className={styles.stepProgress}>{progressLabel}</p>
      <h3 className={styles.stepTitle}>{step.title}</h3>
      {/*
        `aria-live` : à la lecture d'écran, avancer d'une étape doit annoncer la nouvelle
        consigne sans qu'il faille repartir à la recherche du texte.
      */}
      <p className={styles.stepInstruction} aria-live="polite">
        {step.instruction}
      </p>

      {step.measurements.length > 0 && (
        <ul className={styles.stepMeasures}>
          {step.measurements.map((measurement) => (
            <li key={measurement}>{measurement}</li>
          ))}
        </ul>
      )}

      <div className={styles.stepNav}>
        <button type="button" onClick={onPrevious} disabled={!canPrevious}>
          ← Étape précédente
        </button>
        <button type="button" className="primary" onClick={onNext} disabled={!canNext}>
          Étape suivante →
        </button>
        <button type="button" onClick={onExit}>
          Vue d’ensemble
        </button>
      </div>
    </div>
  );
}
