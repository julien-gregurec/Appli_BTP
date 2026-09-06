"use client";

/**
 * §12 — les quatre modes d'affichage de l'Atelier.
 *
 * Quatre grands boutons plutôt qu'un menu : sur chantier, on change de mode gant à la main,
 * sans viser. Chaque bouton porte son intention en clair — l'artisan ne devrait jamais avoir
 * à essayer un mode pour découvrir ce qu'il montre.
 */

import { WORKSHOP_MODES, type WorkshopMode } from "./workshop-model";
import styles from "./workshop.module.css";

export type ModeSwitcherProps = {
  mode: WorkshopMode;
  onChange: (mode: WorkshopMode) => void;
};

export function ModeSwitcher({ mode, onChange }: ModeSwitcherProps) {
  return (
    <div className={styles.modes} role="group" aria-label="Mode d’affichage">
      {WORKSHOP_MODES.map((item) => (
        <button
          key={item.id}
          type="button"
          className={styles.modeButton}
          aria-pressed={item.id === mode}
          onClick={() => onChange(item.id)}
        >
          <b>{item.label}</b>
          <small>{item.hint}</small>
        </button>
      ))}
    </div>
  );
}
