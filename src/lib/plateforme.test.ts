import { describe, expect, it } from "vitest";
import { OFFRES, prixAbonnementMensuel, recommanderOffre, REDUCTION_ANNUELLE } from "@/lib/plateforme";

const mini = OFFRES[0];
const pro = OFFRES[1];

describe("prixAbonnementMensuel", () => {
  it("conserve le prix de base jusqu'au nombre de comptes inclus", () => {
    expect(prixAbonnementMensuel(0).total).toBe(mini.base);
    expect(prixAbonnementMensuel(3).total).toBe(mini.base);
  });

  it("facture chaque compte au-delà des comptes inclus", () => {
    expect(prixAbonnementMensuel(4)).toMatchObject({
      total: mini.base + mini.parCompteSup,
      employesSupplementaires: 1,
    });
    expect(prixAbonnementMensuel(16, pro).total).toBe(pro.base + pro.parCompteSup);
  });

  it("ajoute le dépassement d'appareils", () => {
    expect(prixAbonnementMensuel(3, mini, 28).total).toBe(mini.base + 28);
  });

  it("utilise le prix annuel propre à l'offre", () => {
    const p = prixAbonnementMensuel(3, mini);
    expect(REDUCTION_ANNUELLE).toBe(0);
    expect(p.mensuelSiAnnuel).toBe(mini.prixAnnuelCentimes / 100 / 12);
    expect(p.totalAnnuel).toBe(mini.prixAnnuelCentimes / 100);
  });
});

describe("recommanderOffre", () => {
  it("recommande le palier le plus élevé exigé par les besoins", () => {
    expect(recommanderOffre(["devis_factures"], 1).offre.cle).toBe("mini");
    expect(recommanderOffre(["planning"], 4).offre.cle).toBe("pro");
    expect(recommanderOffre(["stock"], 20).offre.cle).toBe("business");
    expect(recommanderOffre(["portail_client"], 20).offre.cle).toBe("entreprise");
  });
});
