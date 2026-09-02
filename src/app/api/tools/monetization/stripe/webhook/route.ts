import { NextResponse } from "next/server";
import { verifierSignatureStripe } from "@/lib/stripe";
import { failToolsMonetizationEvent, reserveToolsMonetizationEvent, retrieveToolsStripeInvoice, retrieveToolsStripeSubscription, stripeSubscriptionPayload, toolsStripeConfiguration, type StripeToolsSubscription } from "@/lib/tools-monetization";

type Reference = string | { id?: string } | null | undefined;
type StripeObject = StripeToolsSubscription & { object?: string; subscription?: Reference; invoice?: Reference; metadata?: Record<string, string> };
type StripeEvent = { id: string; type: string; livemode: boolean; account?: string; data: { object: StripeObject } };

function id(reference: Reference) { return typeof reference === "string" ? reference : reference?.id || null; }

export async function POST(request: Request) {
  const config = toolsStripeConfiguration();
  if (!config.webhookSecret || !config.testMode) return NextResponse.json({ error: "Webhook Tools Test non configuré" }, { status: 503 });
  const raw = await request.text();
  if (!verifierSignatureStripe(raw, request.headers.get("stripe-signature"), config.webhookSecret)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }
  let event: StripeEvent;
  try { event = JSON.parse(raw) as StripeEvent; } catch { return NextResponse.json({ error: "JSON invalide" }, { status: 400 }); }
  if (event.livemode || event.account) return NextResponse.json({ error: "Événement Live/Connect refusé" }, { status: 400 });
  const accepted = ["checkout.session.completed", "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "invoice.paid", "invoice.payment_failed", "charge.refunded"];
  if (!accepted.includes(event.type)) return NextResponse.json({ received: true, ignored: true });

  let admin;
  try {
    const reservation = await reserveToolsMonetizationEvent({ provider: "stripe", environment: "test", externalEventId: event.id, eventType: event.type, metadata: { object_id: event.data.object.id } });
    if (reservation.duplicate) return NextResponse.json({ received: true, duplicate: true });
    admin = reservation.admin;
  } catch { return NextResponse.json({ error: "Journal indisponible" }, { status: 500 }); }

  try {
    let subscriptionId = event.data.object.object === "subscription" ? event.data.object.id : id(event.data.object.subscription);
    if (!subscriptionId && event.type === "charge.refunded") {
      const invoiceId = id(event.data.object.invoice);
      if (invoiceId) subscriptionId = id((await retrieveToolsStripeInvoice(invoiceId)).subscription);
    }
    if (!subscriptionId) throw new Error("Abonnement Stripe absent");
    const subscription = event.data.object.object === "subscription" ? event.data.object : await retrieveToolsStripeSubscription(subscriptionId);
    const customerId = id(subscription.customer);
    const { data: mapping } = customerId ? await admin.from("tools_monetization_customers").select("user_id")
      .eq("provider", "stripe").eq("environment", "test").eq("external_customer_id", customerId).maybeSingle() : { data: null };
    const userId = subscription.metadata?.elsatia_user_id || mapping?.user_id;
    if (!userId) throw new Error("Compte ELSATIA introuvable");
    const payload = stripeSubscriptionPayload(subscription, userId, event);
    const { data: subscriptionRow, error } = await admin.rpc("tools_server_appliquer_abonnement", { p_payload: payload });
    if (error) throw new Error(error.message);
    await admin.from("tools_monetization_events").update({ user_id: userId, subscription_id: subscriptionRow, status: "processed", processed_at: new Date().toISOString(), after_state: { status: payload.status } })
      .eq("provider", "stripe").eq("environment", "test").eq("external_event_id", event.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    await failToolsMonetizationEvent({ provider: "stripe", environment: "test", externalEventId: event.id });
    console.error("Échec webhook Stripe Tools", error instanceof Error ? error.message : "erreur inconnue");
    return NextResponse.json({ error: "Synchronisation impossible" }, { status: 500 });
  }
}
