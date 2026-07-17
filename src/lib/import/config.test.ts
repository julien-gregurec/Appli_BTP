import { describe, expect, it } from "vitest";
import { LOGICIELS_SOURCE, suggererMappingImport } from "@/lib/import/config";

describe("reprise de données multi-logiciels", () => {
  it("propose Batigest, Batappli, EBP et un profil universel", () => {
    const logiciels = LOGICIELS_SOURCE.map((logiciel) => logiciel.libelle).join(" ");
    expect(logiciels).toContain("Batigest");
    expect(logiciels).toContain("Batappli");
    expect(logiciels).toContain("EBP Bâtiment");
    expect(logiciels).toContain("Autre logiciel");
  });

  it("reconnaît les colonnes d'un export clients Batigest", () => {
    const mapping = suggererMappingImport("clients", [
      "Raison sociale", "Adresse 1", "CP", "Ville", "Téléphone portable", "E-mail", "N° SIRET",
    ]);
    expect(mapping.nom).toBe(0);
    expect(mapping.adresse_facturation).toBe(1);
    expect(mapping.code_postal).toBe(2);
    expect(mapping.ville).toBe(3);
    expect(mapping.telephone).toBe(4);
    expect(mapping.email).toBe(5);
    expect(mapping.siret).toBe(6);
  });

  it("reconnaît les colonnes de stock courantes quel que soit le logiciel", () => {
    const mapping = suggererMappingImport("stock", [
      "Code article", "Libellé article", "Code EAN", "PA HT", "PV HT", "Stock réel", "Emplacement",
    ]);
    expect(mapping.reference).toBe(0);
    expect(mapping.designation).toBe(1);
    expect(mapping.code_barres).toBe(2);
    expect(mapping.prix_achat_ht).toBe(3);
    expect(mapping.prix_vente_ht).toBe(4);
    expect(mapping.quantite_stock).toBe(5);
    expect(mapping.emplacement).toBe(6);
  });

  it("reconnaît un journal comptable Sage ou EBP", () => {
    const mapping = suggererMappingImport("ecritures_comptables", [
      "Code journal", "Date comptable", "N° pièce", "N° compte", "Libellé écriture", "Débit", "Crédit",
    ]);
    expect(mapping.journal).toBe(0);
    expect(mapping.date_ecriture).toBe(1);
    expect(mapping.numero_piece).toBe(2);
    expect(mapping.compte).toBe(3);
    expect(mapping.libelle).toBe(4);
    expect(mapping.debit).toBe(5);
    expect(mapping.credit).toBe(6);
  });
});
