import { describe, expect, it } from "vitest";
import {
  buildToolbarModel,
  canEditHandles,
  canSelectEntities,
  DEFAULT_TOOLBAR_STATE,
  selectTool,
  shouldPanOnBackgroundDrag,
  toggleGrid,
  toggleProperties,
} from "./toolbar-model";

describe("état initial", () => {
  it("démarre en déplacement, grille visible, propriétés fermées", () => {
    expect(DEFAULT_TOOLBAR_STATE).toEqual({ tool: "pan", gridVisible: true, propertiesOpen: false });
  });
});

describe("selectTool", () => {
  it("change d'outil", () => {
    expect(selectTool(DEFAULT_TOOLBAR_STATE, "select").tool).toBe("select");
  });

  it("renvoie la même référence si l'outil est déjà actif (pas de rendu inutile)", () => {
    expect(selectTool(DEFAULT_TOOLBAR_STATE, "pan")).toBe(DEFAULT_TOOLBAR_STATE);
  });

  it("ne touche ni à la grille ni au panneau", () => {
    const next = selectTool({ tool: "pan", gridVisible: false, propertiesOpen: true }, "select");
    expect(next.gridVisible).toBe(false);
    expect(next.propertiesOpen).toBe(true);
  });
});

describe("toggleGrid", () => {
  it("bascule dans les deux sens", () => {
    const off = toggleGrid(DEFAULT_TOOLBAR_STATE);
    expect(off.gridVisible).toBe(false);
    expect(toggleGrid(off).gridVisible).toBe(true);
  });

  it("ne change pas l'outil actif", () => {
    expect(toggleGrid({ ...DEFAULT_TOOLBAR_STATE, tool: "select" }).tool).toBe("select");
  });
});

describe("toggleProperties", () => {
  it("ouvre puis referme le panneau", () => {
    const open = toggleProperties(DEFAULT_TOOLBAR_STATE);
    expect(open.propertiesOpen).toBe(true);
    expect(toggleProperties(open).propertiesOpen).toBe(false);
  });
});

describe("gestes", () => {
  it("laisse toujours le pan disponible au doigt sur le fond", () => {
    expect(shouldPanOnBackgroundDrag()).toBe(true);
  });

  it("autorise la désignation en Sélection comme en Édition, jamais en Déplacer", () => {
    expect(canSelectEntities({ ...DEFAULT_TOOLBAR_STATE, tool: "select" })).toBe(true);
    expect(canSelectEntities({ ...DEFAULT_TOOLBAR_STATE, tool: "edit" })).toBe(true);
    expect(canSelectEntities({ ...DEFAULT_TOOLBAR_STATE, tool: "pan" })).toBe(false);
  });

  it("ne rend les poignées saisissables qu'en mode Édition", () => {
    expect(canEditHandles({ ...DEFAULT_TOOLBAR_STATE, tool: "edit" })).toBe(true);
    expect(canEditHandles({ ...DEFAULT_TOOLBAR_STATE, tool: "select" })).toBe(false);
    expect(canEditHandles({ ...DEFAULT_TOOLBAR_STATE, tool: "pan" })).toBe(false);
  });
});

