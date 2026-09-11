import { describe, expect, it } from "vitest";
import { COLONNES_IMPORT_CATALOGUE, planifierImportCatalogue } from "@/lib/devis/import-catalogue";
import {
  CHAMPS_CATALOGUE_V2,
  droitsImportCatalogueV2,
  erreurMappingCatalogueV2,
  lignesPourPlanificateur,
  lireCleRapprochement,
  suggererMappingCatalogueV2,
} from "@/lib/import/catalogue-v2";

// Toutes les données sont FICTIVES.

describe("champs du profil catalogue v2", () => {
  it("couvrent exactement les colonnes lues par le planificateur", () => {
    expect(CHAMPS_CATALOGUE_V2.map((c) => c.cle).sort()).toEqual([...COLONNES_IMPORT_CATALOGUE].sort());
  });
});

describe("suggererMappingCatalogueV2", () => {
  it("reconnaît un export courant", () => {
    const m = suggererMappingCatalogueV2([
      "Référence", "Réf. fabricant", "Code EAN", "Désignation", "Marque", "Fournisseur", "Unité", "PV HT", "TVA", "Famille", "PA HT", "Actif",
    ]);
    expect(m).toMatchObject({
      reference_interne: 0,
      reference_fabricant: 1,
      code_barres: 2,
      designation: 3,
      fabricant: 4,
      fournisseur: 5,
      unite: 6,
      prix_vente_ht: 7,
      taux_tva: 8,
      categorie: 9,
      prix_achat_ht: 10,
      actif: 11,
    });
  });

  it("ne donne pas la référence fabricant à la référence interne parce qu'elle contient « référence »", () => {
    const m = suggererMappingCatalogueV2(["Désignation", "Référence fabricant article"]);
    expect(m.reference_fabricant).toBe(1);
    expect(m.reference_interne).toBe(-1);
  });

  it("n'associe jamais deux champs à la même colonne", () => {
    const m = suggererMappingCatalogueV2(["Prix unitaire HT", "Prix achat HT"]);
    const utilisees = Object.values(m).filter((i) => i >= 0);
    expect(new Set(utilisees).size).toBe(utilisees.length);
    expect(m.prix_vente_ht).toBe(0);
    expect(m.prix_achat_ht).toBe(1);
  });
});

describe("lignesPourPlanificateur", () => {
  const entete = ["Réf", "Libellé", "Commentaire", "", "PV"];

  it("rend des enregistrements aux en-têtes canoniques et nomme les colonnes non associées", () => {
    const r = lignesPourPlanificateur(entete, [["R1", "Rail (fictif)", "à revoir", "x", "3,20"], ["R2"]], {
      reference_interne: 0, designation: 1, prix_vente_ht: 4,
    });
    expect(r.lignes).toEqual([
      { reference_interne: "R1", designation: "Rail (fictif)", prix_vente_ht: "3,20" },
      { reference_interne: "R2", designation: "", prix_vente_ht: "" },
    ]);
    expect(r.colonnesInconnues).toEqual(["Commentaire", "Colonne 4"]);
  });

  it("ignore les associations invalides (hors bornes, non entières, champ inconnu)", () => {
    const r = lignesPourPlanificateur(entete, [["R1", "Rail", "c", "x", "3"]], {
      reference_interne: 99, designation: 1.5, unite: "2", prix_vente_ht: -1, type: 0, constructor: 0,
    } as Record<string, unknown>);
    expect(r.lignes).toEqual([{}]);
    expect(r.colonnesInconnues).toHaveLength(5);
  });

  it("alimente le planificateur de bout en bout", () => {
    const r = lignesPourPlanificateur(["Ref", "Nom", "U", "PV"], [["N-1", "Rail (fictif)", "ml", "3,20"]], {
      reference_interne: 0, designation: 1, unite: 2, prix_vente_ht: 3,
    });
    const plan = planifierImportCatalogue(r.lignes, [], [], { cleRapprochement: "reference_interne", peutModifierPrixAchat: false });
    expect(plan.lignes[0]).toMatchObject({ numeroLigne: 2, statut: "creee" });
    expect(plan.colonnesInconnues).toEqual([]);
  });
});

describe("erreurMappingCatalogueV2", () => {
  it("exige la colonne de la clé choisie", () => {
    expect(erreurMappingCatalogueV2({ reference_interne: -1 }, "reference_interne")).toMatch(/Référence interne/);
    expect(erreurMappingCatalogueV2({ code_barres: 2 }, "code_barres")).toBeNull();
  });

  it("sans clé, exige ce qu'il faut pour créer", () => {
    expect(erreurMappingCatalogueV2({ designation: 0 }, "aucune")).toMatch(/Unité, Prix de vente HT/);
    expect(erreurMappingCatalogueV2({ designation: 0, unite: 1, prix_vente_ht: 2 }, "aucune")).toBeNull();
  });
});

describe("lireCleRapprochement", () => {
  it("n'accepte que les quatre clés prévues", () => {
    expect(lireCleRapprochement("reference_fabricant")).toBe("reference_fabricant");
    expect(lireCleRapprochement("aucune")).toBe("aucune");
    expect(lireCleRapprochement("designation")).toBeNull();
    expect(lireCleRapprochement(undefined)).toBeNull();
  });
});

describe("droitsImportCatalogueV2", () => {
  it("accès complet (null) : tout est permis", () => {
    expect(droitsImportCatalogueV2(null)).toEqual({ importer: true, voirCouts: true, gererCouts: true });
  });

  it("exige l'accès à l'assistant, l'accès et la gestion des devis", () => {
    expect(droitsImportCatalogueV2(["acces_devis", "gerer_devis"]).importer).toBe(false);
    expect(droitsImportCatalogueV2(["gerer_connecteurs", "acces_devis"]).importer).toBe(false);
    expect(droitsImportCatalogueV2(["gerer_utilisateurs", "acces_devis", "gerer_devis"]).importer).toBe(true);
  });

  it("les coûts suivent leurs propres droits, et jamais sans le droit d'importer", () => {
    expect(droitsImportCatalogueV2(["gerer_connecteurs", "acces_devis", "gerer_devis", "voir_couts_devis"]))
      .toEqual({ importer: true, voirCouts: true, gererCouts: false });
    expect(droitsImportCatalogueV2(["voir_couts_devis", "gerer_couts_devis"]))
      .toEqual({ importer: false, voirCouts: false, gererCouts: false });
  });
});
