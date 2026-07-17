import { describe, expect, it } from "vitest";
import { calculerMontantsTva, estTauxTvaFrance, TAUX_TVA_FRANCE } from "./tva";

describe("TVA française", () => {
  it("expose les taux proposés en France métropolitaine", () => {
    expect(TAUX_TVA_FRANCE).toEqual([0, 2.1, 5.5, 10, 20]);
    expect(estTauxTvaFrance(7)).toBe(false);
  });

  it("calcule et arrondit les montants comptables", () => {
    expect(calculerMontantsTva(99, 20)).toEqual({ ht: 99, tva: 19.8, ttc: 118.8, taux: 20 });
    expect(calculerMontantsTva(123.45, 5.5)).toEqual({ ht: 123.45, tva: 6.79, ttc: 130.24, taux: 5.5 });
  });

  it("refuse un taux libre ou un montant négatif", () => {
    expect(() => calculerMontantsTva(100, 7)).toThrow("Taux de TVA français invalide");
    expect(() => calculerMontantsTva(-1, 20)).toThrow("Montant HT invalide");
  });
});

