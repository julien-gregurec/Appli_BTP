"use client";

/**
 * §17 — calques de l'affichage.
 *
 * Ne sont proposés que les calques réellement alimentés par la géométrie du moteur (voir
 * `WORKSHOP_LAYERS`). Le verrouillage n'apparaît pas : rien n'est éditable dans cet écran,
 * un cadenas n'y protégerait de rien.
 */

import { WORKSHOP_LAYERS, type WorkshopLayerId, type WorkshopLayers } from "./workshop-model";
import styles from "./workshop.module.css";

export type LayersPanelProps = {
  layers: WorkshopLayers;
  onToggle: (layer: WorkshopLayerId) => void;
};

export function LayersPanel({ layers, onToggle }: LayersPanelProps) {
  return (
    <>
      <p className={styles.hint}>
        Le mode d’affichage règle ces calques d’un coup. Vous pouvez ensuite en allumer ou en éteindre un
        librement — changer de mode repart du réglage du mode.
      </p>
      <div className={styles.toggles}>
        {WORKSHOP_LAYERS.map((layer) => (
          <button
            key={layer.id}
            type="button"
            className={styles.toggle}
            aria-pressed={layers[layer.id]}
            onClick={() => onToggle(layer.id)}
          >
            <span className={styles.dot} aria-hidden="true" />
            {layer.label}
          </button>
        ))}
      </div>
    </>
  );
}
