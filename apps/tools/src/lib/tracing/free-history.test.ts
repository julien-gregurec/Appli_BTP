/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §9 — annulation et rétablissement du tracé libre.
 *
 * Ce qui est vérifié ici n'est pas « la pile se remplit », mais que **rejouer une opération à
 * l'envers redonne exactement le tracé d'avant** — y compris l'ORDRE des entités, qui décide
 * de l'ordre de rendu et de celui de la table de report.
 */

import { describe, expect, it } from "vitest";
import {
  EMPTY_FREE_GEOMETRY,
  FREE_GEOMETRY_VERSION,
  removeFreeEntities,
  validateFreeGeometry,
  type FreeEntity,
  type FreeGeometry,
} from "./free-geometry";
import {
  EMPTY_FREE_HISTORY,
  FREE_HISTORY_LIMIT,
  applyFreeOperation,
  canRedoFree,
  canUndoFree,
  isNoopFreeOperation,
  pushFreeHistory,
  redoFreeHistory,
  revertFreeOperation,
  undoFreeHistory,
  type FreeEditOperation,
  type FreeHistory,
} from "./free-history";

const POINT: FreeEntity = { id: "pt-1", kind: "point", points: [{ x: 10, y: 20 }] };
const SEGMENT: FreeEntity = {
  id: "sg-1",
  kind: "segment",
  points: [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
  ],
};
const POLYLINE: FreeEntity = {
  id: "pl-1",
  kind: "polyline",
  points: [
    { x: 0, y: 500 },
    { x: 200, y: 500 },
    { x: 200, y: 700 },
  ],
};

function geometryOf(...entities: FreeEntity[]): FreeGeometry {
  return validateFreeGeometry({ version: FREE_GEOMETRY_VERSION, entities });
}

/** L'état que tient l'écran : tracé + pile. Miroir fidèle de `useFreeDrawing`, sans React. */
function board(initial: FreeGeometry = EMPTY_FREE_GEOMETRY) {
  let geometry = initial;
  let history: FreeHistory = EMPTY_FREE_HISTORY;

  return {
    get geometry() {
      return geometry;
    },
    get history() {
      return history;
    },
    get ids() {
      return geometry.entities.map((entity) => entity.id);
    },
    commit(operation: FreeEditOperation, label = "op", source = "test", coalesce = false) {
      geometry = applyFreeOperation(geometry, operation);
      history = pushFreeHistory(history, { label, source, coalesce, operation });
    },
    undo() {
      const played = undoFreeHistory(history, geometry);
      if (!played) return null;
      geometry = played.geometry;
      history = played.history;
      return played.label;
    },
    redo() {
      const played = redoFreeHistory(history, geometry);
      if (!played) return null;
      geometry = played.geometry;
      history = played.history;
      return played.label;
    },
  };
}

describe("opérations (§9)", () => {
  it("crée puis annule un point, un segment et une polyligne", () => {
    const state = board();
    state.commit({ kind: "create", entity: POINT });
    state.commit({ kind: "create", entity: SEGMENT });
    state.commit({ kind: "create", entity: POLYLINE });
    expect(state.ids).toEqual(["pt-1", "sg-1", "pl-1"]);

    state.undo();
    expect(state.ids).toEqual(["pt-1", "sg-1"]);
    state.undo();
    state.undo();
    expect(state.geometry.entities).toHaveLength(0);
    expect(canUndoFree(state.history)).toBe(false);
    expect(canRedoFree(state.history)).toBe(true);

    state.redo();
    state.redo();
    state.redo();
    expect(state.ids).toEqual(["pt-1", "sg-1", "pl-1"]);
  });

  it("restaure une suppression multiple à son rang exact", () => {
    const initial = geometryOf(POINT, SEGMENT, POLYLINE);
    const state = board(initial);
    const { removed } = removeFreeEntities(initial, ["pt-1", "pl-1"]);
    state.commit({ kind: "delete", removed });
    expect(state.ids).toEqual(["sg-1"]);

    state.undo();
    // L'ordre compte : il décide du rendu et de la table de report.
    expect(state.geometry).toEqual(initial);
  });

  it("annule un déplacement de sommet en revenant à la position d'avant", () => {
    const state = board(geometryOf(SEGMENT));
    state.commit({
      kind: "move-vertex",
      entityId: "sg-1",
      index: 1,
      before: { x: 100, y: 100 },
      after: { x: 250, y: 40 },
    });
    expect(state.geometry.entities[0].points[1]).toEqual({ x: 250, y: 40 });
    state.undo();
    expect(state.geometry.entities[0].points[1]).toEqual({ x: 100, y: 100 });
    state.redo();
    expect(state.geometry.entities[0].points[1]).toEqual({ x: 250, y: 40 });
  });

  it("n'empile rien pour une opération qui ne change rien", () => {
    const state = board(geometryOf(SEGMENT));
    state.commit({
      kind: "move-vertex",
      entityId: "sg-1",
      index: 1,
      before: { x: 100, y: 100 },
      after: { x: 100, y: 100 },
    });
    expect(state.history.past).toHaveLength(0);
    expect(isNoopFreeOperation({ kind: "delete", removed: [] })).toBe(true);
  });

  it("rend `null` quand il n'y a rien à annuler ni à rétablir", () => {
    expect(undoFreeHistory(EMPTY_FREE_HISTORY, EMPTY_FREE_GEOMETRY)).toBeNull();
    expect(redoFreeHistory(EMPTY_FREE_HISTORY, EMPTY_FREE_GEOMETRY)).toBeNull();
  });
});

