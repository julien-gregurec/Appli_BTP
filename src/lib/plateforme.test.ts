import { describe, expect, it } from "vitest";
import { OFFRES, prixAbonnementMensuel, recommanderOffre } from "@/lib/plateforme";

const mini = OFFRES[0];
const pro = OFFRES[1];

describe("prixAbonnementMensuel", () => {
  it("conserve le prix de base jusqu'au nombre de comptes inclus", () => {
    expect(prixAbonnementMensuel(0).total).toBe(69);
    expect(prixAbonnementMensuel(3).total).toBe(69);
  });

  it("facture chaque compte au-delà des comptes inclus", () => {
    expect(prixAbonnementMensuel(4)).toMatchObject({
      total: 69 + mini.parCompteSup,
      employesSupplementaires: 1,
    });
    expect(prixAbonnementMensuel(16, pro).total).toBe(199 + pro.parCompteSup);
  });

  it("ajoute le dépassement d'appareils", () => {
    expect(prixAbonnementMensuel(3, mini, 28).total).toBe(69 + 28);
  });

  it("utilise le prix annuel propre à l'offre", () => {
    const p = prixAbonnementMensuel(3, mini);
    expect(p.mensuelSiAnnuel).toBe(57.5);
    expect(p.totalAnnuel).toBe(690);
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
