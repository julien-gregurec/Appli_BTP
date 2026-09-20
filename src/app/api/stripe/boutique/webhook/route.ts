import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifierSignatureStripe } from "@/lib/stripe";
import { logErreur, logInfo, logWarn } from "@/lib/observability/logger";
import { obtenirIdCorrelation } from "@/lib/observability/request-id";

type StripeEvent = { id: string; type: string; livemode: boolean; data: { object: {
  id: string; payment_status?: string; metadata?: { commande_id?: string };
} } };

export async function POST(request: Request) {
  const requestId = obtenirIdCorrelation(request);
  const secret = process.env.STRIPE_WEBHOOK_BOUTIQUE_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook boutique non configuré" }, { status: 503 });
  const brut = await request.text();
  if (!verifierSignatureStripe(brut, request.headers.get("stripe-signature"), secret)) {
    logWarn("security", "Signature Stripe invalide (webhook boutique)", { requestId, route: "/api/stripe/boutique/webhook" });
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }
  let evenement: StripeEvent;
  try {
    evenement = JSON.parse(brut) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const admin = createAdminClient();
  const objet = evenement.data.object;
  const commandeId = objet.metadata?.commande_id;
  const { error: dedupe } = await admin.from("stripe_webhook_events").insert({
    id: evenement.id, event_type: evenement.type, livemode: evenement.livemode, facture_id: null,
  });
  if (dedupe?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
  if (dedupe) {
    logErreur("billing", "Journal des évènements Stripe indisponible (webhook boutique)", { requestId, route: "/api/stripe/boutique/webhook", operation: evenement.type }, dedupe);
    return NextResponse.json({ error: "Journal indisponible" }, { status: 500 });
  }

  // Même garde-fou que /api/stripe/webhook et /api/stripe/abonnement/webhook : la marque
  // "reçu" ci-dessus est retirée si le traitement échoue, pour que Stripe puisse rejouer
  // l'évènement en entier au prochain essai au lieu d'être ignoré comme doublon.
  try {
    if (commandeId && ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(evenement.type) && objet.payment_status !== "unpaid") {
      const { error } = await admin.rpc("boutique_finaliser_commande_payee", { p_commande_id: commandeId, p_checkout_id: objet.id });
      if (error) throw new Error(error.message);
    } else if (commandeId && evenement.type === "checkout.session.expired") {
      const { error } = await admin.from("boutique_commandes").update({ statut: "expiree", updated_at: new Date().toISOString() })
        .eq("id", commandeId).eq("stripe_checkout_id", objet.id).eq("statut", "en_attente_paiement");
      if (error) throw new Error(error.message);
    } else {
      logInfo("billing", "Évènement Stripe reçu sans traitement dédié (webhook boutique)", { requestId, route: "/api/stripe/boutique/webhook", operation: evenement.type });
    }
    return NextResponse.json({ received: true });
  } catch (erreur) {
    await admin.from("stripe_webhook_events").delete().eq("id", evenement.id);
    logErreur("billing", "Échec du traitement d'un évènement Stripe (webhook boutique) — marque retirée pour permettre un nouvel essai", { requestId, route: "/api/stripe/boutique/webhook", operation: evenement.type, commandeId }, erreur);
    return NextResponse.json({ error: erreur instanceof Error ? erreur.message : "Traitement impossible" }, { status: 500 });
  }
}
