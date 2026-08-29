import { describe, expect, it } from "vitest";
import { calculerPourcentage, validerQuantite } from "@/lib/quantites";

describe("quantités Colors", () => {
  it("conserve une saisie en pourcentage", () => expect(calculerPourcentage({ mode:"pourcentage",unite:"pourcent",pourcentage:25 })).toBe(25));
  it("calcule les litres", () => expect(calculerPourcentage({ mode:"volume",unite:"l",nominale:10,restante:2.5 })).toBe(25));
  it("calcule les poids sans convertir en volume", () => expect(calculerPourcentage({ mode:"poids",unite:"kg",nominale:5,restante:1.25 })).toBe(25));
  it("refuse négatif et dépassement", () => {
    expect(validerQuantite({ mode:"volume",unite:"l",nominale:10,restante:-1 })).toContain("négative");
    expect(validerQuantite({ mode:"volume",unite:"l",nominale:10,restante:11 })).toContain("dépasse");
  });
});
