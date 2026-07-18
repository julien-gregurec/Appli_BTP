import { describe, expect, it } from "vitest";
import {
  analyserAffectationDepense,
  libelleAffectationDepense,
  valeurAffectationDepense,
} from "./affectation";

describe("affectation des notes de frais", () => {
  it("conserve les trois lieux hors chantier", () => {
    expect(analyserAffectationDepense("hors:sans_chantier")).toEqual({ chantierId: null, lieuHorsChantier: "sans_chantier" });
    expect(analyserAffectationDepense("hors:depot")).toEqual({ chantierId: null, lieuHorsChantier: "depot" });
    expect(analyserAffectationDepense("hors:bureau")).toEqual({ chantierId: null, lieuHorsChantier: "bureau" });
  });

  it("conserve un vrai chantier", () => {
    expect(analyserAffectationDepense("2d3ac6b4-95fa-41da-9f9a-844a80129ca3")).toEqual({
      chantierId: "2d3ac6b4-95fa-41da-9f9a-844a80129ca3",
      lieuHorsChantier: null,
    });
  });

  it("génère la valeur du formulaire et le libellé", () => {
    expect(valeurAffectationDepense(null, "depot")).toBe("hors:depot");
    expect(libelleAffectationDepense(null, "bureau")).toBe("Bureau");
    expect(libelleAffectationDepense("École Victor-Hugo", null)).toBe("École Victor-Hugo");
  });

  it("refuse un lieu hors chantier inconnu", () => {
    expect(() => analyserAffectationDepense("hors:domicile")).toThrow("Lieu de dépense invalide");
  });
});
