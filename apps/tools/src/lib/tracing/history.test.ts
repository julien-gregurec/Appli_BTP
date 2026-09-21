import { describe, expect, it } from "vitest";
import {
  canRedo,
  canUndo,
  createHistory,
  currentState,
  pushHistory,
  redo,
  redoLabel,
  resetHistory,
  undo,
  undoLabel,
} from "./history";

describe("historique annuler / rétablir (§38)", () => {
  it("annule et rétablit les étapes du relevé", () => {
    let history = createHistory({ points: 0 }, "Nouveau tracé");
    history = pushHistory(history, { points: 1 }, "Ajout d'un point");
    history = pushHistory(history, { points: 2 }, "Ajout d'un point");
    expect(currentState(history).points).toBe(2);

    history = undo(history);
    expect(currentState(history).points).toBe(1);
    expect(canRedo(history)).toBe(true);
    expect(redoLabel(history)).toBe("Ajout d'un point");

    history = redo(history);
    expect(currentState(history).points).toBe(2);
    expect(canRedo(history)).toBe(false);
  });

  it("abandonne le futur dès qu'une nouvelle action est faite", () => {
    let history = createHistory("calibration", "Départ");
    history = pushHistory(history, "simplification", "Simplification");
    history = undo(history);
    history = pushHistory(history, "validation", "Validation du contour");
    expect(canRedo(history)).toBe(false);
    expect(currentState(history)).toBe("validation");
    expect(undoLabel(history)).toBe("Validation du contour");
  });

  it("borne la profondeur pour ne pas saturer la mémoire d'un téléphone", () => {
    let history = createHistory(0, "Départ", 5);
    for (let step = 1; step <= 20; step++) history = pushHistory(history, step, `Étape ${step}`);
    expect(history.entries).toHaveLength(5);
    expect(currentState(history)).toBe(20);
    for (let step = 0; step < 10; step++) history = undo(history);
    expect(currentState(history)).toBe(16);
  });

  it("ne bouge pas quand il n'y a rien à annuler ou à rétablir", () => {
    const history = createHistory("état");
    expect(canUndo(history)).toBe(false);
    expect(undo(history)).toBe(history);
    expect(redo(history)).toBe(history);
    expect(undoLabel(history)).toBe("");
  });

  it("repart de l'état courant après enregistrement", () => {
    let history = createHistory("a", "Départ");
    history = pushHistory(history, "b", "Modification");
    const reset = resetHistory(history, "Projet enregistré");
    expect(currentState(reset)).toBe("b");
    expect(canUndo(reset)).toBe(false);
  });

  it("refuse une profondeur absurde", () => {
    expect(() => createHistory("a", "Départ", 1)).toThrow();
  });
});
