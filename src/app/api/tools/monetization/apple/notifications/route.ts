import { NextResponse } from "next/server";
import { failToolsMonetizationEvent, reserveToolsMonetizationEvent } from "@/lib/tools-monetization";
import { verifyAppleNotification } from "@/lib/tools-native-monetization";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { signedPayload?: unknown } | null;
  if (typeof body?.signedPayload !== "string" || body.signedPayload.length > 100000) return NextResponse.json({ error: "Notification invalide" }, { status: 400 });
  let reservedEventId: string | null = null;
  try {
    const { notification, payload } = await verifyAppleNotification(body.signedPayload);
    if (!notification.notificationUUID) throw new Error("Identifiant absent");
    const reservation = await reserveToolsMonetizationEvent({ provider: "apple", environment: "sandbox", externalEventId: notification.notificationUUID,
      eventType: String(notification.notificationType ?? "UNKNOWN") });
    if (reservation.duplicate) return NextResponse.json({ received: true, duplicate: true });
    const admin = reservation.admin;
    reservedEventId = notification.notificationUUID;
    if (payload) {
      const { data: subscriptionId, error } = await admin.rpc("tools_server_appliquer_abonnement", { p_payload: payload });
      if (error) throw new Error(error.message);
      await admin.from("tools_monetization_events").update({ user_id: payload.user_id, subscription_id: subscriptionId, status: "processed", processed_at: new Date().toISOString(), after_state: { status: payload.status } })
        .eq("provider", "apple").eq("environment", "sandbox").eq("external_event_id", notification.notificationUUID);
    } else await admin.from("tools_monetization_events").update({ status: "ignored", processed_at: new Date().toISOString() })
      .eq("provider", "apple").eq("environment", "sandbox").eq("external_event_id", notification.notificationUUID);
    return NextResponse.json({ received: true });
  } catch {
    if (reservedEventId) await failToolsMonetizationEvent({ provider: "apple", environment: "sandbox", externalEventId: reservedEventId });
    return NextResponse.json({ error: "Notification Apple non vérifiée" }, { status: 400 });
  }
}
