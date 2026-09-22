import { describe, expect, it } from "vitest";
import { TABLES_CONSERVEES_PURGE, cheminsStorageEmployeAAnonymiser, tablesEligiblesPurge } from "./rgpd";

describe("cheminsStorageEmployeAAnonymiser", () => {
  it("retourne les trois chemins quand ils sont tous présents", () => {
    expect(
      cheminsStorageEmployeAAnonymiser({
        photo_storage_path: "e1/emp1/portrait-a.png",
        signature_storage_path: "e1/emp1/signature-b.png",
        carte_btp_storage_path: "e1/emp1/carte-btp-c.pdf",
      })
    ).toEqual(["e1/emp1/portrait-a.png", "e1/emp1/signature-b.png", "e1/emp1/carte-btp-c.pdf"]);
  });

  it("ignore les colonnes nulles, vides ou absentes", () => {
    expect(
      cheminsStorageEmployeAAnonymiser({
        photo_storage_path: "e1/emp1/portrait-a.png",
        signature_storage_path: null,
        carte_btp_storage_path: "",
      })
    ).toEqual(["e1/emp1/portrait-a.png"]);
  });

  it("retourne un tableau vide pour un employé sans aucun fichier", () => {
    expect(cheminsStorageEmployeAAnonymiser({})).toEqual([]);
  });

  it("retourne un tableau vide si l'employé est introuvable (null)", () => {
    expect(cheminsStorageEmployeAAnonymiser(null)).toEqual([]);
  });
});

describe("tablesEligiblesPurge", () => {
  it("exclut les tables conservées pour raison comptable/légale", () => {
    const toutes = ["employes", "factures", "chantiers", "paiements", "notes_frais", "journal_activite"];
    const eligibles = tablesEligiblesPurge(toutes);
    expect(eligibles).toEqual(["chantiers", "employes", "notes_frais"]);
    for (const conservee of TABLES_CONSERVEES_PURGE) {
      expect(eligibles).not.toContain(conservee);
    }
  });

  it("ne modifie pas la liste d'entrée", () => {
    const toutes = ["employes", "factures"];
    tablesEligiblesPurge(toutes);
    expect(toutes).toEqual(["employes", "factures"]);
  });

  it("gère une liste vide", () => {
    expect(tablesEligiblesPurge([])).toEqual([]);
  });
});
