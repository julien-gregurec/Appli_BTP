/**
 * État de la barre d'outils Atelier (§9), isolé du rendu pour rester testable.
 *
 * Ce lot n'expose que les outils réellement opérationnels — Sélection et Pan — plus trois
 * commandes (Grille, Recentrer, Propriétés). Les outils d'édition à venir (contour, cote, LED,
 * spot…) sont déclarés désactivés : ils apparaissent au bon endroit sans laisser croire qu'ils
 * fonctionnent, et sans transformer la barre en mur de quinze boutons.
 */

export type AtelierTool = "select" | "pan";

export type ToolbarActionId = "grid" | "recenter" | "properties";

export type ToolbarState = {
  tool: AtelierTool;
  gridVisible: boolean;
  propertiesOpen: boolean;
};

export type ToolbarButtonModel = {
  id: AtelierTool | ToolbarActionId;
  label: string;
  /** Libellé lu par les lecteurs d'écran (§15). */
  ariaLabel: string;
  /** `aria-pressed` pour les bascules ; `undefined` pour les commandes ponctuelles (§15). */
  pressed?: boolean;
  disabled: boolean;
  kind: "tool" | "toggle" | "command";
};

export const DEFAULT_TOOLBAR_STATE: ToolbarState = {
  tool: "pan",
  gridVisible: true,
  propertiesOpen: false,
};

export function selectTool(state: ToolbarState, tool: AtelierTool): ToolbarState {
  return state.tool === tool ? state : { ...state, tool };
}

export function toggleGrid(state: ToolbarState): ToolbarState {
  return { ...state, gridVisible: !state.gridVisible };
}

export function toggleProperties(state: ToolbarState): ToolbarState {
  return { ...state, propertiesOpen: !state.propertiesOpen };
}

/**
 * Un geste à un doigt sur le fond fait toujours du pan, quel que soit l'outil : sur mobile,
 * exiger de repasser en mode Pan pour déplacer le plan est l'ergonomie la plus rejetée. En mode
 * Sélection, seul un appui sur une entité déclenche la sélection (§11).
 */
export function shouldPanOnBackgroundDrag(): boolean {
  return true;
}

export function canSelectEntities(state: ToolbarState): boolean {
  return state.tool === "select";
}

export function buildToolbarModel(state: ToolbarState, options?: { hasSelection?: boolean }): readonly ToolbarButtonModel[] {
  const hasSelection = options?.hasSelection ?? false;
  return [
    {
      id: "select",
      label: "Sélection",
      ariaLabel: "Outil sélection",
      pressed: state.tool === "select",
      disabled: false,
      kind: "tool",
    },
    {
      id: "pan",
      label: "Déplacer",
      ariaLabel: "Outil déplacement du plan",
      pressed: state.tool === "pan",
      disabled: false,
      kind: "tool",
    },
    {
      id: "grid",
      label: "Grille",
      ariaLabel: state.gridVisible ? "Masquer la grille" : "Afficher la grille",
      pressed: state.gridVisible,
      disabled: false,
      kind: "toggle",
    },
    {
      id: "recenter",
      label: "Recentrer",
      ariaLabel: "Recentrer le plan",
      disabled: false,
      kind: "command",
    },
    {
      id: "properties",
      label: "Propriétés",
      ariaLabel: state.propertiesOpen ? "Fermer les propriétés" : "Ouvrir les propriétés",
      pressed: state.propertiesOpen,
      disabled: !hasSelection && !state.propertiesOpen,
      kind: "toggle",
    },
  ];
}
