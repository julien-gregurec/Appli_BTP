import type { EntitlementSource } from "./access";
import type { RuntimePlatform } from "./platform";

export const TOOLS_PRODUCT_SKUS = ["tools_pro_monthly", "tools_pro_annual"] as const;
export type ToolsProductSku = (typeof TOOLS_PRODUCT_SKUS)[number];
export type BillingPeriod = "monthly" | "annual";
export type MonetizationProvider = "stripe" | "apple" | "google";
export type SubscriptionStatus = "active" | "grace" | "past_due" | "expired" | "revoked" | "pending";

export type ProductDefinition = {
  sku: ToolsProductSku;
  period: BillingPeriod;
  appleProductId: string;
  googleProductId: string;
  stripePriceEnv: "STRIPE_TOOLS_PRICE_MONTHLY" | "STRIPE_TOOLS_PRICE_ANNUAL";
};

export const TOOLS_PRODUCTS: Readonly<Record<ToolsProductSku, ProductDefinition>> = {
  tools_pro_monthly: {
    sku: "tools_pro_monthly",
    period: "monthly",
    appleProductId: "fr.elsatia.tools.pro.monthly",
    googleProductId: "tools_pro_monthly",
    stripePriceEnv: "STRIPE_TOOLS_PRICE_MONTHLY",
  },
  tools_pro_annual: {
    sku: "tools_pro_annual",
    period: "annual",
    appleProductId: "fr.elsatia.tools.pro.annual",
    googleProductId: "tools_pro_annual",
    stripePriceEnv: "STRIPE_TOOLS_PRICE_ANNUAL",
  },
};

export type StoreProduct = {
  sku: ToolsProductSku;
  provider: MonetizationProvider;
  productId: string;
  displayPrice: string | null;
  currencyCode: string | null;
  period: BillingPeriod;
  available: boolean;
};

export function isToolsProductSku(value: unknown): value is ToolsProductSku {
  return typeof value === "string" && TOOLS_PRODUCT_SKUS.includes(value as ToolsProductSku);
}

export function providerForPlatform(platform: RuntimePlatform): MonetizationProvider {
  if (platform === "ios") return "apple";
  if (platform === "android") return "google";
  return "stripe";
}

export function entitlementSourceForProvider(provider: MonetizationProvider): EntitlementSource {
  return provider === "stripe" ? "web" : provider;
}

export function productIdForProvider(sku: ToolsProductSku, provider: MonetizationProvider) {
  const product = TOOLS_PRODUCTS[sku];
  if (provider === "apple") return product.appleProductId;
  if (provider === "google") return product.googleProductId;
  return product.stripePriceEnv;
}

export function normalizeStripeStatus(status: string): SubscriptionStatus {
  if (["active", "trialing"].includes(status)) return "active";
  if (status === "past_due") return "past_due";
  if (["incomplete", "paused"].includes(status)) return "pending";
  if (["canceled", "unpaid", "incomplete_expired"].includes(status)) return "expired";
  return "pending";
}

export function normalizeAppleStatus(params: { expiresAt?: string | null; revokedAt?: string | null; inGracePeriod?: boolean }, now = Date.now()): SubscriptionStatus {
  if (params.revokedAt) return "revoked";
  if (params.inGracePeriod) return "grace";
  if (params.expiresAt && Date.parse(params.expiresAt) <= now) return "expired";
  return "active";
}

export function normalizeGoogleStatus(status: string): SubscriptionStatus {
  if (["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_CANCELED"].includes(status)) return "active";
  if (status === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") return "grace";
  if (["SUBSCRIPTION_STATE_ON_HOLD", "SUBSCRIPTION_STATE_PAUSED"].includes(status)) return "past_due";
  if (status === "SUBSCRIPTION_STATE_PENDING") return "pending";
  if (["SUBSCRIPTION_STATE_EXPIRED", "SUBSCRIPTION_STATE_CANCELED_BY_DEVELOPER"].includes(status)) return "expired";
  return "pending";
}

export function grantsPro(status: SubscriptionStatus, expiresAt?: string | null, now = Date.now()) {
  return (status === "active" || status === "grace") && (!expiresAt || Date.parse(expiresAt) > now);
}

export function shouldPreventDuplicatePurchase(activeSources: readonly EntitlementSource[]) {
  return activeSources.some((source) => source !== "free-default");
}
