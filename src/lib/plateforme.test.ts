import { describe, expect, it } from "vitest";
import { prixAbonnementMensuel } from "@/lib/plateforme";

describe("prixAbonnementMensuel", () => {
  it("conserve le prix de base jusqu'au nombre de comptes inclus", () => {
    expect(prixAbonnementMensuel(0).total).toBe(49);
    expect(prixAbonnementMensuel(3).total).toBe(49);
  });

  it("ajoute automatiquement chaque compte facturable supplémentaire", () => {
    expect(prixAbonnementMensuel(4)).toMatchObject({
      total: 61,
      employesSupplementaires: 1,
      parEmployeSup: 12,
    });
    expect(prixAbonnementMensuel(8).total).toBe(109);
  });
});
