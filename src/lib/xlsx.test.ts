import { describe, expect, it } from "vitest";
import { calculerLargeursXlsx, creerClasseurXlsx } from "./xlsx";

type FeuilleLue = {
  getCell(reference: string): { value: unknown; text: string; numFmt: string };
  getColumn(index: number): { width: number };
  views: Array<{ state?: string; ySplit?: number }>;
};

describe("exports Excel", () => {
  it("crée un vrai classeur avec cellules séparées, formats et volets figés", async () => {
    const contenu = await creerClasseurXlsx([
      ["Date", "N° facture", "Client", "HT", "Taux TVA", "TTC"],
      ["2026-07-16", "FAC-001", "Client Exemple", 100, 20, 120],
    ], { nomFeuille: "Journal des ventes" });

    expect(String.fromCharCode(contenu[0], contenu[1])).toBe("PK");

    const ExcelJS = (await import("@excel.js/exceljs")).default;
    const classeur = new ExcelJS.Workbook();
    await classeur.xlsx.load(Buffer.from(contenu));
    const feuille = classeur.worksheets[0] as unknown as FeuilleLue;

    expect(feuille.getCell("A1").text).toBe("Date");
    expect(feuille.getCell("B2").text).toBe("FAC-001");
    expect(feuille.getCell("D2").value).toBe(100);
    expect(feuille.getCell("D2").numFmt).toContain("€");
    expect(feuille.getCell("E2").numFmt).toContain("%");
    expect(feuille.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(feuille.getColumn(3).width).toBeGreaterThan(12);
  });

  it("adapte les largeurs sans créer de colonnes démesurées", () => {
    const largeurs = calculerLargeursXlsx([
      ["Court", "Description"],
      ["A", "Une description volontairement très longue qui doit rester lisible mais plafonnée"],
    ], 2);

    expect(largeurs[0]).toBe(12);
    expect(largeurs[1]).toBe(42);
  });
});
