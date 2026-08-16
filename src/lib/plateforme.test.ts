import { describe, expect, it } from "vitest";
import { OFFRES, prixAbonnementMensuel, recommanderOffre } from "@/lib/plateforme";

const mini = OFFRES[0];
const pro = OFFRES[1];
const business = OFFRES[2];
const entreprise = OFFRES[3];

describe("prixAbonnementMensuel", () => {
  it("conserve le prix de base jusqu'au nombre de comptes inclus", () => {
    expect(prixAbonnementMensuel(0).total).toBe(69);
    expect(prixAbonnementMensuel(3).total).toBe(69);
  });

  it("facture chaque compte au-delà des comptes inclus", () => {
    expect(prixAbonnementMensuel(4)).toMatchObject({
      total: 69 + 5,
      employesSupplementaires: 1,
    });
    expect(prixAbonnementMensuel({ administratif: 16 }, pro).total).toBe(199 + 15);
    expect(prixAbonnementMensuel(31, business)).toMatchObject({
      total: 399 + 5,
      employesSupplementaires: 1,
    });
  });

  it("applique l’exemple Mini validé avec priorité aux comptes les plus chers", () => {
    expect(prixAbonnementMensuel({ administratif: 1, chef_equipe: 1, terrain: 3 }, mini)).toMatchObject({
      total: 79,
      employesSupplementaires: 2,
      supplementComptes: 10,
    });
  });

  it("distingue les quotas salariés et administrateurs d’Entreprise", () => {
    expect(entreprise).toMatchObject({ comptesInclus: 50, administrateursInclus: 10 });
    expect(prixAbonnementMensuel({ administratif: 11, terrain: 40 }, entreprise)).toMatchObject({
      total: 599 + 15,
      employesSupplementaires: 1,
    });
    expect(prixAbonnementMensuel({ administratif: 10, terrain: 41 }, entreprise)).toMatchObject({
      total: 599 + 5,
      employesSupplementaires: 1,
    });
  });

  it("ajoute le dépassement d'appareils", () => {
    expect(prixAbonnementMensuel(3, mini, 28).total).toBe(69 + 28);
  });

  it("utilise le prix annuel propre à l'offre", () => {
    const p = prixAbonnementMensuel({ administratif: 1, chef_equipe: 1, terrain: 3 }, mini);
    expect(p.mensuelSiAnnuel).toBeCloseTo(65.83, 2);
    expect(p.totalAnnuel).toBe(790);
  });

  it("ne calcule aucun prix public pour l'offre Sur mesure", () => {
    expect(prixAbonnementMensuel(50, OFFRES[4])).toMatchObject({ base: null, total: null, totalAnnuel: null });
  });
});

describe("recommanderOffre", () => {
  it("recommande le palier le plus élevé exigé par les besoins", () => {
    expect(recommanderOffre(["devis_factures"], 1).offre.cle).toBe("mini");
    expect(recommanderOffre(["planning"], 4).offre.cle).toBe("mini");
    expect(recommanderOffre(["stock"], 20).offre.cle).toBe("business");
    expect(recommanderOffre(["portail_client"], 20).offre.cle).toBe("entreprise");
  });
});
