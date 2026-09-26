import { Browser } from "@capacitor/browser";
import { getRuntimePlatform } from "./platform";
import { TOOLS_PRODUCTS, type StoreProduct, type ToolsProductSku } from "./monetization";
import { finishNativePurchase, loadNativeProducts, purchaseNativeProduct, restoreNativePurchases, type NativePurchase } from "./native-billing";

function apiBase() { return process.env.NEXT_PUBLIC_TOOLS_BILLING_API_URL?.replace(/\/$/, "") ?? ""; }
export function monetizationConfigured() { return Boolean(apiBase()); }

async function billingRequest(path: string, accessToken: string, body?: unknown) {
  const response = await fetch(`${apiBase()}${path}`, {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { error?: string; url?: string; verified?: boolean; status?: string };
  if (!response.ok) throw new Error(data.error || "Service de paiement indisponible.");
  return data;
}

export async function loadStoreProducts(): Promise<StoreProduct[]> {
  const platform = getRuntimePlatform();
  if (platform === "web") {
    const response = await fetch(`${apiBase()}/api/tools/monetization/catalog`, { cache: "no-store" });
    const data = await response.json().catch(() => ({})) as { products?: StoreProduct[] };
    if (!response.ok) throw new Error("Catalogue Stripe indisponible.");
    return data.products ?? [];
  }
  const ids = Object.values(TOOLS_PRODUCTS).map((product) => platform === "ios" ? product.appleProductId : product.googleProductId);
  return loadNativeProducts(ids);
}

async function verifyNativePurchase(purchase: NativePurchase, accessToken: string) {
  if (purchase.pending) return "pending";
  if (purchase.provider === "apple") {
    if (!purchase.transactionJws) throw new Error("Transaction Apple incomplète.");
    const result = await billingRequest("/api/tools/monetization/apple/verify", accessToken, { signedTransaction: purchase.transactionJws });
    if (purchase.transactionId) await finishNativePurchase(purchase.transactionId);
    return result.status ?? "active";
  }
  if (!purchase.purchaseToken) throw new Error("Achat Google incomplet.");
  const result = await billingRequest("/api/tools/monetization/google/verify", accessToken, { purchaseToken: purchase.purchaseToken });
  return result.status ?? "active";
}

export async function startToolsPurchase(sku: ToolsProductSku, userId: string, accessToken: string) {
  const platform = getRuntimePlatform();
  if (platform === "web") {
    const result = await billingRequest("/api/tools/monetization/checkout", accessToken, { sku });
    if (!result.url) throw new Error("Checkout Stripe indisponible.");
    window.location.assign(result.url); return "redirect";
  }
  const product = TOOLS_PRODUCTS[sku];
  const purchase = await purchaseNativeProduct(platform === "ios" ? product.appleProductId : product.googleProductId, userId);
  return verifyNativePurchase(purchase, accessToken);
}

export async function restoreToolsPurchases(accessToken: string) {
  const purchases = await restoreNativePurchases();
  const statuses: string[] = [];
  for (const purchase of purchases) statuses.push(await verifyNativePurchase(purchase, accessToken));
  return statuses;
}

export async function manageToolsSubscription(accessToken: string, source: "web" | "apple" | "google") {
  if (source === "apple") { await Browser.open({ url: "https://apps.apple.com/account/subscriptions" }); return; }
  if (source === "google") { await Browser.open({ url: "https://play.google.com/store/account/subscriptions?package=fr.elsatia.tools" }); return; }
  const result = await billingRequest("/api/tools/monetization/portal", accessToken);
  if (!result.url) throw new Error("Portail d’abonnement indisponible.");
  window.location.assign(result.url);
}
