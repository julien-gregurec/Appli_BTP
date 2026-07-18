import { describe, expect, it } from "vitest";
import { OFFRES, prixAbonnementMensuel, recommanderOffre, REDUCTION_ANNUELLE } from "@/lib/plateforme";

const essentiel = OFFRES[0]; // base 59, 2 comptes inclus, +15 / compte
const pro = OFFRES[1];       // base 129, 5 comptes inclus, +15 / compte

describe("prixAbonnementMensuel", () => {
  it("conserve le prix de base jusqu'au nombre de comptes inclus", () => {
    expect(prixAbonnementMensuel(0).total).toBe(essentiel.base);
    expect(prixAbonnementMensuel(2).total).toBe(essentiel.base);
  });

  it("facture chaque compte au-delà des comptes inclus", () => {
    expect(prixAbonnementMensuel(3)).toMatchObject({
      total: essentiel.base + essentiel.parCompteSup, // 74
      employesSupplementaires: 1,
    });
    expect(prixAbonnementMensuel(6, pro).total).toBe(pro.base + pro.parCompteSup); // 6 comptes, 5 inclus
  });

  it("ajoute le dépassement d'appareils", () => {
    expect(prixAbonnementMensuel(2, essentiel, 28).total).toBe(essentiel.base + 28);
  });

  it("applique la remise annuelle", () => {
    const p = prixAbonnementMensuel(2, essentiel);
    expect(p.mensuelSiAnnuel).toBe(Math.round(essentiel.base * (1 - REDUCTION_ANNUELLE)));
    expect(p.totalAnnuel).toBe(Math.round(essentiel.base * 12 * (1 - REDUCTION_ANNUELLE)));
  });
});

describe("recommanderOffre", () => {
  it("recommande le palier le plus élevé exigé par les besoins", () => {
    expect(recommanderOffre(["devis_factures"], 1).offre.cle).toBe("essentiel");
    expect(recommanderOffre(["planning"], 4).offre.cle).toBe("pro");
    expect(recommanderOffre(["notes_frais"], 20).offre.cle).toBe("premium");
  });
});
