"use client";

/**
 * Barre d'outils Atelier (§9).
 *
 * Onze entrées — Sélection, Édition, Déplacer, Point, Segment, Polyligne, Grille, Recentrer,
 * Propriétés, Annuler, Rétablir. Les outils encore absents (cote, LED, spot, cercle libre…) ne
 * sont toujours pas déclarés ici : ils arriveront avec le lot qui les rendra utilisables.
 *
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §4/§14 : les trois outils de création sont regroupés après
 * « Déplacer », donc dans la moitié droite de la barre. Sur un téléphone tenu à une main, c'est
 * la zone la plus sûre du pouce — et ce sont les boutons les plus sollicités pendant un tracé.
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
  /** Le projet accepte-t-il une primitive libre (mode tracé libre, §2/§4) ? */
  drawingAvailable?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  onSelectTool: (tool: AtelierTool) => void;
  onAction: (action: ToolbarActionId) => void;
};

export function AtelierToolbar({
  state,
  hasSelection = false,
  editingAvailable = false,
  drawingAvailable = false,
  canUndo = false,
  canRedo = false,
  onSelectTool,
  onAction,
}: AtelierToolbarProps) {
  const buttons = buildToolbarModel(state, { hasSelection, editingAvailable, drawingAvailable, canUndo, canRedo });

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
