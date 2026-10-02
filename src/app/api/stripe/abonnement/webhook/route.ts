import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ajouterDepassementAppareilsFacture,
  ajouterDepassementStockageFacture,
  calculerDepassementAppareils,
  reconcilierAbonnementStripe,
  recupererAbonnementStripe,
  recupererFactureStripe,
  statutStripeTerminal,
  suspendreFinalisationFacture,
} from "@/lib/stripe-abonnement";
import { entreprisePourAbonnement, synchroniserDepuisStripe } from "@/lib/stripe-abonnement-synchro";
import { facturationReelleAutorisee, modeStripe } from "@/lib/stripe-billing-config";
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
  period_start?: number;
  period_end?: number;
  current_period_start?: number;
  current_period_end?: number;
  trial_end?: number | null;
  cancel_at?: number | null;
  cancel_at_period_end?: boolean;
  metadata?: Record<string, string>;
  number?: string | null;
  currency?: string;
  subtotal_excluding_tax?: number | null;
  total?: number;
  total_tax_amounts?: Array<{ amount?: number }>;
  total_taxes?: Array<{ amount?: number }>;
  status_transitions?: { paid_at?: number | null } | null;
  parent?: { subscription_details?: { subscription?: StripeReference; metadata?: Record<string, string> } } | null;
};
type StripeEvent = { id: string; type: string; livemode: boolean; account?: string; data: { object: StripeObjet } };

function identifiant(reference: StripeReference) {
  return typeof reference === "string" ? reference : reference?.id || null;
}

function instantDepuisUnix(valeur?: number | null) {
  return valeur ? new Date(valeur * 1000).toISOString() : null;
}

function abonnementDeFacture(objet: StripeObjet) {
  // `invoice.subscription` a été déplacé dans `invoice.parent.subscription_details`
  // à partir de l'API 2025-03-31 (basil) : les deux formes sont acceptées.
  return identifiant(objet.subscription) || identifiant(objet.parent?.subscription_details?.subscription);
}

