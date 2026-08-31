import { registerPlugin } from "@capacitor/core";
import type { StoreProduct, ToolsProductSku } from "./monetization";

export type NativePurchase = {
  provider: "apple" | "google";
  productId: string;
  transactionJws?: string;
  purchaseToken?: string;
  transactionId?: string;
  pending: boolean;
};

type NativeBillingPlugin = {
  products(options: { productIds: string[] }): Promise<{ products: StoreProduct[] }>;
  purchase(options: { productId: string; appAccountToken: string }): Promise<NativePurchase>;
  restore(): Promise<{ purchases: NativePurchase[] }>;
  finish(options: { transactionId: string }): Promise<void>;
};

const NativeBilling = registerPlugin<NativeBillingPlugin>("NativeBilling");

export async function loadNativeProducts(productIds: string[]) {
  return (await NativeBilling.products({ productIds })).products;
}

export async function purchaseNativeProduct(productId: string, appAccountToken: string) {
  return NativeBilling.purchase({ productId, appAccountToken });
}

export async function restoreNativePurchases() {
  return (await NativeBilling.restore()).purchases;
}

export async function finishNativePurchase(transactionId: string) { await NativeBilling.finish({ transactionId }); }

export function skuFromNativeProductId(productId: string): ToolsProductSku | null {
  if (productId === "fr.elsatia.tools.pro.monthly" || productId === "tools_pro_monthly") return "tools_pro_monthly";
  if (productId === "fr.elsatia.tools.pro.annual" || productId === "tools_pro_annual") return "tools_pro_annual";
  return null;
}
