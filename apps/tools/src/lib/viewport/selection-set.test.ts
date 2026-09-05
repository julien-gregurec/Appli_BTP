/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §8 — règles de sélection multiple.
 */

import { describe, expect, it } from "vitest";
import {
  applySelectionClick,
  EMPTY_SELECTION,
  primarySelection,
  pruneSelection,
  selectionFromId,
  toggleSelection,
} from "./selection-set";

describe("entité principale", () => {
  it("est la dernière ajoutée", () => {
    expect(primarySelection(["a", "b", "c"])).toBe("c");
  });

  it("est nulle sur une sélection vide", () => {
    expect(primarySelection(EMPTY_SELECTION)).toBeNull();
  });

  it("coïncide avec la sélection simple quand il n'y a qu'une entité", () => {
    expect(primarySelection(selectionFromId("axe-h"))).toBe("axe-h");
    expect(primarySelection(selectionFromId(null))).toBeNull();
  });
});

describe("bascule", () => {
  it("ajoute une entité absente à la fin", () => {
    expect(toggleSelection(["a"], "b")).toEqual(["a", "b"]);
  });

  it("retire une entité déjà présente", () => {
    expect(toggleSelection(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("retirer la principale fait remonter la précédente", () => {
    expect(primarySelection(toggleSelection(["a", "b"], "b"))).toBe("a");
  });

  it("ne modifie pas la liste reçue", () => {
    const source = ["a", "b"];
    toggleSelection(source, "c");
    expect(source).toEqual(["a", "b"]);
  });
});

describe("clic simple", () => {
  it("remplace la sélection courante", () => {
    expect(applySelectionClick(["a", "b"], "c", false)).toEqual(["c"]);
  });

  it("désélectionne tout quand il tombe dans le vide", () => {
    expect(applySelectionClick(["a", "b"], null, false)).toEqual([]);
  });
});

describe("clic additif (Maj)", () => {
  it("ajoute sans perdre la sélection existante", () => {
    expect(applySelectionClick(["a"], "b", true)).toEqual(["a", "b"]);
  });

  it("retire une entité déjà sélectionnée", () => {
    expect(applySelectionClick(["a", "b"], "a", true)).toEqual(["b"]);
  });

  it("PRÉSERVE la sélection quand il rate sa cible", () => {
    // Un Maj+clic manqué ne doit pas détruire une sélection patiemment construite : elle
    // n'entre pas dans l'historique, donc rien ne permettrait de la récupérer.
    expect(applySelectionClick(["a", "b"], null, true)).toEqual(["a", "b"]);
  });

  it("construit une sélection de trois entités par clics successifs", () => {
    let selection: readonly string[] = EMPTY_SELECTION;
    for (const id of ["a", "b", "c"]) selection = applySelectionClick(selection, id, true);
    expect(selection).toEqual(["a", "b", "c"]);
    expect(primarySelection(selection)).toBe("c");
  });
});

describe("élagage", () => {
  it("retire les entités disparues en gardant l'ordre", () => {
    expect(pruneSelection(["a", "b", "c"], new Set(["c", "a"]))).toEqual(["a", "c"]);
  });

  it("rend la MÊME référence quand rien ne disparaît — les mémos en aval restent valides", () => {
    const source = ["a", "b"];
    expect(pruneSelection(source, new Set(["a", "b", "z"]))).toBe(source);
  });

  it("vide la sélection quand plus rien n'existe", () => {
    expect(pruneSelection(["a", "b"], new Set<string>())).toEqual([]);
  });
});
