import { describe, expect, it } from "vitest";
import { calculerEcheanceFournisseur, etatEcheanceFournisseur } from "@/lib/echeances-fournisseurs";

describe("échéances fournisseurs", () => {
  it("calcule les délais immédiat, 30 et 90 jours", () => {
    expect(calculerEcheanceFournisseur("2026-07-17", 0)).toBe("2026-07-17");
    expect(calculerEcheanceFournisseur("2026-07-17", 30)).toBe("2026-08-16");
    expect(calculerEcheanceFournisseur("2026-07-17", 90)).toBe("2026-10-15");
  });

  it("signale les échéances proches et dépassées", () => {
    const maintenant = new Date("2026-07-17T08:00:00Z");
    expect(etatEcheanceFournisseur("2026-07-17", maintenant)?.niveau).toBe("urgent");
    expect(etatEcheanceFournisseur("2026-07-20", maintenant)?.niveau).toBe("proche");
    expect(etatEcheanceFournisseur("2026-07-15", maintenant)?.niveau).toBe("retard");
  });
});
