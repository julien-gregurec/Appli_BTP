import { NextResponse } from "next/server";
import { failToolsMonetizationEvent, reserveToolsMonetizationEvent } from "@/lib/tools-monetization";
import { googleSubscriptionPayload, retrieveGoogleSubscription, verifyGooglePubSubToken } from "@/lib/tools-native-monetization";

type PubSubBody = { message?: { messageId?: string; data?: string } };

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7) : null;
  if (!token) return NextResponse.json({ error: "Signature RTDN absente" }, { status: 401 });
  let reservedEventId: string | null = null;
  try {
    await verifyGooglePubSubToken(token);
    const body = await request.json() as PubSubBody;
    const decoded = body.message?.data ? JSON.parse(Buffer.from(body.message.data, "base64").toString("utf8")) as { packageName?: string; subscriptionNotification?: { purchaseToken?: string; notificationType?: number } } : null;
    const purchaseToken = decoded?.subscriptionNotification?.purchaseToken;
    const eventId = body.message?.messageId;
    if (decoded?.packageName !== "fr.elsatia.tools" || !purchaseToken || !eventId) throw new Error("RTDN incomplète");
    const reservation = await reserveToolsMonetizationEvent({ provider: "google", environment: "sandbox", externalEventId: eventId,
      eventType: `SUBSCRIPTION_${decoded?.subscriptionNotification?.notificationType ?? "UNKNOWN"}` });
    if (reservation.duplicate) return NextResponse.json({ received: true, duplicate: true });
    const admin = reservation.admin;
    reservedEventId = eventId;
    const { data: known } = await admin.from("tools_monetization_subscriptions").select("user_id")
      .eq("provider", "google").eq("environment", "sandbox").eq("external_subscription_id", purchaseToken).maybeSingle();
    if (!known?.user_id) throw new Error("Abonnement Google inconnu");
    const { subscription } = await retrieveGoogleSubscription(purchaseToken);
    const payload = googleSubscriptionPayload(subscription, purchaseToken, known.user_id, { id: eventId, type: `RTDN_${decoded?.subscriptionNotification?.notificationType ?? "UNKNOWN"}` });
    const { data: subscriptionId, error } = await admin.rpc("tools_server_appliquer_abonnement", { p_payload: payload });
    if (error) throw new Error(error.message);
    await admin.from("tools_monetization_events").update({ user_id: known.user_id, subscription_id: subscriptionId, status: "processed", processed_at: new Date().toISOString(), after_state: { status: payload.status } })
      .eq("provider", "google").eq("environment", "sandbox").eq("external_event_id", eventId);
    return NextResponse.json({ received: true });
  } catch {
    if (reservedEventId) await failToolsMonetizationEvent({ provider: "google", environment: "sandbox", externalEventId: reservedEventId });
    return NextResponse.json({ error: "Notification Google non vérifiée" }, { status: 400 });
  }
}
