import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifierSignatureStripe } from "@/lib/stripe";
import { boutiqueEstActive } from "@/lib/preview-features";
import { empreinteEvenementStripe, resoudreModeStripeWebhook } from "@/lib/stripe-webhook-environment";

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

  // CONTRÔLE DE MODE, FAIL-CLOSED (P0 de l'audit Boutique).
  //
  // Cette route journalisait `livemode` sans jamais le confronter à
  // l'environnement : un événement Live reçu par un déploiement Test était donc
  // traité comme un paiement réel — commande finalisée, journal écrit — et
  // symétriquement un événement Test reçu en Live. La signature ne protège pas de
  // cela : chaque mode a sa propre clé, mais un endpoint mal recâblé reste signé.
  //
  // On réutilise le résolveur du webhook abonnement plutôt que d'en écrire un
  // second : même variable, même règle, un seul endroit à auditer. Configuration
  // absente, vide ou invalide ⇒ on refuse, on ne devine pas.
  const configurationMode = resoudreModeStripeWebhook();
  if (!configurationMode.valide) {
    console.error("Webhook boutique non traité", {
      categorie: `configuration_${configurationMode.motif}`,
      type_evenement: evenement.type,
      empreinte_evenement: empreinteEvenementStripe(evenement.id),
    });
    return NextResponse.json({ error: "Webhook temporairement indisponible" }, { status: 503 });
  }
  if (evenement.livemode !== configurationMode.livemode) {
    console.warn("Webhook boutique non traité", {
      categorie: "mode_stripe_incorrect",
      type_evenement: evenement.type,
      empreinte_evenement: empreinteEvenementStripe(evenement.id),
      mode_recu: evenement.livemode ? "live" : "test",
      mode_attendu: configurationMode.mode,
    });
    return NextResponse.json({ error: "Webhook temporairement indisponible" }, { status: 503 });
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
