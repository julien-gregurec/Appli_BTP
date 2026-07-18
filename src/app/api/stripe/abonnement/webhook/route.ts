import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ajouterDepassementAppareilsFacture, ajouterDepassementStockageFacture, calculerDepassementAppareils, reconcilierAbonnementStripe, recupererAbonnementStripe, statutAbonnementDepuisStripe, type StripeSubscription } from "@/lib/stripe-abonnement";
import { verifierSignatureStripe } from "@/lib/stripe";

type StripeReference = string | { id?: string } | null | undefined;
type StripeObjet = {
  id: string;
  object?: string;
  customer?: StripeReference;
  subscription?: StripeReference;
  status?: string;
  mode?: string;
  payment_status?: string;
  billing_reason?: string;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  created?: number;
  current_period_end?: number;
  trial_end?: number | null;
  cancel_at?: number | null;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
};
type StripeEvent = { id: string; type: string; livemode: boolean; account?: string; data: { object: StripeObjet } };

function identifiant(reference: StripeReference) {
  return typeof reference === "string" ? reference : reference?.id || null;
}

function dateDepuisUnix(valeur?: number | null) {
  return valeur ? new Date(valeur * 1000).toISOString().slice(0, 10) : null;
}

function instantDepuisUnix(valeur?: number | null) {
  return valeur ? new Date(valeur * 1000).toISOString() : null;
}

async function entreprisePour(objet: StripeObjet) {
  const admin = createAdminClient();
  const entrepriseId = objet.metadata?.entreprise_id;
  if (entrepriseId) return entrepriseId;
  const subscriptionId = objet.object === "subscription" ? objet.id : identifiant(objet.subscription);
  if (subscriptionId) {
    const { data } = await admin.from("entreprises").select("id").eq("stripe_subscription_id", subscriptionId).maybeSingle();
    if (data?.id) return data.id as string;
  }
  const customerId = identifiant(objet.customer);
  if (customerId) {
    const { data } = await admin.from("entreprises").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    if (data?.id) return data.id as string;
  }
  return null;
}

async function synchroniserAbonnement(entrepriseId: string, abonnement: StripeSubscription) {
  const admin = createAdminClient();
  const offre = abonnement.metadata?.offre;
  const periodicite = abonnement.metadata?.periodicite;
  const statut = statutAbonnementDepuisStripe(abonnement.status);
  const miseAJour: Record<string, unknown> = {
    stripe_subscription_id: abonnement.id,
    stripe_customer_id: identifiant(abonnement.customer),
    abonnement_statut: statut,
    abonnement_echeance: dateDepuisUnix(abonnement.current_period_end),
    abonnement_essai_fin: dateDepuisUnix(abonnement.trial_end),
    abonnement_annulation_prevue_at: abonnement.cancel_at_period_end ? instantDepuisUnix(abonnement.cancel_at || abonnement.current_period_end) : null,
    updated_at: new Date().toISOString(),
  };
  if (["essentiel", "pro", "premium"].includes(offre || "")) miseAJour.abonnement_offre = offre;
  if (["mensuel", "annuel"].includes(periodicite || "")) miseAJour.abonnement_periodicite = periodicite;
  const { error } = await admin.from("entreprises").update(miseAJour).eq("id", entrepriseId);
  if (error) throw new Error(error.message);
  return statut;
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_ABONNEMENT_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook abonnement non configuré" }, { status: 503 });
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
  if (evenement.account) return NextResponse.json({ error: "Événement Connect refusé sur le webhook abonnement" }, { status: 400 });

  const admin = createAdminClient();
  const objet = evenement.data.object;
  const entrepriseId = await entreprisePour(objet);
  const { error: reservation } = await admin.from("abonnement_evenements").insert({
    stripe_event_id: evenement.id,
    entreprise_id: entrepriseId,
    type: evenement.type,
    payload: {
      livemode: evenement.livemode,
      object_id: objet.id,
      customer_id: identifiant(objet.customer),
      subscription_id: objet.object === "subscription" ? objet.id : identifiant(objet.subscription),
    },
  });
  if (reservation?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
  if (reservation) return NextResponse.json({ error: "Journal indisponible" }, { status: 500 });

  let statutResultant: string | null = null;
  try {
    if (evenement.type === "checkout.session.completed" && objet.mode === "subscription") {
      if (!entrepriseId) throw new Error("Entreprise absente de la session Stripe");
      const subscriptionId = identifiant(objet.subscription);
      if (!subscriptionId) throw new Error("Abonnement absent de la session Stripe");
      statutResultant = await synchroniserAbonnement(entrepriseId, await recupererAbonnementStripe(subscriptionId));
      await reconcilierAbonnementStripe(entrepriseId);
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(evenement.type)) {
      if (!entrepriseId) throw new Error("Entreprise Stripe introuvable");
      statutResultant = await synchroniserAbonnement(entrepriseId, objet as StripeSubscription);
    } else if (evenement.type === "invoice.created" && objet.billing_reason !== "subscription_create") {
      if (!entrepriseId) throw new Error("Entreprise de la facture Stripe introuvable");
      const customerId = identifiant(objet.customer);
      if (!customerId) throw new Error("Client Stripe absent de la facture");
      await Promise.all([
        ajouterDepassementAppareilsFacture({ entrepriseId, customerId, invoiceId: objet.id, montantHt: await calculerDepassementAppareils(entrepriseId) }),
        ajouterDepassementStockageFacture({ entrepriseId, customerId, invoiceId: objet.id }),
      ]);
    } else if (["invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"].includes(evenement.type)) {
      if (!entrepriseId) throw new Error("Entreprise de la facture Stripe introuvable");
      statutResultant = evenement.type === "invoice.paid" ? "actif" : "suspendu";
      const { error } = await admin.from("entreprises").update({
        abonnement_statut: statutResultant,
        derniere_facture_stripe_id: objet.id,
        derniere_facture_url: objet.hosted_invoice_url || null,
        derniere_facture_pdf: objet.invoice_pdf || null,
        derniere_facture_statut: objet.status || evenement.type,
        derniere_facture_at: instantDepuisUnix(objet.created) || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", entrepriseId);
      if (error) throw new Error(error.message);
    }
    await admin.from("abonnement_evenements").update({ statut_resultant: statutResultant }).eq("stripe_event_id", evenement.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    await admin.from("abonnement_evenements").delete().eq("stripe_event_id", evenement.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Synchronisation impossible" }, { status: 500 });
  }
}
