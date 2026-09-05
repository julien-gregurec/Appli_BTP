"use client";

/**
 * Barre d'outils Atelier (§9).
 *
 * Huit entrées — Sélection, Édition, Déplacer, Grille, Recentrer, Propriétés, Annuler,
 * Rétablir — conformément à la consigne « ne pas afficher 15 boutons ». Les outils encore
 * absents ne sont pas déclarés ici : ils arriveront avec le lot qui les rendra utilisables.
 *
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 §8 : « Annuler » et « Rétablir » sont désactivés tant qu'il
 * n'y a rien à annuler ni à rétablir, plutôt que masqués — un bouton qui disparaît déplace
 * toute la barre sous le doigt entre deux gestes.
 *
 * L'état et les libellés viennent de `toolbar-model` (pur, testé) : ce composant ne fait que
 * rendre. `aria-pressed` sur les bascules, `aria-label` partout (§15).
 */

import { buildToolbarModel, type AtelierTool, type ToolbarActionId, type ToolbarState } from "./toolbar-model";
import styles from "./viewport.module.css";

export type AtelierToolbarProps = {
  state: ToolbarState;
  hasSelection?: boolean;
  /** Le modèle courant publie-t-il au moins une poignée éditable ? */
  editingAvailable?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onSelectTool: (tool: AtelierTool) => void;
  onAction: (action: ToolbarActionId) => void;
};

export function AtelierToolbar({
  state,
  hasSelection = false,
  editingAvailable = false,
  canUndo = false,
  canRedo = false,
  onSelectTool,
  onAction,
}: AtelierToolbarProps) {
  const buttons = buildToolbarModel(state, { hasSelection, editingAvailable, canUndo, canRedo });

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
