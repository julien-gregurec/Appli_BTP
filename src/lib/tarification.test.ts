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

  it("déverrouille les familles de modules palier par palier sans élargir les droits du rôle", () => {
    const matrice = [
      ["mini", true, false, false, false],
      ["pro", true, true, false, false],
      ["business", true, true, true, false],
      ["entreprise", true, true, true, true],
      ["sur_mesure", true, true, true, true],
    ] as const;

    for (const [offre, devis, achats, stock, banque] of matrice) {
      expect(permissionIncluseDansOffre("acces_devis", offre)).toBe(devis);
      expect(permissionIncluseDansOffre("acces_achats", offre)).toBe(achats);
      expect(permissionIncluseDansOffre("acces_stock", offre)).toBe(stock);
      expect(permissionIncluseDansOffre("acces_paiements_bancaires", offre)).toBe(banque);
    }
  });

  it("laisse toujours accessibles les réglages nécessaires à l'administrateur", () => {
    for (const offre of OFFRES_TARIFAIRES) {
      expect(permissionIncluseDansOffre("acces_parametres", offre.cle)).toBe(true);
      expect(permissionIncluseDansOffre("gerer_utilisateurs", offre.cle)).toBe(true);
    }
  });

  it("Mini peut gérer les comptes employés qu'elle facture, sans gagner le reste du palier Terrain (COMPTES-SUPPLEMENTAIRES-V1C)", () => {
    // Mini facture des comptes supplémentaires (comptesInclus=3, parCompteSup=15€) : le client
    // doit donc pouvoir créer/gérer ces comptes (acces_employes), sans pour autant hériter du
    // reste du palier Terrain (pointage, congés, notes de frais) ni d'un palier supérieur.
    expect(permissionIncluseDansOffre("acces_employes", "mini")).toBe(true);
    expect(permissionIncluseDansOffre("acces_pointage", "mini")).toBe(false);
    expect(permissionIncluseDansOffre("demander_ses_conges", "mini")).toBe(false);
    expect(permissionIncluseDansOffre("saisir_ses_notes_frais", "mini")).toBe(false);
    expect(permissionIncluseDansOffre("acces_stock", "mini")).toBe(false);
    // gerer_employes (mutation) n'a jamais été limité par offre : seule la route /employes
    // (acces_employes) l'était. Aucune régression attendue ici, mais on fige le comportement.
    expect(permissionIncluseDansOffre("gerer_employes", "mini")).toBe(true);
    // Paie et RH avancé restent hors de portée pour Mini, même après ce correctif.
    expect(permissionIncluseDansOffre("consulter_sa_paie", "mini")).toBe(false);
    expect(permissionIncluseDansOffre("gerer_paie", "mini")).toBe(false);
    // Les autres offres conservaient déjà acces_employes via le palier Terrain : pas de régression.
    for (const offre of ["pro", "business", "entreprise", "sur_mesure"] as const) {
      expect(permissionIncluseDansOffre("acces_employes", offre)).toBe(true);
    }
  });

  it("reste ouvert (fail-open) pour un code d'offre inconnu ou vide plutôt que de bloquer l'accès", () => {
    expect(permissionIncluseDansOffre("acces_stock", "code_offre_inexistant")).toBe(true);
    expect(permissionIncluseDansOffre("acces_paiements_bancaires", null)).toBe(true);
    expect(permissionIncluseDansOffre("acces_paiements_bancaires", undefined)).toBe(true);
  });
});
