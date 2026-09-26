/**
 * État de la barre d'outils Atelier (§9), isolé du rendu pour rester testable.
 *
 * Trois outils de navigation — Sélection, Édition, Déplacer — et cinq commandes (Grille,
 * Recentrer, Propriétés, Annuler, Rétablir). Les outils encore absents (cote, LED, spot, cercle
 * libre…) ne sont toujours pas déclarés : ils arriveront avec le lot qui les rendra utilisables,
 * plutôt que de transformer la barre en mur de quinze boutons.
 *
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 §3/§8 — le mode « Édition » est ce qui fait apparaître les
 * poignées. C'est délibéré : afficher en permanence les sommets saisissables encombrerait le
 * plan et rendrait la lecture du tracé moins sûre sur un chantier. Le mode est aussi désactivé
 * quand aucune poignée n'existe (modèle non résolu, tracé sans modèle) — un mode qui ne fait
 * rien ne doit pas être proposé.
 *
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §4 — des outils de CRÉATION s'ajoutent : Point, Segment,
 * Polyligne, puis Contour (ATELIER-FREE-CONTOUR-AREA-V1 §3). Ils suivent la même règle que « Édition » : proposés seulement quand ils peuvent
 * agir, c'est-à-dire sur un projet en mode tracé libre (§2). Sur un tracé paramétrique ils
 * restent visibles mais désactivés, avec un libellé accessible qui dit pourquoi — les masquer
 * ferait changer la barre de taille d'un projet à l'autre, ce qui déplace les boutons sous le
 * doigt et fait douter de l'outil.
 */

import { FREE_DRAW_TOOLS, type FreeDrawTool } from "./free-draw-model";

export type AtelierTool = "select" | "edit" | "pan" | FreeDrawTool;

export type ToolbarActionId = "grid" | "recenter" | "properties" | "undo" | "redo";

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

/**
 * Désignation et retour visuel (survol, accrochage) : actifs en Sélection comme en Édition.
 * En Édition, désigner reste utile — c'est ce qui remplit le panneau propriétés pendant qu'on
 * règle la forme.
 */
export function canSelectEntities(state: ToolbarState): boolean {
  return state.tool === "select" || state.tool === "edit";
}

/** Les poignées ne sont saisissables — ni même visibles — qu'en mode Édition (§3). */
export function canEditHandles(state: ToolbarState): boolean {
  return state.tool === "edit";
}

/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §4 — outil de création actif, ou `null`.
 *
 * Une fonction plutôt qu'un drapeau : l'appelant a besoin de SAVOIR LEQUEL pour armer
 * l'automate de tracé, et un booléen l'obligerait à refaire le test juste après.
 */
export function freeDrawToolOf(state: ToolbarState): FreeDrawTool | null {
  return FREE_DRAW_TOOLS.includes(state.tool as FreeDrawTool) ? (state.tool as FreeDrawTool) : null;
}

/**
 * §5/§6 — le retour visuel d'accrochage est actif pendant la création aussi.
 *
 * C'est même là qu'il compte le plus : accrocher pendant la SÉLECTION ne fait que renseigner,
 * tandis qu'accrocher pendant la création décide de la coordonnée qui sera enregistrée. La
 * croix d'accrochage doit donc être visible au moment de poser le sommet, pas seulement en
 * survolant un tracé déjà fait.
 */
export function showsSnapFeedback(state: ToolbarState): boolean {
  return canSelectEntities(state) || freeDrawToolOf(state) !== null;
}

export type ToolbarCapabilities = {
  hasSelection?: boolean;
  /** Le modèle courant publie-t-il au moins une poignée éditable ? */
  editingAvailable?: boolean;
  /** Le projet est-il en mode tracé libre, donc capable d'accueillir une primitive (§2/§4) ? */
  drawingAvailable?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
};

const DRAW_TOOL_LABELS: Readonly<Record<FreeDrawTool, { label: string; ariaLabel: string }>> = {
  point: { label: "Point", ariaLabel: "Outil point libre" },
  segment: { label: "Segment", ariaLabel: "Outil segment libre" },
  polyline: { label: "Polyligne", ariaLabel: "Outil polyligne libre" },
  polygon: { label: "Contour", ariaLabel: "Outil contour libre fermé" },
};

/** §4 — motif unique du refus, pour que les trois outils disent la même chose. */
const NO_FREE_DRAWING = "ce tracé suit un modèle paramétrique";

export function buildToolbarModel(state: ToolbarState, options?: ToolbarCapabilities): readonly ToolbarButtonModel[] {
  const hasSelection = options?.hasSelection ?? false;
  const editingAvailable = options?.editingAvailable ?? false;
  const drawingAvailable = options?.drawingAvailable ?? false;
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
      id: "edit",
      label: "Édition",
      ariaLabel: editingAvailable
        ? "Outil édition des sommets"
        : "Outil édition des sommets — aucun sommet réglable sur ce tracé",
      pressed: state.tool === "edit",
      disabled: !editingAvailable,
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
    ...FREE_DRAW_TOOLS.map((tool) => ({
      id: tool,
      label: DRAW_TOOL_LABELS[tool].label,
      ariaLabel: drawingAvailable
        ? DRAW_TOOL_LABELS[tool].ariaLabel
        : `${DRAW_TOOL_LABELS[tool].ariaLabel} — indisponible : ${NO_FREE_DRAWING}`,
      pressed: state.tool === tool,
      disabled: !drawingAvailable,
      kind: "tool" as const,
    })),
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
    {
      id: "undo",
      label: "Annuler",
      // Le raccourci est annoncé dans le libellé accessible : sans lui, un utilisateur au
      // clavier n'a aucun moyen d'apprendre qu'il existe (§8).
      ariaLabel: "Annuler la dernière modification (Ctrl+Z)",
      disabled: !(options?.canUndo ?? false),
      kind: "command",
    },
    {
      id: "redo",
      label: "Rétablir",
      ariaLabel: "Rétablir la modification annulée (Ctrl+Maj+Z)",
      disabled: !(options?.canRedo ?? false),
      kind: "command",
    },
  ];
}
