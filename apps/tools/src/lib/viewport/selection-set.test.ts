/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §8/§14 — ensemble de sélection.
 */

import { describe, expect, it } from "vitest";
import {
  EMPTY_SELECTION,
  isSelected,
  primarySelection,
  retainExisting,
  sameSelection,
  selectSingle,
  toggleSelection,
} from "./selection-set";

describe("sélection — entité active (§8)", () => {
  it("une sélection vide n'a pas d'entité active", () => {
    expect(primarySelection(EMPTY_SELECTION)).toBeNull();
  });

  it("l'entité active est la dernière désignée", () => {
    expect(primarySelection(["a", "b", "c"])).toBe("c");
  });

  it("ajouter une entité la rend active", () => {
    expect(primarySelection(toggleSelection(["a", "b"], "c"))).toBe("c");
  });

  it("retirer l'entité active rend la précédente active", () => {
    expect(primarySelection(toggleSelection(["a", "b", "c"], "c"))).toBe("b");
  });
});

describe("sélection — clic simple (§8)", () => {
  it("remplace toute la sélection", () => {
    expect(selectSingle(["a", "b", "c"], "d")).toEqual(["d"]);
  });

  it("null vide la sélection", () => {
    expect(selectSingle(["a", "b"], null)).toEqual([]);
  });

  it("re-désigner la même entité seule ne change pas la référence", () => {
    const current = ["a"];
    expect(selectSingle(current, "a")).toBe(current);
  });

  it("vider une sélection déjà vide ne change pas la référence", () => {
    expect(selectSingle(EMPTY_SELECTION, null)).toBe(EMPTY_SELECTION);
  });

  it("re-désigner une entité déjà présente parmi d'autres réduit bien à elle seule", () => {
    expect(selectSingle(["a", "b"], "a")).toEqual(["a"]);
  });
});

describe("sélection — Shift + clic (§8)", () => {
  it("ajoute une entité absente", () => {
    expect(toggleSelection(["a"], "b")).toEqual(["a", "b"]);
  });

  it("retire une entité présente", () => {
    expect(toggleSelection(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("retirer la dernière entité rend une sélection vide", () => {
    expect(toggleSelection(["a"], "a")).toEqual([]);
  });

  it("n'introduit jamais de doublon", () => {
    const twice = toggleSelection(toggleSelection(["a"], "b"), "b");
    expect(twice).toEqual(["a"]);
  });

  it("ne mute pas la sélection d'entrée", () => {
    const current = ["a", "b"];
    toggleSelection(current, "c");
    toggleSelection(current, "a");
    expect(current).toEqual(["a", "b"]);
  });
});

describe("sélection — appartenance et comparaison", () => {
  it("isSelected répond sur l'ensemble, pas seulement sur l'entité active", () => {
    expect(isSelected(["a", "b"], "a")).toBe(true);
    expect(isSelected(["a", "b"], "z")).toBe(false);
  });

  it("sameSelection compare valeur et ordre", () => {
    expect(sameSelection(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameSelection(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameSelection(["a"], ["a", "b"])).toBe(false);
    expect(sameSelection([], [])).toBe(true);
  });
});

describe("sélection — entités disparues (§8)", () => {
  it("écarte les identifiants absents de la scène", () => {
    expect(retainExisting(["a", "b", "c"], new Set(["a", "c"]))).toEqual(["a", "c"]);
  });

  it("conserve la référence quand rien n'a disparu", () => {
    const current = ["a", "b"];
    expect(retainExisting(current, new Set(["a", "b", "c"]))).toBe(current);
  });

  it("rend la sélection vide quand plus rien n'existe", () => {
    expect(retainExisting(["a", "b"], new Set<string>())).toEqual([]);
  });

  it("une sélection vide reste la même référence", () => {
    expect(retainExisting(EMPTY_SELECTION, new Set(["a"]))).toBe(EMPTY_SELECTION);
  });

  it("l'ordre — donc l'entité active — est préservé après filtrage", () => {
    expect(primarySelection(retainExisting(["a", "b", "c"], new Set(["a", "b"])))).toBe("b");
  });
});
