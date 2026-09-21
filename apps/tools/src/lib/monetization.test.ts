import { describe, expect, it } from "vitest";
import {
  entitlementSourceForProvider, grantsPro, normalizeAppleStatus, normalizeGoogleStatus,
  normalizeStripeStatus, productIdForProvider, providerForPlatform, shouldPreventDuplicatePurchase,
} from "./monetization";

describe("catalogue monétisation Tools", () => {
  it("sépare les identifiants métier et fournisseurs", () => {
    expect(productIdForProvider("tools_pro_monthly", "apple")).toBe("fr.elsatia.tools.pro.monthly");
    expect(productIdForProvider("tools_pro_monthly", "google")).toBe("tools_pro_monthly");
    expect(productIdForProvider("tools_pro_annual", "stripe")).toBe("STRIPE_TOOLS_PRICE_ANNUAL");
  });

  it("sélectionne le fournisseur selon la plateforme", () => {
    expect(providerForPlatform("web")).toBe("stripe");
    expect(providerForPlatform("ios")).toBe("apple");
    expect(providerForPlatform("android")).toBe("google");
    expect(entitlementSourceForProvider("stripe")).toBe("web");
  });
});

describe("normalisation des abonnements", () => {
  it("normalise Stripe sans retirer une période payée annulée", () => {
    expect(normalizeStripeStatus("active")).toBe("active");
    expect(normalizeStripeStatus("past_due")).toBe("past_due");
    expect(normalizeStripeStatus("canceled")).toBe("expired");
  });

  it("normalise Apple avec révocation prioritaire", () => {
    expect(normalizeAppleStatus({ revokedAt: "2026-08-30T00:00:00Z" })).toBe("revoked");
    expect(normalizeAppleStatus({ inGracePeriod: true })).toBe("grace");
    expect(normalizeAppleStatus({ expiresAt: "2026-08-29T00:00:00Z" }, Date.parse("2026-08-30T00:00:00Z"))).toBe("expired");
  });

  it("normalise Google et refuse pending/on hold", () => {
    expect(normalizeGoogleStatus("SUBSCRIPTION_STATE_ACTIVE")).toBe("active");
    expect(normalizeGoogleStatus("SUBSCRIPTION_STATE_IN_GRACE_PERIOD")).toBe("grace");
    expect(normalizeGoogleStatus("SUBSCRIPTION_STATE_ON_HOLD")).toBe("past_due");
    expect(normalizeGoogleStatus("SUBSCRIPTION_STATE_PENDING")).toBe("pending");
  });

  it("accorde Pro uniquement pour active/grace non expiré", () => {
    const now = Date.parse("2026-08-30T00:00:00Z");
    expect(grantsPro("active", "2026-09-01T00:00:00Z", now)).toBe(true);
    expect(grantsPro("grace", null, now)).toBe(true);
    expect(grantsPro("active", "2026-08-29T00:00:00Z", now)).toBe(false);
    expect(grantsPro("past_due", null, now)).toBe(false);
  });

  it("bloque le double achat dès qu'une source Pro existe", () => {
    expect(shouldPreventDuplicatePurchase(["apple"])).toBe(true);
    expect(shouldPreventDuplicatePurchase(["free-default"])).toBe(false);
    expect(shouldPreventDuplicatePurchase(["plateforme"])).toBe(true);
  });
});