describe("buildToolbarModel", () => {
  it("expose exactement les onze entrées de la barre, dans l'ordre", () => {
    // FREE-DRAWING §4 — les trois outils de création s'insèrent après « Déplacer », donc dans
    // la moitié droite de la barre : la zone la plus sûre du pouce sur un téléphone.
    expect(buildToolbarModel(DEFAULT_TOOLBAR_STATE).map((button) => button.id)).toEqual([
      "select",
      "edit",
      "pan",
      "point",
      "segment",
      "polyline",
      "grid",
      "recenter",
      "properties",
      "undo",
      "redo",
    ]);
  });

  it("reflète l'outil actif via aria-pressed", () => {
    const model = buildToolbarModel({ ...DEFAULT_TOOLBAR_STATE, tool: "select" });
    expect(model.find((button) => button.id === "select")?.pressed).toBe(true);
    expect(model.find((button) => button.id === "pan")?.pressed).toBe(false);
  });

  it("reflète l'état de la grille", () => {
    expect(buildToolbarModel({ ...DEFAULT_TOOLBAR_STATE, gridVisible: false }).find((b) => b.id === "grid")?.pressed).toBe(false);
  });

  it("laisse les commandes sans aria-pressed", () => {
    expect(buildToolbarModel(DEFAULT_TOOLBAR_STATE).find((button) => button.id === "recenter")?.pressed).toBeUndefined();
  });

  it("donne à chaque bouton un aria-label non vide", () => {
    for (const button of buildToolbarModel(DEFAULT_TOOLBAR_STATE)) {
      expect(button.ariaLabel.length).toBeGreaterThan(0);
    }
  });

  it("adapte le libellé de la grille à son état", () => {
    expect(buildToolbarModel(DEFAULT_TOOLBAR_STATE).find((b) => b.id === "grid")?.ariaLabel).toBe("Masquer la grille");
    expect(buildToolbarModel({ ...DEFAULT_TOOLBAR_STATE, gridVisible: false }).find((b) => b.id === "grid")?.ariaLabel).toBe("Afficher la grille");
  });

  it("désactive Propriétés tant que rien n'est sélectionné", () => {
    expect(buildToolbarModel(DEFAULT_TOOLBAR_STATE).find((b) => b.id === "properties")?.disabled).toBe(true);
    expect(buildToolbarModel(DEFAULT_TOOLBAR_STATE, { hasSelection: true }).find((b) => b.id === "properties")?.disabled).toBe(false);
  });

  it("laisse Propriétés actionnable quand le panneau est déjà ouvert (pour le refermer)", () => {
    const model = buildToolbarModel({ ...DEFAULT_TOOLBAR_STATE, propertiesOpen: true });
    expect(model.find((button) => button.id === "properties")?.disabled).toBe(false);
  });

  it("n'active jamais un bouton d'outil désactivé", () => {
    for (const button of buildToolbarModel(DEFAULT_TOOLBAR_STATE, { hasSelection: true })) {
      if (button.disabled) expect(button.pressed).not.toBe(true);
    }
  });

  /* ---- Édition, annulation, rétablissement (VERTEX-EDIT §8) ---- */

  it("désactive le mode Édition tant qu'aucune poignée n'est réglable", () => {
    expect(buildToolbarModel(DEFAULT_TOOLBAR_STATE).find((b) => b.id === "edit")?.disabled).toBe(true);
    expect(buildToolbarModel(DEFAULT_TOOLBAR_STATE, { editingAvailable: true }).find((b) => b.id === "edit")?.disabled).toBe(false);
  });

  it("dit pourquoi le mode Édition est indisponible", () => {
    const label = buildToolbarModel(DEFAULT_TOOLBAR_STATE).find((b) => b.id === "edit")?.ariaLabel ?? "";
    expect(label).toContain("aucun sommet réglable");
  });

  it("désactive Annuler et Rétablir quand l'historique est vide", () => {
    const model = buildToolbarModel(DEFAULT_TOOLBAR_STATE);
    expect(model.find((b) => b.id === "undo")?.disabled).toBe(true);
    expect(model.find((b) => b.id === "redo")?.disabled).toBe(true);
  });

  it("active Annuler et Rétablir indépendamment l'un de l'autre", () => {
    const undoOnly = buildToolbarModel(DEFAULT_TOOLBAR_STATE, { canUndo: true });
    expect(undoOnly.find((b) => b.id === "undo")?.disabled).toBe(false);
    expect(undoOnly.find((b) => b.id === "redo")?.disabled).toBe(true);

    const redoOnly = buildToolbarModel(DEFAULT_TOOLBAR_STATE, { canRedo: true });
    expect(redoOnly.find((b) => b.id === "undo")?.disabled).toBe(true);
    expect(redoOnly.find((b) => b.id === "redo")?.disabled).toBe(false);
  });

  it("annonce le raccourci clavier dans le libellé accessible", () => {
    const model = buildToolbarModel(DEFAULT_TOOLBAR_STATE, { canUndo: true, canRedo: true });
    expect(model.find((b) => b.id === "undo")?.ariaLabel).toContain("Ctrl+Z");
    expect(model.find((b) => b.id === "redo")?.ariaLabel).toContain("Ctrl+Maj+Z");
  });

  it("laisse Annuler et Rétablir sans aria-pressed : ce sont des commandes, pas des bascules", () => {
    const model = buildToolbarModel(DEFAULT_TOOLBAR_STATE, { canUndo: true, canRedo: true });
    expect(model.find((b) => b.id === "undo")?.pressed).toBeUndefined();
    expect(model.find((b) => b.id === "redo")?.pressed).toBeUndefined();
  });

  it("garde le mode Édition pressé quand il est actif et disponible", () => {
    const model = buildToolbarModel({ ...DEFAULT_TOOLBAR_STATE, tool: "edit" }, { editingAvailable: true });
    expect(model.find((b) => b.id === "edit")?.pressed).toBe(true);
    expect(model.find((b) => b.id === "select")?.pressed).toBe(false);
    expect(model.find((b) => b.id === "pan")?.pressed).toBe(false);
  });
});