async function entreprisePourObjet(objet: StripeObjet) {
  const admin = createAdminClient();
  const entrepriseId = objet.metadata?.entreprise_id || objet.parent?.subscription_details?.metadata?.entreprise_id;
  if (entrepriseId) return entrepriseId;
  const subscriptionId = objet.object === "subscription" ? objet.id : abonnementDeFacture(objet);
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

async function synchroniserFactureAbonnement(entrepriseId: string, objet: StripeObjet, statut: string) {
  const admin = createAdminClient();
  const taxes = (objet.total_taxes ?? objet.total_tax_amounts ?? []).reduce((total, taxe) => total + Number(taxe.amount ?? 0), 0);
  const totalCentimes = Number(objet.total ?? 0);
  const htCentimes = objet.subtotal_excluding_tax == null ? Math.max(0, totalCentimes - taxes) : Number(objet.subtotal_excluding_tax);
  const { error } = await admin.from("factures_abonnement").upsert({
    entreprise_id: entrepriseId,
    stripe_invoice_id: objet.id,
    numero: objet.number ?? null,
    periode_debut: instantDepuisUnix(objet.period_start),
    periode_fin: instantDepuisUnix(objet.period_end),
    montant_ht: htCentimes / 100,
    montant_tva: taxes / 100,
    montant_ttc: totalCentimes / 100,
    devise: (objet.currency ?? "eur").toUpperCase(),
    statut,
    url_facture: objet.hosted_invoice_url ?? null,
    url_pdf: objet.invoice_pdf ?? null,
    payee_at: statut === "paid" ? instantDepuisUnix(objet.status_transitions?.paid_at) ?? new Date().toISOString() : null,
  }, { onConflict: "stripe_invoice_id" });
  if (error) throw new Error(error.message);
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

  // Un événement Test ne doit jamais modifier un environnement Live, et inversement.
  const mode = modeStripe();
  if ((mode === "live") !== evenement.livemode) {
    return NextResponse.json({ error: "Mode Stripe de l’événement incohérent avec la configuration" }, { status: 400 });
  }

  const admin = createAdminClient();
  const objet = evenement.data.object;
  const entrepriseInitiale = await entreprisePourObjet(objet);
  const { error: reservation } = await admin.from("abonnement_evenements").insert({
    stripe_event_id: evenement.id,
    entreprise_id: entrepriseInitiale,
    type: evenement.type,
    payload: {
      livemode: evenement.livemode,
      object_id: objet.id,
      customer_id: identifiant(objet.customer),
      subscription_id: objet.object === "subscription" ? objet.id : abonnementDeFacture(objet),
    },
  });
  // Doublon : l'événement a déjà été (ou est en cours d'être) traité.
  if (reservation?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
  if (reservation) return NextResponse.json({ error: "Journal indisponible" }, { status: 500 });

  let statutResultant: string | null = null;
  try {
    let subscriptionId: string | null = null;
    if (evenement.type === "checkout.session.completed" && objet.mode === "subscription") {
      subscriptionId = identifiant(objet.subscription);
      if (!subscriptionId) throw new Error("Abonnement absent de la session Stripe");
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted", "customer.subscription.paused", "customer.subscription.resumed"].includes(evenement.type)) {
      subscriptionId = objet.id;
    } else if (["invoice.paid", "invoice.payment_failed", "invoice.payment_action_required", "invoice.payment_succeeded"].includes(evenement.type)) {
      subscriptionId = abonnementDeFacture(objet);
    }

    let entrepriseId = entrepriseInitiale;
    if (subscriptionId) {
      // L'état appliqué est l'état Stripe relu maintenant, pas le contenu de
      // l'événement : l'ordre de réception n'a donc plus d'importance.
      const abonnement = await recupererAbonnementStripe(subscriptionId);
      entrepriseId = (await entreprisePourAbonnement(abonnement)) ?? entrepriseId;
      if (!entrepriseId) throw new Error("Entreprise Stripe introuvable");
      const resultat = await synchroniserDepuisStripe(entrepriseId, abonnement);
      statutResultant = resultat.statutResultant;
      if (resultat.decision.action === "appliquer" && !statutStripeTerminal(abonnement.status) && evenement.type === "checkout.session.completed") {
        await reconcilierAbonnementStripe(entrepriseId);
      }
    }

    if (evenement.type === "invoice.created") {
      if (!entrepriseId) throw new Error("Entreprise de la facture Stripe introuvable");
      if (mode === "live" && !facturationReelleAutorisee()) {
        // Identité vendeur ou régime TVA non confirmés : la facture reste brouillon.
        await suspendreFinalisationFacture(objet.id);
        statutResultant = "facture_bloquee_identite_ou_tva";
      } else if (objet.billing_reason !== "subscription_create" && objet.status === "draft") {
        const customerId = identifiant(objet.customer);
        if (!customerId) throw new Error("Client Stripe absent de la facture");
        await Promise.all([
          ajouterDepassementAppareilsFacture({ entrepriseId, customerId, invoiceId: objet.id, montantHt: await calculerDepassementAppareils(entrepriseId) }),
          ajouterDepassementStockageFacture({ entrepriseId, customerId, invoiceId: objet.id }),
        ]);
      }
    } else if (["invoice.paid", "invoice.payment_failed", "invoice.payment_action_required", "invoice.payment_succeeded", "invoice.finalized", "invoice.voided", "invoice.marked_uncollectible"].includes(evenement.type)) {
      if (!entrepriseId) throw new Error("Entreprise de la facture Stripe introuvable");
      // Statut de facture relu : un `payment_failed` reçu après `paid` ne
      // dégrade pas une facture déjà payée.
      const facture = { ...objet, ...(await recupererFactureStripe(objet.id)) } as StripeObjet;
      await synchroniserFactureAbonnement(entrepriseId, facture, facture.status || evenement.type.replace("invoice.", ""));
      const { data: entreprise } = await admin.from("entreprises").select("derniere_facture_at").eq("id", entrepriseId).maybeSingle();
      const creeeLe = instantDepuisUnix(facture.created) || new Date().toISOString();
      if (!entreprise?.derniere_facture_at || new Date(entreprise.derniere_facture_at).getTime() <= new Date(creeeLe).getTime()) {
        const { error } = await admin.from("entreprises").update({
          derniere_facture_stripe_id: facture.id,
          derniere_facture_url: facture.hosted_invoice_url || null,
          derniere_facture_pdf: facture.invoice_pdf || null,
          derniere_facture_statut: facture.status || evenement.type,
          derniere_facture_at: creeeLe,
          updated_at: new Date().toISOString(),
        }).eq("id", entrepriseId);
        if (error) throw new Error(error.message);
      }
    }
    await admin.from("abonnement_evenements").update({ statut_resultant: statutResultant, entreprise_id: entrepriseId }).eq("stripe_event_id", evenement.id);
    return NextResponse.json({ received: true, statut: statutResultant });
  } catch (error) {
    // Libère la réservation : la nouvelle tentative de Stripe (ou un rejeu
    // manuel) pourra retraiter l'événement.
    await admin.from("abonnement_evenements").delete().eq("stripe_event_id", evenement.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Synchronisation impossible" }, { status: 500 });
  }
}
