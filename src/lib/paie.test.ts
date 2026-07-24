import { describe, expect, it } from "vitest";
import { bornesMois, estPeriodePaieModifiable, montantIndemnite } from "@/lib/paie";

describe("préparation de la paie", () => {
  it("calcule correctement les bornes d'un mois bissextile", () => {
    expect(bornesMois("2028-02")).toEqual({ debut: "2028-02-01", fin: "2028-02-29", mois: "2028-02-01" });
  });
  it("refuse un mois hors plage", () => expect(() => bornesMois("2026-13")).toThrow("Mois invalide"));
  it("arrondit les indemnités au centime", () => expect(montantIndemnite(3, 9.876)).toBe(29.63));
  it("ne permet pas de modifier une période transmise", () => expect(estPeriodePaieModifiable("transmise_comptable")).toBe(false));
});
