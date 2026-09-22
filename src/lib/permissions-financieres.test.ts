import { describe, expect, it } from "vitest";
import { peutExporterComptabilite } from "@/lib/permissions-financieres";

describe("permissions financières", () => {
  it("refuse un membre sans accès aux exports", () => {
    expect(peutExporterComptabilite([])).toBe(false);
    expect(peutExporterComptabilite(["acces_factures", "acces_rentabilite"])).toBe(false);
  });

  it("autorise seulement le droit explicite ou l'accès complet contrôlé", () => {
    expect(peutExporterComptabilite(["acces_exports"])).toBe(true);
    expect(peutExporterComptabilite(null)).toBe(true);
  });
});
