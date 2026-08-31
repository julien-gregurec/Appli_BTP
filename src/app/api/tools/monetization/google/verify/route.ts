import { authenticatedToolsUser, failToolsMonetizationEvent, reserveToolsMonetizationEvent, toolsJson, toolsOptions } from "@/lib/tools-monetization";
import { acknowledgeGoogleSubscription, googleSubscriptionPayload, retrieveGoogleSubscription, saveGoogleAccountMapping } from "@/lib/tools-native-monetization";

export const OPTIONS = toolsOptions;
export async function POST(request: Request) {
  const user = await authenticatedToolsUser(request);
  if (!user) return toolsJson(request, { error: "Authentification requise" }, 401);
  const body = await request.json().catch(() => null) as { purchaseToken?: unknown } | null;
  if (typeof body?.purchaseToken !== "string") return toolsJson(request, { error: "Achat Google invalide" }, 400);
  let reservedEventId: string | null = null;
  try {
    const { subscription } = await retrieveGoogleSubscription(body.purchaseToken);
    const payload = googleSubscriptionPayload(subscription, body.purchaseToken, user.id, { id: `device:${body.purchaseToken}`, type: "DEVICE_VERIFICATION" });
    const reservation = await reserveToolsMonetizationEvent({ provider: "google", environment: "sandbox", externalEventId: `device:${body.purchaseToken}`, eventType: "DEVICE_VERIFICATION", userId: user.id });
    if (reservation.duplicate) return toolsJson(request, { verified: true, status: payload.status, duplicate: true });
    reservedEventId = `device:${body.purchaseToken}`;
    const { error } = await reservation.admin.rpc("tools_server_appliquer_abonnement", { p_payload: payload });
    if (error) throw new Error(error.message);
    await saveGoogleAccountMapping(user.id);
    await acknowledgeGoogleSubscription(body.purchaseToken, subscription);
    await reservation.admin.from("tools_monetization_events").update({ status: "processed", processed_at: new Date().toISOString(), after_state: { status: payload.status } })
      .eq("provider", "google").eq("environment", "sandbox").eq("external_event_id", `device:${body.purchaseToken}`);
    return toolsJson(request, { verified: true, status: payload.status });
  } catch {
    if (reservedEventId) await failToolsMonetizationEvent({ provider: "google", environment: "sandbox", externalEventId: reservedEventId });
    return toolsJson(request, { error: "Achat Google non vérifié" }, 400);
  }
}
