import { describe, expect, it } from "vitest";
import { CONNECTEURS_FOURNISSEURS_CONNUS, connecteurFournisseurConnu } from "./fournisseur-connecteurs";

describe("connecteurs fournisseurs", () => {
  it("propose les fournisseurs demandés sans BatiChiffrage", () => {
    expect(CONNECTEURS_FOURNISSEURS_CONNUS.map((item) => item.code)).toEqual([
      "wurth",
      "foussier",
      "siehr",
      "aubade",
      "provitrage",
    ]);
    expect(CONNECTEURS_FOURNISSEURS_CONNUS.some((item) => item.nom.toLowerCase().includes("batichiffrage"))).toBe(false);
  });

  it("n’annonce une intégration publique que lorsqu’un échange officiel est documenté", () => {
    expect(connecteurFournisseurConnu("wurth")?.integrationPublique).toBe(true);
    expect(connecteurFournisseurConnu("foussier")?.modes).toContain("edi");
    expect(connecteurFournisseurConnu("siehr")?.integrationPublique).toBe(false);
    expect(connecteurFournisseurConnu("provitrage")?.modes).toContain("portail");
  });
});
