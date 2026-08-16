import { describe, expect, it } from "vitest";
import {
  calculerRepartitionComptesFacturables,
  calculerSupplementsComptes,
  typeCompteTarifaireDepuisPoste,
} from "./facturation-comptes";
import { OFFRES_TARIFAIRES } from "./tarification";

const mini = OFFRES_TARIFAIRES[0];
const entreprise = OFFRES_TARIFAIRES[3];

describe("types de comptes tarifaires", () => {
  it("privilégie le type explicite puis reconnaît les rôles historiques", () => {
    expect(typeCompteTarifaireDepuisPoste({ nom: "Ouvrier", code_offre: "compte_administratif" })).toBe("administratif");
    expect(typeCompteTarifaireDepuisPoste({ nom: "Chef de chantier" })).toBe("chef_equipe");
    expect(typeCompteTarifaireDepuisPoste({ nom: "Responsable RH" })).toBe("administratif");
    expect(typeCompteTarifaireDepuisPoste({ nom: "Ouvrier" })).toBe("terrain");
  });

  it("compte uniquement les comptes actifs et en pause", () => {
    const repartition = calculerRepartitionComptesFacturables({
      postes: [
        { id: "admin", nom: "Administrateur", code_offre: "compte_administratif" },
        { id: "terrain", nom: "Ouvrier", code_offre: "compte_terrain" },
      ],
      employes: [
        { poste_id: "admin", compte_application_statut: "actif" },
        { poste_id: "terrain", compte_application_statut: "pause" },
        { poste_id: "terrain", compte_application_statut: "ferme" },
      ],
    });
    expect(repartition).toEqual({ administratif: 1, chef_equipe: 0, terrain: 1 });
  });
});

describe("comptes inclus et supplémentaires", () => {
  it("impute Mini du plus cher au moins cher", () => {
    const resultat = calculerSupplementsComptes({ administratif: 1, chef_equipe: 1, terrain: 3 }, mini);
    expect(resultat.inclus).toEqual({ administratif: 1, chef_equipe: 1, terrain: 1 });
    expect(resultat.supplementaires).toEqual({ administratif: 0, chef_equipe: 0, terrain: 2 });
    expect(resultat.montantMensuelHt).toBe(10);
  });

  it("garde pour Entreprise 10 administratifs et 40 salariés séparés", () => {
    expect(calculerSupplementsComptes({ administratif: 11, chef_equipe: 8, terrain: 32 }, entreprise).supplementaires)
      .toEqual({ administratif: 1, chef_equipe: 0, terrain: 0 });
    expect(calculerSupplementsComptes({ administratif: 10, chef_equipe: 8, terrain: 33 }, entreprise).supplementaires)
      .toEqual({ administratif: 0, chef_equipe: 0, terrain: 1 });
  });
});
