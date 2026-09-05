import { describe, expect, it } from "vitest";
import {
  buildToolbarModel,
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

  it("n'autorise la sélection d'entité qu'en mode Sélection", () => {
    expect(canSelectEntities({ ...DEFAULT_TOOLBAR_STATE, tool: "select" })).toBe(true);
    expect(canSelectEntities({ ...DEFAULT_TOOLBAR_STATE, tool: "pan" })).toBe(false);
  });
});

describe("buildToolbarModel", () => {
  it("expose exactement les cinq entrées du lot", () => {
    expect(buildToolbarModel(DEFAULT_TOOLBAR_STATE).map((button) => button.id)).toEqual([
      "select",
      "pan",
      "grid",
      "recenter",
      "properties",
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
});