describe("pile (§9)", () => {
  it("invalide le futur dès qu'une nouvelle action est jouée", () => {
    const state = board();
    state.commit({ kind: "create", entity: POINT }, "point");
    state.commit({ kind: "create", entity: SEGMENT }, "segment");
    state.undo();
    expect(canRedoFree(state.history)).toBe(true);
    state.commit({ kind: "create", entity: POLYLINE }, "polyligne");
    expect(canRedoFree(state.history)).toBe(false);
    expect(state.ids).toEqual(["pt-1", "pl-1"]);
  });

  it("fusionne deux déplacements consécutifs du même sommet, en gardant la position initiale", () => {
    const state = board(geometryOf(SEGMENT));
    state.commit(
      { kind: "move-vertex", entityId: "sg-1", index: 1, before: { x: 100, y: 100 }, after: { x: 150, y: 100 } },
      "sommet",
      "vertex:sg-1:1",
      true,
    );
    state.commit(
      { kind: "move-vertex", entityId: "sg-1", index: 1, before: { x: 150, y: 100 }, after: { x: 300, y: 100 } },
      "sommet",
      "vertex:sg-1:1",
      true,
    );
    expect(state.history.past).toHaveLength(1);
    state.undo();
    // Une seule annulation ramène à la position d'AVANT le premier déplacement.
    expect(state.geometry.entities[0].points[1]).toEqual({ x: 100, y: 100 });
  });

  it("ne fusionne jamais deux gestes de sommets différents", () => {
    const state = board(geometryOf(POLYLINE));
    state.commit(
      { kind: "move-vertex", entityId: "pl-1", index: 0, before: { x: 0, y: 500 }, after: { x: 50, y: 500 } },
      "s0",
      "vertex:pl-1:0",
      true,
    );
    state.commit(
      { kind: "move-vertex", entityId: "pl-1", index: 1, before: { x: 200, y: 500 }, after: { x: 250, y: 500 } },
      "s1",
      "vertex:pl-1:1",
      true,
    );
    expect(state.history.past).toHaveLength(2);
  });

  it("borne la profondeur de la pile", () => {
    let history: FreeHistory = EMPTY_FREE_HISTORY;
    for (let index = 0; index < FREE_HISTORY_LIMIT + 25; index += 1) {
      history = pushFreeHistory(history, {
        label: `op-${index}`,
        source: `s-${index}`,
        coalesce: false,
        operation: {
          kind: "create",
          entity: { id: `pt-${index + 1}`, kind: "point", points: [{ x: index, y: 0 }] },
        },
      });
    }
    expect(history.past).toHaveLength(FREE_HISTORY_LIMIT);
    expect(history.past[0].label).toBe("op-25");
  });
});

describe("réversibilité", () => {
  it("revert ∘ apply est l'identité, sur les trois natures d'opération", () => {
    const initial = geometryOf(POINT, SEGMENT, POLYLINE);
    const { removed } = removeFreeEntities(initial, ["sg-1"]);
    const operations: FreeEditOperation[] = [
      { kind: "create", entity: { id: "pt-2", kind: "point", points: [{ x: 900, y: 900 }] } },
      { kind: "delete", removed },
      { kind: "move-vertex", entityId: "pl-1", index: 2, before: { x: 200, y: 700 }, after: { x: 260, y: 780 } },
    ];
    for (const operation of operations) {
      expect(revertFreeOperation(applyFreeOperation(initial, operation), operation)).toEqual(initial);
    }
  });
});
