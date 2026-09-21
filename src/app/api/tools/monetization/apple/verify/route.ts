import { authenticatedToolsUser, failToolsMonetizationEvent, reserveToolsMonetizationEvent, toolsJson, toolsOptions } from "@/lib/tools-monetization";
import { appleSubscriptionPayload, verifyAppleTransaction } from "@/lib/tools-native-monetization";
import type { ToolsLedgerEnvironment } from "@/lib/tools-store-environment";

export const OPTIONS = toolsOptions;
export async function POST(request: Request) {
  const user = await authenticatedToolsUser(request);
  if (!user) return toolsJson(request, { error: "Authentification requise" }, 401);
  const body = await request.json().catch(() => null) as { signedTransaction?: unknown } | null;
  if (typeof body?.signedTransaction !== "string" || body.signedTransaction.length > 20000) return toolsJson(request, { error: "Transaction Apple invalide" }, 400);
  let reservedEventId: string | null = null;
  /* Renseigné en même temps que `reservedEventId` : le `catch` doit viser la même ligne. */
  let failureEnvironment: ToolsLedgerEnvironment = "sandbox";
  try {
    const { transaction, environment } = await verifyAppleTransaction(body.signedTransaction, user.id);
    const payload = appleSubscriptionPayload(transaction, { id: transaction.transactionId!, type: "DEVICE_VERIFICATION" });
    /* L'environnement vient de la transaction VÉRIFIÉE : TestFlight et vente réelle cohabitent. */
    const event = { provider: "apple" as const, environment, externalEventId: `device:${transaction.transactionId!}` };
    const reservation = await reserveToolsMonetizationEvent({ ...event, eventType: "DEVICE_VERIFICATION", userId: user.id });
    if (reservation.duplicate) return toolsJson(request, { verified: true, status: payload.status, duplicate: true });
    reservedEventId = event.externalEventId;
    failureEnvironment = environment;
    const { error } = await reservation.admin.rpc("tools_server_appliquer_abonnement", { p_payload: payload });
    if (error) throw new Error(error.message);
    await reservation.admin.from("tools_monetization_events").update({ status: "processed", processed_at: new Date().toISOString(), after_state: { status: payload.status } })
      .eq("provider", "apple").eq("environment", environment).eq("external_event_id", event.externalEventId);
    return toolsJson(request, { verified: true, status: payload.status });
  } catch {
    if (reservedEventId) await failToolsMonetizationEvent({ provider: "apple", environment: failureEnvironment, externalEventId: reservedEventId });
    return toolsJson(request, { error: "Transaction Apple non vérifiée" }, 400);
  }
}
