import { authenticatedToolsUser, failToolsMonetizationEvent, reserveToolsMonetizationEvent, toolsJson, toolsOptions } from "@/lib/tools-monetization";
import { appleSubscriptionPayload, verifyAppleTransaction } from "@/lib/tools-native-monetization";

export const OPTIONS = toolsOptions;
export async function POST(request: Request) {
  const user = await authenticatedToolsUser(request);
  if (!user) return toolsJson(request, { error: "Authentification requise" }, 401);
  const body = await request.json().catch(() => null) as { signedTransaction?: unknown } | null;
  if (typeof body?.signedTransaction !== "string" || body.signedTransaction.length > 20000) return toolsJson(request, { error: "Transaction Apple invalide" }, 400);
  let reservedEventId: string | null = null;
  try {
    const { transaction } = await verifyAppleTransaction(body.signedTransaction, user.id);
    const payload = appleSubscriptionPayload(transaction, { id: transaction.transactionId!, type: "DEVICE_VERIFICATION" });
    const event = { provider: "apple" as const, environment: "sandbox" as const, externalEventId: `device:${transaction.transactionId!}` };
    const reservation = await reserveToolsMonetizationEvent({ ...event, eventType: "DEVICE_VERIFICATION", userId: user.id });
    if (reservation.duplicate) return toolsJson(request, { verified: true, status: payload.status, duplicate: true });
    reservedEventId = event.externalEventId;
    const { error } = await reservation.admin.rpc("tools_server_appliquer_abonnement", { p_payload: payload });
    if (error) throw new Error(error.message);
    await reservation.admin.from("tools_monetization_events").update({ status: "processed", processed_at: new Date().toISOString(), after_state: { status: payload.status } })
      .eq("provider", "apple").eq("environment", "sandbox").eq("external_event_id", event.externalEventId);
    return toolsJson(request, { verified: true, status: payload.status });
  } catch {
    if (reservedEventId) await failToolsMonetizationEvent({ provider: "apple", environment: "sandbox", externalEventId: reservedEventId });
    return toolsJson(request, { error: "Transaction Apple non vérifiée" }, 400);
  }
}
