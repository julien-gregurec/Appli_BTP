import { describe, expect, it } from "vitest";
import { lireImportStock } from "./import-stock";

const csv = (texte: string) => new File([texte], "stock.csv", { type: "text/csv" });

describe("lireImportStock — prix (D2)", () => {
  it("colonne de prix absente : null (prix existant inchangé), jamais 0", async () => {
    const [ligne] = await lireImportStock(csv("reference;designation\nA1;Article"));
    expect(ligne.prix_achat_ht).toBeNull();
    expect(ligne.prix_vente_ht).toBeNull();
  });

  it("prix de vente lu (« Prix de vente HT »)", async () => {
    const [ligne] = await lireImportStock(csv("reference;designation;prix de vente ht\nA1;Article;12,50"));
    expect(ligne.prix_vente_ht).toBe(12.5);
    expect(ligne.prix_achat_ht).toBeNull();
  });

  it("prix d'achat lu (« Prix d'achat HT »)", async () => {
    const [ligne] = await lireImportStock(csv("reference;designation;prix d'achat ht\nA1;Article;4,2"));
    expect(ligne.prix_achat_ht).toBe(4.2);
  });

  it("cellule de prix vide : null", async () => {
    const [ligne] = await lireImportStock(csv("reference;designation;prix_achat_ht;prix_vente_ht\nA1;Article;;8"));
    expect(ligne.prix_achat_ht).toBeNull();
    expect(ligne.prix_vente_ht).toBe(8);
  });

  it("prix illisible : refus explicite", async () => {
    await expect(lireImportStock(csv("reference;designation;prix_vente_ht\nA1;Article;abc"))).rejects.toThrow(/Prix illisible/);
  });

  it("prix négatif : refus explicite, jamais ramené à 0", async () => {
    await expect(lireImportStock(csv("reference;designation;prix_achat_ht\nA1;Article;-3"))).rejects.toThrow(/Prix négatif/);
  });
});
