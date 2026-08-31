import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export const TOOLS_SKUS = ["tools_pro_monthly", "tools_pro_annual"] as const;
export type ToolsSku = (typeof TOOLS_SKUS)[number];
export type ToolsSubscriptionStatus = "active" | "grace" | "past_due" | "expired" | "revoked" | "pending";

const PRICE_VARIABLES: Record<ToolsSku, "STRIPE_TOOLS_PRICE_MONTHLY" | "STRIPE_TOOLS_PRICE_ANNUAL"> = {
  tools_pro_monthly: "STRIPE_TOOLS_PRICE_MONTHLY",
  tools_pro_annual: "STRIPE_TOOLS_PRICE_ANNUAL",
};

export type StripeToolsSubscription = {
  id: string;
  customer: string | { id?: string };
  status: string;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end?: boolean;
  canceled_at?: number | null;
  metadata?: Record<string, string>;
  items?: { data?: Array<{ price?: { id?: string }; current_period_start?: number; current_period_end?: number }> };
};

type StripeResponse = { id?: string; url?: string | null; error?: { message?: string } };

export function isToolsSku(value: unknown): value is ToolsSku {
  return typeof value === "string" && TOOLS_SKUS.includes(value as ToolsSku);
}

export function normalizeToolsStripeStatus(status: string): ToolsSubscriptionStatus {
  if (["active", "trialing"].includes(status)) return "active";
  if (status === "past_due") return "past_due";
  if (["incomplete", "paused"].includes(status)) return "pending";
  if (["canceled", "unpaid", "incomplete_expired"].includes(status)) return "expired";
  return "pending";
}

export function toolsStripeConfiguration(environment: NodeJS.ProcessEnv = process.env) {
  const secret = environment.STRIPE_TOOLS_SECRET_KEY;
  const webhookSecret = environment.STRIPE_TOOLS_WEBHOOK_SECRET;
  const appUrl = environment.TOOLS_APP_URL?.replace(/\/$/, "");
  const prices = {
    tools_pro_monthly: environment.STRIPE_TOOLS_PRICE_MONTHLY || null,
    tools_pro_annual: environment.STRIPE_TOOLS_PRICE_ANNUAL || null,
  } satisfies Record<ToolsSku, string | null>;
  const testMode = Boolean(secret?.startsWith("sk_test_") && !Object.values(prices).some((price) => price?.startsWith("price_live_")));
  return { secret, webhookSecret, appUrl, prices, testMode, ready: Boolean(secret && webhookSecret && appUrl && prices.tools_pro_monthly && prices.tools_pro_annual && testMode) };
}

