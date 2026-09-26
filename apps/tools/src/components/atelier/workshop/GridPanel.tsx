"use client";

/**
 * §16 — grille : marche/arrêt, pas usuels de chantier, pas personnalisé.
 *
 * Le pas retenu ici sert aussi à l'accrochage (le viewport le transmet à `snap`) : ce que
 * l'artisan voit et ce sur quoi le pointeur s'aligne restent une seule et même graduation.
 * Un pas trop fin pour le cadrage courant n'est pas dessiné — la barre d'état du plan le dit
 * alors explicitement, plutôt que d'afficher un pas invisible.
 */

import { useId, useState } from "react";
import {
  MAX_CUSTOM_GRID_STEP_MM,
  MIN_CUSTOM_GRID_STEP_MM,
  WORKSHOP_GRID_STEPS_MM,
  formatGridStep,
} from "@/lib/viewport/grid";
import styles from "./workshop.module.css";

export type GridPanelProps = {
  visible: boolean;
  stepMm: number | null;
  onToggleVisible: () => void;
  onChangeStep: (stepMm: number | null) => void;
};

export function GridPanel({ visible, stepMm, onToggleVisible, onChangeStep }: GridPanelProps) {
  const customId = useId();
  const [custom, setCustom] = useState("");

  const applyCustom = () => {
    const parsed = Number(custom.replace(",", "."));
    if (!Number.isFinite(parsed)) return;
    const bounded = Math.min(Math.max(parsed, MIN_CUSTOM_GRID_STEP_MM), MAX_CUSTOM_GRID_STEP_MM);
    onChangeStep(bounded);
    setCustom(String(bounded));
  };

  return (
    <>
      <div className={styles.toggles}>
        <button type="button" className={styles.toggle} aria-pressed={visible} onClick={onToggleVisible}>
          <span className={styles.dot} aria-hidden="true" />
          Afficher la grille
        </button>
      </div>

      <div className={styles.toggles} role="group" aria-label="Pas de la grille">
        <button type="button" className={styles.toggle} aria-pressed={stepMm === null} onClick={() => onChangeStep(null)}>
          <span className={styles.dot} aria-hidden="true" />
          Automatique
        </button>
        {WORKSHOP_GRID_STEPS_MM.map((step) => (
          <button
            key={step}
            type="button"
            className={styles.toggle}
            aria-pressed={stepMm === step}
            onClick={() => onChangeStep(step)}
          >
            <span className={styles.dot} aria-hidden="true" />
            {formatGridStep(step)}
          </button>
        ))}
      </div>

      <div className={styles.gridCustom}>
        <label htmlFor={customId}>Pas personnalisé (mm)</label>
        <input
          id={customId}
          type="number"
          inputMode="numeric"
          min={MIN_CUSTOM_GRID_STEP_MM}
          max={MAX_CUSTOM_GRID_STEP_MM}
          step={10}
          value={custom}
          placeholder="ex. 150"
          onChange={(event) => setCustom(event.target.value)}
          onBlur={applyCustom}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            applyCustom();
          }}
        />
        <button type="button" className={styles.toggle} onClick={applyCustom} disabled={custom.trim() === ""}>
          Appliquer
        </button>
      </div>

      <p className={styles.hint}>
        Le pas de la grille est aussi celui de l’accrochage affiché sous le pointeur. Automatique : le pas
        suit le zoom pour rester lisible.
      </p>
    </>
  );
}
