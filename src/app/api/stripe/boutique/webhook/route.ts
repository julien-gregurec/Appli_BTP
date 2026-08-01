import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifierSignatureStripe } from "@/lib/stripe";
import { boutiqueEstActive } from "@/lib/preview-features";

type StripeEvent = { id: string; type: string; livemode: boolean; data: { object: {
  id: string; payment_status?: string; metadata?: { commande_id?: string };
} } };

export async function POST(request: Request) {
  if (!boutiqueEstActive()) return NextResponse.json({ error: "Fonctionnalité indisponible" }, { status: 404 });
  const secret = process.env.STRIPE_WEBHOOK_BOUTIQUE_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook boutique non configuré" }, { status: 503 });
  const brut = await request.text();
  if (!verifierSignatureStripe(brut, request.headers.get("stripe-signature"), secret)) {
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
  if (dedupe) return NextResponse.json({ error: "Journal indisponible" }, { status: 500 });

  if (commandeId && ["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(evenement.type) && objet.payment_status !== "unpaid") {
    const { error } = await admin.rpc("boutique_finaliser_commande_payee", { p_commande_id: commandeId, p_checkout_id: objet.id });
    if (error) {
      console.error("Échec de synchronisation du webhook boutique", error);
      return NextResponse.json({ error: "Synchronisation impossible" }, { status: 500 });
    }
  }
  if (commandeId && evenement.type === "checkout.session.expired") {
    await admin.from("boutique_commandes").update({ statut: "expiree", updated_at: new Date().toISOString() })
      .eq("id", commandeId).eq("stripe_checkout_id", objet.id).eq("statut", "en_attente_paiement");
  }
  return NextResponse.json({ received: true });
}
