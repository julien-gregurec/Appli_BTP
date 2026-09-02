import "server-only";
import { createHash } from "node:crypto";
import { Environment, SignedDataVerifier, type JWSTransactionDecodedPayload, type JWSRenewalInfoDecodedPayload } from "@apple/app-store-server-library";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ToolsSubscriptionStatus, ToolsSku } from "@/lib/tools-monetization";

const APP_ID = "fr.elsatia.tools";
const APPLE_PRODUCTS: Record<string, ToolsSku> = {
  "fr.elsatia.tools.pro.monthly": "tools_pro_monthly",
  "fr.elsatia.tools.pro.annual": "tools_pro_annual",
};
const GOOGLE_PRODUCTS: Record<string, ToolsSku> = {
  tools_pro_monthly: "tools_pro_monthly",
  tools_pro_annual: "tools_pro_annual",
};

function iso(value?: number | null) { return value ? new Date(value).toISOString() : null; }

function appleVerifier() {
  const roots = process.env.APPLE_ROOT_CA_BASE64?.split(",").map((value) => Buffer.from(value.trim(), "base64")).filter((value) => value.length > 0) ?? [];
  if (!roots.length) throw new Error("Certificats racine Apple non configurés");
  return new SignedDataVerifier(roots, true, Environment.SANDBOX, APP_ID);
}

export function appleStatus(transaction: Pick<JWSTransactionDecodedPayload, "expiresDate" | "revocationDate">, renewal?: Pick<JWSRenewalInfoDecodedPayload, "gracePeriodExpiresDate"> | null, now = Date.now()): ToolsSubscriptionStatus {
  if (transaction.revocationDate) return "revoked";
  if (renewal?.gracePeriodExpiresDate && renewal.gracePeriodExpiresDate > now) return "grace";
  if (transaction.expiresDate && transaction.expiresDate <= now) return "expired";
  return "active";
}

export async function verifyAppleTransaction(signedTransaction: string, expectedUserId?: string) {
  const verifier = appleVerifier();
  const transaction = await verifier.verifyAndDecodeTransaction(signedTransaction);
  if (transaction.environment !== Environment.SANDBOX || transaction.bundleId !== APP_ID) throw new Error("Transaction Apple hors sandbox ou mauvaise application");
  if (!transaction.productId || !APPLE_PRODUCTS[transaction.productId] || !transaction.originalTransactionId || !transaction.transactionId) throw new Error("Produit Apple Tools invalide");
  if (!transaction.appAccountToken || expectedUserId && transaction.appAccountToken !== expectedUserId) throw new Error("Compte ELSATIA Apple incohérent");
  return { verifier, transaction };
}

export function appleSubscriptionPayload(transaction: JWSTransactionDecodedPayload, event: { id: string; type: string }, renewal?: JWSRenewalInfoDecodedPayload | null) {
  const productId = transaction.productId as string;
  return {
    user_id: transaction.appAccountToken, provider: "apple", environment: "sandbox",
    product_sku: APPLE_PRODUCTS[productId], external_product_id: productId,
    external_subscription_id: transaction.originalTransactionId,
    external_transaction_id: transaction.transactionId,
    status: appleStatus(transaction, renewal), raw_status: event.type,
    purchased_at: iso(transaction.purchaseDate), expires_at: iso(transaction.expiresDate),
    renews_at: iso(renewal?.renewalDate), revoked_at: iso(transaction.revocationDate),
    auto_renews: renewal?.autoRenewStatus === 1,
    event_type: event.type, external_event_id: event.id,
    metadata: { storefront: transaction.storefront ?? null },
  };
}

export async function verifyAppleNotification(signedPayload: string) {
  const verifier = appleVerifier();
  const notification = await verifier.verifyAndDecodeNotification(signedPayload);
  if (notification.data?.environment !== Environment.SANDBOX) throw new Error("Notification Apple hors sandbox");
  const signedTransaction = notification.data?.signedTransactionInfo;
  if (!signedTransaction) return { notification, payload: null };
  const transaction = await verifier.verifyAndDecodeTransaction(signedTransaction);
  const renewal = notification.data?.signedRenewalInfo ? await verifier.verifyAndDecodeRenewalInfo(notification.data.signedRenewalInfo) : null;
  if (!notification.notificationUUID) throw new Error("Notification Apple sans identifiant");
  return { notification, payload: appleSubscriptionPayload(transaction, { id: notification.notificationUUID, type: String(notification.notificationType ?? "UNKNOWN") }, renewal) };
}

