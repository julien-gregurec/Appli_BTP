import { describe, expect, it } from "vitest";
import { projectionHebdomadaire, type FluxTresorerie } from "./tresorerie";

describe("projection de trésorerie détaillée", () => {
  it("conserve le détail de chaque échéance dans la bonne semaine", () => {
    const flux: FluxTresorerie[] = [
      { date: "2026-07-16", montant: 1200, type: "entree", source: "facture_client", reference: "FAC-001", tiers: "Client A" },
      { date: "2026-07-18", montant: 200, type: "sortie", source: "facture_fournisseur", reference: "FF-001", tiers: "Fournisseur B" },
      { date: "2026-07-25", montant: 50, type: "sortie", source: "charge_recurrente", libelle: "Téléphone" },
    ];

    const projection = projectionHebdomadaire(flux, "2026-07-16", 2);

    expect(projection[0]).toMatchObject({ entrees: 1200, sorties: 200, net: 1000, detailsEntrees: 1, detailsSorties: 1 });
    expect(projection[0].details.map((detail) => detail.reference)).toEqual(["FAC-001", "FF-001"]);
    expect(projection[1]).toMatchObject({ entrees: 0, sorties: 50, net: -50, cumul: 950 });
    expect(projection[1].details[0].libelle).toBe("Téléphone");
  });

  it("regroupe les échéances dépassées dans la première semaine", () => {
    const projection = projectionHebdomadaire([
      { date: "2026-07-01", montant: 100, type: "sortie", reference: "RETARD" },
    ], "2026-07-16", 1);

    expect(projection[0].sorties).toBe(100);
    expect(projection[0].details[0].reference).toBe("RETARD");
  });
});
