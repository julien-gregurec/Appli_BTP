import { describe, expect, it } from "vitest";
import { permissionDelegationPour } from "./alertes-delegation";

describe("permissionDelegationPour", () => {
  it("associe chaque domaine connu au droit de gestion existant correspondant", () => {
    expect(permissionDelegationPour("Facturation")).toBe("gerer_factures");
    expect(permissionDelegationPour("Commercial")).toBe("gerer_devis");
    expect(permissionDelegationPour("Stock")).toBe("gerer_stock");
    expect(permissionDelegationPour("Flotte")).toBe("gerer_flotte");
    expect(permissionDelegationPour("Outillage")).toBe("gerer_outillage");
    expect(permissionDelegationPour("Achats")).toBe("gerer_achats");
  });

  it("refuse un domaine inconnu plutôt que de l'autoriser par erreur", () => {
    expect(permissionDelegationPour("Domaine futur non relié")).toBeNull();
    expect(permissionDelegationPour("")).toBeNull();
  });
});
