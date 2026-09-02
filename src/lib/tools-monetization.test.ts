import { describe, expect, it } from "vitest";
import { isToolsSku, normalizeToolsStripeStatus, toolsPriceVariableFor, toolsStripeConfiguration } from "./tools-monetization";

describe("monétisation serveur Tools", () => {
  it("refuse les SKU non canoniques", () => {
    expect(isToolsSku("tools_pro_monthly")).toBe(true);
    expect(isToolsSku("tools_lifetime")).toBe(false);
  });

  it("normalise les statuts Stripe", () => {
    expect(normalizeToolsStripeStatus("trialing")).toBe("active");
    expect(normalizeToolsStripeStatus("past_due")).toBe("past_due");
    expect(normalizeToolsStripeStatus("canceled")).toBe("expired");
  });

  it("sépare strictement le catalogue Tools", () => {
    expect(toolsPriceVariableFor("tools_pro_annual")).toBe("STRIPE_TOOLS_PRICE_ANNUAL");
  });

  it("n'accepte que Stripe Test et deux Price IDs", () => {
    const config = toolsStripeConfiguration({
      STRIPE_TOOLS_SECRET_KEY: "sk_test_fixture", STRIPE_TOOLS_WEBHOOK_SECRET: "whsec_fixture",
      STRIPE_TOOLS_PRICE_MONTHLY: "price_test_monthly", STRIPE_TOOLS_PRICE_ANNUAL: "price_test_annual",
      TOOLS_APP_URL: "http://localhost:3020/",
    } as NodeJS.ProcessEnv);
    expect(config.ready).toBe(true);
    expect(config.appUrl).toBe("http://localhost:3020");
    expect(toolsStripeConfiguration({ STRIPE_TOOLS_SECRET_KEY: "sk_live_forbidden" } as NodeJS.ProcessEnv).ready).toBe(false);
  });
});
