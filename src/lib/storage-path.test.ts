import { describe, expect, it } from "vitest";
import { cheminStockageSur } from "./storage-path";

describe("cheminStockageSur", () => {
  it("accepte un chemin simple sous le préfixe attendu", () => {
    expect(cheminStockageSur("ent/emp/signature-1.png", "ent/emp/")).toBe(true);
    expect(cheminStockageSur("ent/devis/photo.jpg")).toBe(true);
  });

  it("refuse toute traversée, même sous le bon préfixe", () => {
    for (const chemin of [
      "ent/emp/../../autre/emp2/sig.png",
      "ent/D/../../../documents-employes/V/x.png",
      "ent/emp/./x.png",
      "ent//x.png",
      "/ent/x.png",
      "ent/emp/%2e%2e/x.png",
      "ent\\..\\x.png",
      "ent/emp/x\u0000.png",
    ]) expect(cheminStockageSur(chemin, "ent/")).toBe(false);
  });

  it("refuse un chemin hors préfixe ou non textuel", () => {
    expect(cheminStockageSur("autre/emp/x.png", "ent/emp/")).toBe(false);
    expect(cheminStockageSur(null)).toBe(false);
    expect(cheminStockageSur("")).toBe(false);
  });
});
