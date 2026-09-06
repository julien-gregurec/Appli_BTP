"use client";

/**
 * §17 — calques de l'affichage.
 *
 * Ne sont proposés que les calques réellement alimentés par la géométrie du moteur (voir
 * `WORKSHOP_LAYERS`).
 *
 * WORKSHOP-UI-CANONICAL-V2 §11 — `available` restreint encore la liste à ce que la SOURCE
 * affichée alimente : un projet paramétrique n'a pas de tracé libre, un tracé libre ne publie
 * ni axes, ni construction, ni cotes. Un interrupteur qui ne masquerait rien serait un bouton
 * mort (§22).
 */

import { WORKSHOP_LAYERS, type WorkshopLayerId, type WorkshopLayers } from "./workshop-model";
import styles from "./workshop.module.css";

export type LayersPanelProps = {
  layers: WorkshopLayers;
  /** Calques réellement alimentés par la source affichée, dans l'ordre de `WORKSHOP_LAYERS`. */
  available: readonly WorkshopLayerId[];
  onToggle: (layer: WorkshopLayerId) => void;
};

export function LayersPanel({ layers, available, onToggle }: LayersPanelProps) {
  const offered = WORKSHOP_LAYERS.filter((layer) => available.includes(layer.id));
  if (offered.length === 0) {
    return <p className={styles.empty}>Ce tracé ne porte encore aucune géométrie : il n’y a aucun calque à régler.</p>;
  }
  return (
    <>
      <p className={styles.hint}>
        Le mode d’affichage règle ces calques d’un coup. Vous pouvez ensuite en allumer ou en éteindre un
        librement — changer de mode repart du réglage du mode.
      </p>
      <div className={styles.toggles}>
        {offered.map((layer) => (
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
