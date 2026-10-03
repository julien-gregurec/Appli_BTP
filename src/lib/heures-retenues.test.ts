import { describe, expect, it } from "vitest";
import { pointagesRetenus, totauxHeuresRetenues } from "./heures-retenues";

describe("heures retenues (B37)", () => {
  const pointages = [
    { heures_normales: 7, heures_supplementaires: 0, verification_statut: "valide" },
    { heures_normales: 7, heures_supplementaires: 5, verification_statut: "rejete" },
    { heures_normales: "7", heures_supplementaires: "1", verification_statut: "a_verifier" },
    { heures_normales: 2, heures_supplementaires: null, verification_statut: null },
  ];

  it("exclut les pointages rejetés et garde les autres statuts", () => {
    expect(pointagesRetenus(pointages)).toHaveLength(3);
  });

  it("totalise sans les rejetés (16 h et non 28 h)", () => {
    expect(totauxHeuresRetenues(pointages)).toEqual({ normales: 16, supplementaires: 1, total: 17 });
  });
});