export function googleAccountId(userId: string) { return createHash("sha256").update(`elsatia-tools:${userId}`).digest("hex"); }

type GoogleSubscription = {
  subscriptionState?: string;
  acknowledgementState?: string;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{ productId?: string; expiryTime?: string; autoRenewingPlan?: { autoRenewEnabled?: boolean } }>;
  startTime?: string;
  latestOrderId?: string;
};

function googleCredentials() {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Compte de service Google Play non configuré");
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { throw new Error("Compte de service Google Play invalide"); }
}

async function googleClient() {
  const auth = new GoogleAuth({ credentials: googleCredentials(), scopes: ["https://www.googleapis.com/auth/androidpublisher"] });
  return auth.getClient();
}

export function googleStatus(status = ""): ToolsSubscriptionStatus {
  if (["SUBSCRIPTION_STATE_ACTIVE", "SUBSCRIPTION_STATE_CANCELED"].includes(status)) return "active";
  if (status === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") return "grace";
  if (["SUBSCRIPTION_STATE_ON_HOLD", "SUBSCRIPTION_STATE_PAUSED"].includes(status)) return "past_due";
  if (status === "SUBSCRIPTION_STATE_PENDING") return "pending";
  return "expired";
}

export async function retrieveGoogleSubscription(purchaseToken: string) {
  if (!purchaseToken || purchaseToken.length > 2000) throw new Error("Token Google invalide");
  const client = await googleClient();
  const response = await client.request<GoogleSubscription>({
    url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${APP_ID}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
  });
  return { client, subscription: response.data };
}

export function googleSubscriptionPayload(subscription: GoogleSubscription, purchaseToken: string, userId: string, event: { id: string; type: string }) {
  const item = subscription.lineItems?.[0];
  const productId = item?.productId ?? "";
  if (!GOOGLE_PRODUCTS[productId]) throw new Error("Produit Google Tools invalide");
  if (subscription.externalAccountIdentifiers?.obfuscatedExternalAccountId !== googleAccountId(userId)) throw new Error("Compte ELSATIA Google incohérent");
  return {
    user_id: userId, provider: "google", environment: "sandbox", product_sku: GOOGLE_PRODUCTS[productId],
    external_product_id: productId, external_subscription_id: purchaseToken,
    external_transaction_id: subscription.latestOrderId ?? null,
    status: googleStatus(subscription.subscriptionState), raw_status: subscription.subscriptionState ?? "UNKNOWN",
    purchased_at: subscription.startTime ?? null, expires_at: item?.expiryTime ?? null,
    renews_at: item?.autoRenewingPlan?.autoRenewEnabled ? item.expiryTime ?? null : null,
    revoked_at: null, auto_renews: item?.autoRenewingPlan?.autoRenewEnabled ?? false,
    event_type: event.type, external_event_id: event.id, metadata: {},
  };
}

export async function acknowledgeGoogleSubscription(purchaseToken: string, subscription: GoogleSubscription) {
  if (subscription.acknowledgementState !== "ACKNOWLEDGEMENT_STATE_PENDING") return;
  const productId = subscription.lineItems?.[0]?.productId;
  if (!productId || !GOOGLE_PRODUCTS[productId]) throw new Error("Produit Google Tools invalide");
  const client = await googleClient();
  await client.request({ method: "POST", url: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${APP_ID}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`, data: {} });
}

export async function saveGoogleAccountMapping(userId: string) {
  const { error } = await createAdminClient().from("tools_monetization_customers").upsert({
    user_id: userId, provider: "google", environment: "sandbox", external_customer_id: googleAccountId(userId),
  }, { onConflict: "user_id,provider,environment" });
  if (error) throw new Error(error.message);
}

export async function verifyGooglePubSubToken(token: string) {
  const audience = process.env.GOOGLE_PLAY_RTDN_AUDIENCE;
  const expectedEmail = process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL;
  if (!audience || !expectedEmail) throw new Error("Identité RTDN non configurée");
  const ticket = await new OAuth2Client().verifyIdToken({ idToken: token, audience });
  const payload = ticket.getPayload();
  if (!payload?.email_verified || payload.email !== expectedEmail) throw new Error("Identité RTDN invalide");
}
