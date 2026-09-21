import "server-only";
import { createHash } from "node:crypto";
import { Environment, SignedDataVerifier, type JWSTransactionDecodedPayload, type JWSRenewalInfoDecodedPayload } from "@apple/app-store-server-library";
import { GoogleAuth, OAuth2Client } from "google-auth-library";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ToolsSubscriptionStatus, ToolsSku } from "@/lib/tools-monetization";
import { assertTransactionEnvironmentAllowed, resolveToolsStoreEnvironment, type ToolsStoreEnvironment } from "@/lib/tools-store-environment";

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

/** Correspondance entre l'énumération de la bibliothèque Apple et notre vocabulaire de registre. */
const APPLE_ENVIRONMENTS: Record<string, ToolsStoreEnvironment> = {
  [Environment.SANDBOX]: "sandbox",
  [Environment.PRODUCTION]: "production",
};

function appleEnvironment(environment: ToolsStoreEnvironment) {
  return environment === "production" ? Environment.PRODUCTION : Environment.SANDBOX;
}

function appleVerifier(environment: ToolsStoreEnvironment) {
  const roots = process.env.APPLE_ROOT_CA_BASE64?.split(",").map((value) => Buffer.from(value.trim(), "base64")).filter((value) => value.length > 0) ?? [];
  if (!roots.length) throw new Error("Certificats racine Apple non configurés");
  return new SignedDataVerifier(roots, true, appleEnvironment(environment), APP_ID);
}

/*
 * Lecture NON VÉRIFIÉE de l'environnement annoncé par un JWS Apple.
 *
 * Elle ne sert qu'à choisir le vérificateur : `SignedDataVerifier` doit être construit pour un
 * environnement donné et refuse une charge utile qui n'en relève pas. On lit donc la revendication
 * pour instancier le bon vérificateur, puis c'est LUI qui fait foi — et la valeur retenue ensuite
 * est celle de la charge utile vérifiée, jamais celle-ci. Un JWS qui mentirait ici échouerait à la
 * vérification qui suit.
 */
export function readUnverifiedAppleEnvironment(jws: string): ToolsStoreEnvironment | null {
  const segment = jws.split(".")[1];
  if (!segment) return null;
  try {
    const payload = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
    const declared = payload.environment ?? (payload.data as Record<string, unknown> | undefined)?.environment;
    return typeof declared === "string" ? APPLE_ENVIRONMENTS[declared] ?? null : null;
  } catch {
    return null;
  }
}

export function appleStatus(transaction: Pick<JWSTransactionDecodedPayload, "expiresDate" | "revocationDate">, renewal?: Pick<JWSRenewalInfoDecodedPayload, "gracePeriodExpiresDate"> | null, now = Date.now()): ToolsSubscriptionStatus {
  if (transaction.revocationDate) return "revoked";
  if (renewal?.gracePeriodExpiresDate && renewal.gracePeriodExpiresDate > now) return "grace";
  if (transaction.expiresDate && transaction.expiresDate <= now) return "expired";
  return "active";
}

export async function verifyAppleTransaction(signedTransaction: string, expectedUserId?: string) {
  const verifier = appleVerifier(readUnverifiedAppleEnvironment(signedTransaction) ?? resolveToolsStoreEnvironment());
  const transaction = await verifier.verifyAndDecodeTransaction(signedTransaction);
  /* À partir d'ici, `transaction` est vérifiée : son environnement fait foi. */
  const environment = APPLE_ENVIRONMENTS[transaction.environment ?? ""];
  if (!environment) throw new Error("Environnement Apple inconnu");
  assertTransactionEnvironmentAllowed(environment);
  if (transaction.bundleId !== APP_ID) throw new Error("Transaction Apple pour une autre application");
  if (!transaction.productId || !APPLE_PRODUCTS[transaction.productId] || !transaction.originalTransactionId || !transaction.transactionId) throw new Error("Produit Apple Tools invalide");
  if (!transaction.appAccountToken || expectedUserId && transaction.appAccountToken !== expectedUserId) throw new Error("Compte ELSATIA Apple incohérent");
  return { verifier, transaction, environment };
}

export function appleSubscriptionPayload(transaction: JWSTransactionDecodedPayload, event: { id: string; type: string }, renewal?: JWSRenewalInfoDecodedPayload | null) {
  const productId = transaction.productId as string;
  /*
   * L'environnement inscrit est celui qu'Apple a signé dans la transaction vérifiée. C'est ce qui
   * permet à une phase TestFlight (bac à sable) et à la vente réelle (production) de coexister
   * dans le registre : toutes les clés d'unicité du schéma portent `environment`.
   */
  const environment = APPLE_ENVIRONMENTS[transaction.environment ?? ""];
  if (!environment) throw new Error("Environnement Apple inconnu");
  return {
    user_id: transaction.appAccountToken, provider: "apple", environment,
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
  const verifier = appleVerifier(readUnverifiedAppleEnvironment(signedPayload) ?? resolveToolsStoreEnvironment());
  const notification = await verifier.verifyAndDecodeNotification(signedPayload);
  /* Notification vérifiée : son environnement fait foi, et la politique de déploiement s'applique. */
  const environment = APPLE_ENVIRONMENTS[notification.data?.environment ?? ""];
  if (!environment) throw new Error("Environnement Apple inconnu");
  assertTransactionEnvironmentAllowed(environment);
  const signedTransaction = notification.data?.signedTransactionInfo;
  if (!signedTransaction) return { notification, environment, payload: null };
  const transaction = await verifier.verifyAndDecodeTransaction(signedTransaction);
  const renewal = notification.data?.signedRenewalInfo ? await verifier.verifyAndDecodeRenewalInfo(notification.data.signedRenewalInfo) : null;
  if (!notification.notificationUUID) throw new Error("Notification Apple sans identifiant");
  return { notification, environment, payload: appleSubscriptionPayload(transaction, { id: notification.notificationUUID, type: String(notification.notificationType ?? "UNKNOWN") }, renewal) };
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

/*
 * Google, contrairement à Apple, ne signe aucun environnement dans ses charges utiles : un achat
 * de testeur de licence et un achat réel empruntent le même point d'accès et se ressemblent trait
 * pour trait. L'environnement du registre est donc celui du DÉPLOIEMENT, résolu strictement — et
 * jamais une constante.
 */
export function googleSubscriptionPayload(subscription: GoogleSubscription, purchaseToken: string, userId: string, event: { id: string; type: string }, environment = resolveToolsStoreEnvironment()) {
  const item = subscription.lineItems?.[0];
  const productId = item?.productId ?? "";
  if (!GOOGLE_PRODUCTS[productId]) throw new Error("Produit Google Tools invalide");
  if (subscription.externalAccountIdentifiers?.obfuscatedExternalAccountId !== googleAccountId(userId)) throw new Error("Compte ELSATIA Google incohérent");
  return {
    user_id: userId, provider: "google", environment, product_sku: GOOGLE_PRODUCTS[productId],
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

export async function saveGoogleAccountMapping(userId: string, environment = resolveToolsStoreEnvironment()) {
  const { error } = await createAdminClient().from("tools_monetization_customers").upsert({
    user_id: userId, provider: "google", environment, external_customer_id: googleAccountId(userId),
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
