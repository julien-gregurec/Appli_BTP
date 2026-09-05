"use client";

/**
 * Barre d'outils Atelier (§9).
 *
 * Cinq entrées seulement — Sélection, Déplacer, Grille, Recentrer, Propriétés — conformément à
 * la consigne « ne pas afficher 15 boutons ». Les futurs outils d'édition ne sont pas déclarés
 * ici : ils arriveront avec le lot qui les rendra réellement utilisables.
 *
 * L'état et les libellés viennent de `toolbar-model` (pur, testé) : ce composant ne fait que
 * rendre. `aria-pressed` sur les bascules, `aria-label` partout (§15).
 */

import { buildToolbarModel, type AtelierTool, type ToolbarActionId, type ToolbarState } from "./toolbar-model";
import styles from "./viewport.module.css";

export type AtelierToolbarProps = {
  state: ToolbarState;
  hasSelection?: boolean;
  onSelectTool: (tool: AtelierTool) => void;
  onAction: (action: ToolbarActionId) => void;
};

export function AtelierToolbar({ state, hasSelection = false, onSelectTool, onAction }: AtelierToolbarProps) {
  const buttons = buildToolbarModel(state, { hasSelection });

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Outils de l’atelier">
      {buttons.map((button) => (
        <button
          key={button.id}
          type="button"
          className={styles.toolButton}
          aria-label={button.ariaLabel}
          aria-pressed={button.pressed}
          disabled={button.disabled}
          onClick={() =>
            button.kind === "tool" ? onSelectTool(button.id as AtelierTool) : onAction(button.id as ToolbarActionId)
          }
        >
          {button.label}
        </button>
      ))}
    </div>
  );
}
