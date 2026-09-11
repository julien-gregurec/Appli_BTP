import { describe, expect, it } from "vitest";
import { ventilationTvaFactures, type LigneFactureTva } from "@/lib/devis/export-tva";
import { totauxDocument } from "@/lib/devis/montants";

const ligne = (numero: string, quantite: number, prix: number, taux: number, remiseGlobalePct = 0, date = "2026-09-11"): LigneFactureTva => ({
  numero, date, quantite, prixUnitaireHt: prix, remiseLignePct: 0, tauxTva: taux, remiseGlobalePct,
});

describe("38. export comptable de la TVA collectée", () => {
  it("applique la remise globale de la facture : la base exportée égale le HT de la facture", () => {
    const lignes = [ligne("FAC-1", 1, 100, 20, 10), ligne("FAC-1", 1, 50, 10, 10)];
    const details = ventilationTvaFactures(lignes);
    expect(details).toEqual([
      { date: "2026-09-11", numero: "FAC-1", taux: 10, ht: 45, tva: 4.5 },
      { date: "2026-09-11", numero: "FAC-1", taux: 20, ht: 90, tva: 18 },
    ]);
    const t = totauxDocument(lignes.map((l) => ({ ...l, remiseLignePct: 0 })), 10);
    expect(details.reduce((s, d) => s + d.ht, 0)).toBe(t.totalHt);
  });
  it("retombe au centime sur les totaux enregistrés, là où la somme de flottants dérivait", () => {
    const lignes = [ligne("FAC-2", 3, 0.335, 20), ligne("FAC-2", 1, 2.675, 20), ligne("FAC-2", 7, 1.005, 5.5)];
    const t = totauxDocument(lignes.map((l) => ({ ...l, remiseLignePct: 0 })), 0);
    const details = ventilationTvaFactures(lignes);
    expect(Math.round(details.reduce((s, d) => s + d.ht, 0) * 100)).toBe(Math.round(t.totalHt * 100));
    expect(Math.round(details.reduce((s, d) => s + d.tva, 0) * 100)).toBe(Math.round(t.totalTva * 100));
  });
  it("ventile facture par facture, dans l'ordre des dates et des numéros", () => {
    const details = ventilationTvaFactures([ligne("FAC-B", 1, 10, 20, 0, "2026-09-12"), ligne("FAC-A", 1, 10, 20, 0, "2026-09-10")]);
    expect(details.map((d) => d.numero)).toEqual(["FAC-A", "FAC-B"]);
  });
  it("traite un avoir (montants négatifs) sans inverser le signe à tort", () => {
    expect(ventilationTvaFactures([ligne("AV-1", -1, 100, 20)])).toEqual([{ date: "2026-09-11", numero: "AV-1", taux: 20, ht: -100, tva: -20 }]);
  });
});