async function stripeRequest<T extends StripeResponse>(path: string, options: { body?: URLSearchParams; method?: "GET" | "POST"; idempotencyKey?: string } = {}) {
  const config = toolsStripeConfiguration();
  if (!config.secret || !config.testMode) throw new Error("Stripe Tools Test n’est pas configuré");
  const response = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: options.method ?? "POST",
    headers: {
      Authorization: `Bearer ${config.secret}`,
      ...(options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(options.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: options.body,
    cache: "no-store",
  });
  const data = await response.json() as T;
  if (!response.ok) throw new Error(data.error?.message || "Stripe a refusé l’opération Tools");
  return data;
}

export async function authenticatedToolsUser(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return null;
  const { data, error } = await createAdminClient().auth.getUser(token);
  return error ? null : data.user;
}

export async function toolsHasActiveSubscription(userId: string) {
  const { data, error } = await createAdminClient().from("tools_monetization_subscriptions")
    .select("provider,status,expires_at")
    .eq("user_id", userId)
    .in("status", ["active", "grace"]);
  if (error) throw new Error(error.message);
  return (data ?? []).some((entry) => !entry.expires_at || Date.parse(entry.expires_at) > Date.now());
}

export async function getOrCreateToolsStripeCustomer(user: { id: string; email?: string | null }) {
  const admin = createAdminClient();
  const { data: existing, error } = await admin.from("tools_monetization_customers")
    .select("external_customer_id").eq("user_id", user.id).eq("provider", "stripe").eq("environment", "test").maybeSingle();
  if (error) throw new Error(error.message);
  if (existing?.external_customer_id) return existing.external_customer_id as string;
  const body = new URLSearchParams({ "metadata[elsatia_user_id]": user.id, "metadata[application]": "tools" });
  if (user.email) body.set("email", user.email);
  const customer = await stripeRequest<{ id: string } & StripeResponse>("customers", { body, idempotencyKey: `tools-customer-${user.id}` });
  const { error: saveError } = await admin.from("tools_monetization_customers").upsert({
    user_id: user.id, provider: "stripe", environment: "test", external_customer_id: customer.id,
  }, { onConflict: "user_id,provider,environment" });
  if (saveError) throw new Error(saveError.message);
  return customer.id;
}

export async function createToolsCheckout(user: { id: string; email?: string | null }, sku: ToolsSku) {
  const config = toolsStripeConfiguration();
  const price = config.prices[sku];
  if (!config.ready || !price || !config.appUrl) throw new Error("Catalogue Stripe Tools Test incomplet");
  if (await toolsHasActiveSubscription(user.id)) throw new Error("Tools Pro est déjà actif sur ce compte.");
  const customer = await getOrCreateToolsStripeCustomer(user);
  const body = new URLSearchParams({
    mode: "subscription", customer, client_reference_id: user.id,
    success_url: `${config.appUrl}/compte?checkout=success`, cancel_url: `${config.appUrl}/compte?checkout=cancel`,
    "line_items[0][price]": price, "line_items[0][quantity]": "1",
    "metadata[elsatia_user_id]": user.id, "metadata[application]": "tools", "metadata[product_sku]": sku,
    "subscription_data[metadata][elsatia_user_id]": user.id,
    "subscription_data[metadata][application]": "tools",
    "subscription_data[metadata][product_sku]": sku,
  });
  return stripeRequest<{ id: string; url: string | null } & StripeResponse>("checkout/sessions", {
    body, idempotencyKey: `tools-checkout-${user.id}-${sku}-${new Date().toISOString().slice(0, 10)}`,
  });
}

export async function createToolsPortal(userId: string) {
  const config = toolsStripeConfiguration();
  if (!config.ready || !config.appUrl) throw new Error("Stripe Tools Test n’est pas configuré");
  const { data, error } = await createAdminClient().from("tools_monetization_customers")
    .select("external_customer_id").eq("user_id", userId).eq("provider", "stripe").eq("environment", "test").maybeSingle();
  if (error || !data?.external_customer_id) throw new Error("Aucun abonnement Web à gérer");
  return stripeRequest<{ id: string; url: string | null } & StripeResponse>("billing_portal/sessions", {
    body: new URLSearchParams({ customer: data.external_customer_id, return_url: `${config.appUrl}/compte` }),
    idempotencyKey: `tools-portal-${userId}-${crypto.randomUUID()}`,
  });
}

export async function retrieveToolsStripeSubscription(subscriptionId: string) {
  return stripeRequest<StripeToolsSubscription & StripeResponse>(`subscriptions/${encodeURIComponent(subscriptionId)}`, { method: "GET" });
}

export async function retrieveToolsStripeInvoice(invoiceId: string) {
  return stripeRequest<{ id: string; subscription?: string | { id?: string } | null } & StripeResponse>(`invoices/${encodeURIComponent(invoiceId)}`, { method: "GET" });
}

export async function toolsStripeCatalog() {
  const config = toolsStripeConfiguration();
  if (!config.ready) throw new Error("Catalogue Stripe Tools Test incomplet");
  return Promise.all(TOOLS_SKUS.map(async (sku) => {
    const priceId = config.prices[sku]!;
    const price = await stripeRequest<{ id: string; active: boolean; currency: string; unit_amount: number | null; recurring?: { interval?: string } } & StripeResponse>(`prices/${encodeURIComponent(priceId)}`, { method: "GET" });
    if (!price.active || price.unit_amount === null) throw new Error("Price Stripe Tools indisponible");
    return {
      sku,
      provider: "stripe" as const,
      productId: PRICE_VARIABLES[sku],
      displayPrice: new Intl.NumberFormat("fr-FR", { style: "currency", currency: price.currency.toUpperCase() }).format(price.unit_amount / 100),
      currencyCode: price.currency.toUpperCase(),
      period: sku.endsWith("annual") ? "annual" as const : "monthly" as const,
      available: true,
    };
  }));
}

export function stripeSubscriptionPayload(subscription: StripeToolsSubscription, userId: string, event: { id: string; type: string }) {
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.id || "";
  const config = toolsStripeConfiguration();
  const sku = (Object.entries(config.prices).find(([, id]) => id === priceId)?.[0] ?? subscription.metadata?.product_sku) as ToolsSku | undefined;
  if (!isToolsSku(sku)) throw new Error("Price Stripe Tools inconnu");
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;
  return {
    user_id: userId, provider: "stripe", environment: "test", product_sku: sku,
    external_product_id: priceId, external_subscription_id: subscription.id,
    external_transaction_id: null, status: normalizeToolsStripeStatus(subscription.status), raw_status: subscription.status,
    purchased_at: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    expires_at: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    renews_at: !subscription.cancel_at_period_end && periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    revoked_at: null, auto_renews: !subscription.cancel_at_period_end,
    event_type: event.type, external_event_id: event.id,
    metadata: { stripe_customer_id: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id },
  };
}

export const toolsPriceVariableFor = (sku: ToolsSku) => PRICE_VARIABLES[sku];

function allowedToolsOrigins() {
  return new Set(["https://tools.elsatia.fr", "http://localhost:3020", "http://localhost:3021", "capacitor://localhost", "https://localhost",
    ...(process.env.TOOLS_ALLOWED_ORIGINS?.split(",").map((value) => value.trim()).filter(Boolean) ?? [])]);
}
export function toolsCorsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const headers = new Headers({ "Vary": "Origin", "Access-Control-Allow-Headers": "authorization,content-type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" });
  if (origin && allowedToolsOrigins().has(origin)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}
export function toolsJson(request: Request, body: unknown, status = 200) { return Response.json(body, { status, headers: toolsCorsHeaders(request) }); }
export function toolsOptions(request: Request) { return new Response(null, { status: 204, headers: toolsCorsHeaders(request) }); }

export type ToolsEventReservation = {
  provider: "stripe" | "apple" | "google";
  environment: "test" | "sandbox";
  externalEventId: string;
  eventType: string;
  userId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function reserveToolsMonetizationEvent(event: ToolsEventReservation) {
  const admin = createAdminClient();
  const key = { provider: event.provider, environment: event.environment, external_event_id: event.externalEventId };
  const row = {
    ...key,
    event_type: event.eventType,
    user_id: event.userId ?? null,
    status: "processing",
    created_at: new Date().toISOString(),
    processed_at: null,
    metadata: event.metadata ?? {},
  };
  const { error } = await admin.from("tools_monetization_events").insert(row);
  if (!error) return { admin, duplicate: false };
  if (error.code !== "23505") throw new Error(error.message);

  const { data: existing, error: readError } = await admin.from("tools_monetization_events")
    .select("status,created_at").match(key).maybeSingle();
  if (readError) throw new Error(readError.message);
  const stale = existing?.status === "processing" && Date.parse(existing.created_at) < Date.now() - 5 * 60 * 1000;
  if (existing?.status !== "failed" && !stale) return { admin, duplicate: true };

  const { data: retried, error: retryError } = await admin.from("tools_monetization_events")
    .update(row).match(key).eq("status", existing.status).eq("created_at", existing.created_at).select("id").maybeSingle();
  if (retryError) throw new Error(retryError.message);
  return { admin, duplicate: !retried };
}

export async function failToolsMonetizationEvent(event: Pick<ToolsEventReservation, "provider" | "environment" | "externalEventId">) {
  await createAdminClient().from("tools_monetization_events").update({ status: "failed", processed_at: new Date().toISOString() })
    .eq("provider", event.provider).eq("environment", event.environment).eq("external_event_id", event.externalEventId);
}
