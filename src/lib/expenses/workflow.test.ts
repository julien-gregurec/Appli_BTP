import { describe, expect, it } from "vitest";
import { transitionAutorisee, verifierTotaux } from "./workflow";

describe("workflow des dépenses", () => {
  it("autorise le salarié à soumettre son brouillon uniquement", () => {
    expect(transitionAutorisee("salarie", "brouillon", "soumis")).toBe(true);
    expect(transitionAutorisee("salarie", "soumis", "valide")).toBe(false);
  });

  it("interdit le remplacement logique d’un verrouillage par une validation", () => {
    expect(transitionAutorisee("administrateur", "verrouille", "valide")).toBe(false);
    expect(transitionAutorisee("administrateur", "verrouille", "archive")).toBe(true);
  });

  it("signale un total incohérent", () => {
    expect(verifierTotaux(100, 20, 120)).toEqual([]);
    expect(verifierTotaux(100, 20, 130)).toContain("HT + TVA est différent du TTC");
  });
});
