import { describe, expect, it } from "vitest";
import {
  OFFRES_TARIFAIRES,
  SERVICES_MISE_EN_SERVICE,
  calculerTarifAbonnement,
  filtrerPermissionsSelonOffre,
  offreTarifaireParCle,
  permissionIncluseDansOffre,
} from "./tarification";

describe("grille tarifaire", () => {
  it("expose les cinq offres validées avec des montants en centimes", () => {
    expect(OFFRES_TARIFAIRES.map((offre) => [offre.cle, offre.prixMensuelCentimes])).toEqual([
      ["mini", 7_900],
      ["pro", 24_900],
      ["business", 44_900],
      ["entreprise", 59_900],
      ["sur_mesure", 69_900],
    ]);
    expect(offreTarifaireParCle("entreprise").prixAnnuelCentimes).toBe(646_800);
    expect(offreTarifaireParCle("entreprise").populaire).toBe(true);
    expect(SERVICES_MISE_EN_SERVICE.map((service) => service.prixMinCentimes)).toEqual([
      199_000,
      49_000,
      69_000,
      150_000,
      49_000,
      90_000,
    ]);
  });

  it("additionne les options sans nombre flottant", () => {
    const total = calculerTarifAbonnement({
      offre: offreTarifaireParCle("pro"),
      comptesTerrainSupplementaires: 2,
      comptesChefEquipeSupplementaires: 1,
      comptesAdministratifsSupplementaires: 1,
      stockageSupplementaire: true,
      synchronisationBancaire: "avancee",
      creditsIA: true,
    });
    expect(total).toMatchObject({ baseCentimes: 24_900, optionsCentimes: 14_100, totalCentimes: 39_000 });
  });
});

describe("droits liés à l'offre", () => {
  it("conserve les droits individuels uniquement si le module est inclus", () => {
    expect(permissionIncluseDansOffre("acces_devis", "mini")).toBe(true);
    expect(permissionIncluseDansOffre("acces_stock", "mini")).toBe(false);
    expect(permissionIncluseDansOffre("acces_stock", "business")).toBe(true);
    expect(filtrerPermissionsSelonOffre(["acces_devis", "acces_stock"], "mini")).toEqual(["acces_devis"]);
  });

  it("ne limite pas rétroactivement les anciennes offres", () => {
    expect(permissionIncluseDansOffre("acces_stock", "essentiel")).toBe(true);
    expect(permissionIncluseDansOffre("gerer_devis", "mini")).toBe(true);
  });
});
