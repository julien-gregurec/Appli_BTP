import { describe, expect, it } from "vitest";
import { formatWorkingPrice, hasReleveMetre, isReleveMetrePurchasable, RELEVE_METRE_CAPABILITY, RELEVE_METRE_OFFER, TOOLS_ADDON_CAPABILITIES } from "./entitlement";

describe("entitlement premium releve-metre", () => {
  it("fige la capability candidate et l'add-on", () => {
    expect(RELEVE_METRE_CAPABILITY).toBe("releve-metre");
    expect(TOOLS_ADDON_CAPABILITIES).toEqual(["releve-metre"]);
    expect(hasReleveMetre(["export-pdf", "releve-metre"])).toBe(true);
    expect(hasReleveMetre(new Set(["export-pdf"]))).toBe(false);
  });

  it("porte les prix de travail par utilisateur, HT", () => {
    expect(RELEVE_METRE_OFFER).toMatchObject({ monthlyPriceCents: 2490, annualPriceCents: 24900, vat: "HT", perUser: true, includesToolsPro: true });
    expect(formatWorkingPrice(RELEVE_METRE_OFFER.monthlyPriceCents).replace(/\s/g, " ")).toBe("24,90 € HT");
    expect(formatWorkingPrice(RELEVE_METRE_OFFER.annualPriceCents).replace(/\s/g, " ")).toBe("249,00 € HT");
  });

  it("n'est pas commercialement activé", () => {
    expect(RELEVE_METRE_OFFER.commercialActivation).toBe(false);
    expect(RELEVE_METRE_OFFER.status).toBe("working-price");
    expect(isReleveMetrePurchasable()).toBe(false);
    expect(Object.isFrozen(RELEVE_METRE_OFFER)).toBe(true);
  });
});
