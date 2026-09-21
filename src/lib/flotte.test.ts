import { describe, expect, it } from "vitest";
import { STATUTS_VEHICULE } from "./flotte";

describe("statuts véhicule (ELS-REC-005)", () => {
  it("fournit un libellé français accentué pour chaque statut connu, jamais la valeur technique brute", () => {
    expect(STATUTS_VEHICULE.actif.label).toBe("Actif");
    expect(STATUTS_VEHICULE.maintenance.label).toBe("Maintenance");
    expect(STATUTS_VEHICULE.vendu.label).toBe("Vendu");
    expect(STATUTS_VEHICULE.hors_service.label).toBe("Hors service");
    for (const [cle, valeur] of Object.entries(STATUTS_VEHICULE)) {
      expect(valeur.label).not.toBe(cle);
      expect(valeur.label).not.toContain("_");
    }
  });
});
