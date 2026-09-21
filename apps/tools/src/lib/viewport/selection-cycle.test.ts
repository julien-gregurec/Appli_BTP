/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §7/§14 — cycle de sélection.
 */

import { describe, expect, it } from "vitest";
import {
  advanceSelectionCycle,
  cycleAnchorPx,
  CYCLE_ANCHOR_PX,
  IDLE_SELECTION_CYCLE,
  resetSelectionCycle,
  TOUCH_CYCLE_ANCHOR_PX,
  type SelectionCycleState,
} from "./selection-cycle";

const KEY = "projet::rosette-6";
const CANDIDATES = ["point-o", "axe-h", "cercle-1"];

function click(state: SelectionCycleState, x: number, y: number, candidates = CANDIDATES, key = KEY) {
  return advanceSelectionCycle(state, { key, point: { x, y }, candidates, anchorPx: CYCLE_ANCHOR_PX });
}

describe("cycle de sélection — avancement (§7)", () => {
  it("le premier clic prend la tête de liste", () => {
    const step = click(IDLE_SELECTION_CYCLE, 100, 100);
    expect(step.entityId).toBe("point-o");
    expect(step.cycled).toBe(false);
  });

  it("les clics répétés au même endroit descendent d'un cran, puis rebouclent", () => {
    let state = IDLE_SELECTION_CYCLE;
    const taken: (string | null)[] = [];
    for (let index = 0; index < 5; index += 1) {
      const step = click(state, 100, 100);
      state = step.state;
      taken.push(step.entityId);
    }
    expect(taken).toEqual(["point-o", "axe-h", "cercle-1", "point-o", "axe-h"]);
  });

  it("un clic dans le rayon d'ancrage continue le cycle malgré une légère dérive", () => {
    const first = click(IDLE_SELECTION_CYCLE, 100, 100);
    const second = click(first.state, 103, 101);
    expect(second.entityId).toBe("axe-h");
    expect(second.cycled).toBe(true);
  });

  it("l'ancre ne dérive pas : trois clics décalés d'un pixel restent le même cycle", () => {
    let state = IDLE_SELECTION_CYCLE;
    const taken: (string | null)[] = [];
    for (let index = 0; index < 4; index += 1) {
      const step = click(state, 100 + index, 100);
      state = step.state;
      taken.push(step.entityId);
    }
    expect(taken).toEqual(["point-o", "axe-h", "cercle-1", "point-o"]);
    expect(state.anchor).toEqual({ x: 100, y: 100 });
  });
});

describe("cycle de sélection — réinitialisation (§7)", () => {
  it("un clic éloigné ouvre un nouveau cycle", () => {
    const first = click(IDLE_SELECTION_CYCLE, 100, 100);
    const far = click(first.state, 400, 400);
    expect(far.entityId).toBe("point-o");
    expect(far.cycled).toBe(false);
  });

  it("un changement de contexte (projet, modèle, mode) ouvre un nouveau cycle", () => {
    const first = click(IDLE_SELECTION_CYCLE, 100, 100);
    const other = click(first.state, 100, 100, CANDIDATES, "projet::star-5");
    expect(other.entityId).toBe("point-o");
    expect(other.cycled).toBe(false);
  });

  it("une liste de candidats différente ouvre un nouveau cycle", () => {
    const first = click(IDLE_SELECTION_CYCLE, 100, 100);
    const changed = click(first.state, 100, 100, ["cercle-2", "axe-h"]);
    expect(changed.entityId).toBe("cercle-2");
    expect(changed.cycled).toBe(false);
  });

  it("un clic à vide ferme le cycle et ne désigne rien", () => {
    const first = click(IDLE_SELECTION_CYCLE, 100, 100);
    const empty = click(first.state, 100, 100, []);
    expect(empty.entityId).toBeNull();
    expect(empty.state.anchor).toBeNull();
    expect(empty.state.candidates).toEqual([]);
  });

  it("après un clic à vide, le clic suivant au même endroit repart de la tête", () => {
    const first = click(IDLE_SELECTION_CYCLE, 100, 100);
    const empty = click(first.state, 100, 100, []);
    const again = click(empty.state, 100, 100);
    expect(again.entityId).toBe("point-o");
  });

  it("resetSelectionCycle ferme le cycle en conservant le contexte", () => {
    const first = click(IDLE_SELECTION_CYCLE, 100, 100);
    const reset = resetSelectionCycle(KEY);
    expect(reset.anchor).toBeNull();
    expect(reset.key).toBe(KEY);
    expect(click(reset, 100, 100).entityId).toBe("point-o");
    expect(first.state.anchor).not.toBeNull();
  });
});

describe("cycle de sélection — finesse du pointeur (§9)", () => {
  it("le rayon d'ancrage est plus généreux au doigt qu'à la souris", () => {
    expect(cycleAnchorPx("fine")).toBe(CYCLE_ANCHOR_PX);
    expect(cycleAnchorPx("coarse")).toBe(TOUCH_CYCLE_ANCHOR_PX);
    expect(TOUCH_CYCLE_ANCHOR_PX).toBeGreaterThan(CYCLE_ANCHOR_PX);
  });

  it("un appui reposé à 12 px continue le cycle au doigt, mais pas à la souris", () => {
    const first = advanceSelectionCycle(IDLE_SELECTION_CYCLE, {
      key: KEY,
      point: { x: 100, y: 100 },
      candidates: CANDIDATES,
      anchorPx: TOUCH_CYCLE_ANCHOR_PX,
    });
    const touch = advanceSelectionCycle(first.state, {
      key: KEY,
      point: { x: 112, y: 100 },
      candidates: CANDIDATES,
      anchorPx: TOUCH_CYCLE_ANCHOR_PX,
    });
    expect(touch.entityId).toBe("axe-h");

    const mouse = advanceSelectionCycle(first.state, {
      key: KEY,
      point: { x: 112, y: 100 },
      candidates: CANDIDATES,
      anchorPx: CYCLE_ANCHOR_PX,
    });
    expect(mouse.entityId).toBe("point-o");
  });

  it("un rayon d'ancrage nul ou non fini se dégrade en « strictement le même pixel »", () => {
    // Jamais en « n'importe où » : un rayon invalide doit resserrer le cycle, pas l'ouvrir.
    const first = advanceSelectionCycle(IDLE_SELECTION_CYCLE, { key: KEY, point: { x: 10, y: 10 }, candidates: CANDIDATES, anchorPx: 0 });
    const same = advanceSelectionCycle(first.state, { key: KEY, point: { x: 10, y: 10 }, candidates: CANDIDATES, anchorPx: Number.NaN });
    expect(same.entityId).toBe("axe-h");

    const shifted = advanceSelectionCycle(first.state, { key: KEY, point: { x: 11, y: 10 }, candidates: CANDIDATES, anchorPx: Number.NaN });
    expect(shifted.entityId).toBe("point-o");
    expect(shifted.cycled).toBe(false);
  });
});

describe("cycle de sélection — pureté", () => {
  it("l'état d'entrée n'est jamais muté", () => {
    const state = IDLE_SELECTION_CYCLE;
    click(state, 100, 100);
    expect(state).toEqual({ key: "", anchor: null, candidates: [], index: 0 });
  });

  it("la liste de candidats fournie n'est jamais conservée par référence", () => {
    const candidates = [...CANDIDATES];
    const step = click(IDLE_SELECTION_CYCLE, 100, 100, candidates);
    candidates.push("intrus");
    expect(step.state.candidates).toEqual(CANDIDATES);
  });
});
