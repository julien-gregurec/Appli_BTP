import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ajouterDepassementAppareilsFacture, ajouterDepassementStockageFacture, calculerDepassementAppareils, reconcilierAbonnementStripe } from "@/lib/stripe-abonnement";
import { verifierSignatureStripe } from "@/lib/stripe";
import { categoriserErreurSupabase, empreinteEvenementStripe, identifiantUuidValide, resoudreModeStripeWebhook } from "@/lib/stripe-webhook-environment";
import { reconcilierCapacitePersonnesStripe } from "@/lib/stripe-capacite-reconcile";
import { notifierPaiementAbonnementEchoue } from "@/lib/abonnement-notifications";
import { VerrouRemiseOccupe } from "@/lib/stripe-discount-server";
// Next.js n'autorise dans un `route.ts` que les exports de gestionnaires HTTP
// et la configuration de segment : la logique métier vit dans ce module.
import { identifiant, instantDepuisUnix, synchroniserAbonnementCoordonne, type EvenementOrdonne, type StripeReference, type SupabaseAdmin } from "@/lib/stripe-abonnement-synchronisation";

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
  discounts?: Array<string | { id?: string }> | null;
  number?: string | null;
  customer_email?: string | null;
  currency?: string;
  subtotal_excluding_tax?: number | null;
  total?: number;
  total_tax_amounts?: Array<{ amount?: number }>;
};
type StripeEvent = { id: string; type: string; livemode: boolean; created: number; account?: string; data: { object: StripeObjet } };
type EntrepriseStripe = { id: string; stripe_customer_id?: string | null; stripe_subscription_id?: string | null };
type ResolutionEntreprise =
  | { ok: true; entrepriseId: string }
  | { ok: false; categorie: "metadata_absente" | "format_identifiant_invalide" | "entreprise_inconnue" | "rattachement_stripe_incoherent" | ReturnType<typeof categoriserErreurSupabase> };

function evenementStripeMinimalValide(valeur: unknown): valeur is StripeEvent {
  if (!valeur || typeof valeur !== "object") return false;
  const candidat = valeur as Partial<StripeEvent>;
  return typeof candidat.id === "string" && candidat.id.trim() !== ""
    && typeof candidat.type === "string" && candidat.type.trim() !== ""
    && typeof candidat.livemode === "boolean"
    // Contrat d'ordre : `created` (horloge Stripe de l'événement) est la seule
    // clé d'ordonnancement. Stripe l'envoie toujours ; son absence signe un
    // payload non Stripe, refusé plutôt qu'ordonnancé à l'aveugle.
    && typeof candidat.created === "number" && Number.isFinite(candidat.created) && candidat.created > 0
    && !!candidat.data && typeof candidat.data === "object"
    && !!candidat.data.object && typeof candidat.data.object === "object"
    && typeof candidat.data.object.id === "string" && candidat.data.object.id.trim() !== "";
}

async function lireEntreprise(requete: PromiseLike<{ data: EntrepriseStripe | null; error: { code?: string; message?: string } | null }>): Promise<ResolutionEntreprise | EntrepriseStripe | null> {
  const { data, error } = await requete;
  if (error) return { ok: false, categorie: categoriserErreurSupabase(error) };
  return data;
}

async function entreprisePour(admin: SupabaseAdmin, objet: StripeObjet): Promise<ResolutionEntreprise> {
  const entrepriseId = objet.metadata?.entreprise_id?.trim();
  const customerId = identifiant(objet.customer);
  const subscriptionId = objet.object === "subscription" ? objet.id : identifiant(objet.subscription);
  if (entrepriseId) {
    if (!identifiantUuidValide(entrepriseId)) return { ok: false, categorie: "format_identifiant_invalide" };
    const entreprise = await lireEntreprise(admin.from("entreprises").select("id,stripe_customer_id,stripe_subscription_id").eq("id", entrepriseId).maybeSingle());
    if (entreprise && "ok" in entreprise) return entreprise;
    if (!entreprise) return { ok: false, categorie: "entreprise_inconnue" };
    if (customerId && entreprise.stripe_customer_id && customerId !== entreprise.stripe_customer_id) return { ok: false, categorie: "rattachement_stripe_incoherent" };
    if (subscriptionId && entreprise.stripe_subscription_id && subscriptionId !== entreprise.stripe_subscription_id) return { ok: false, categorie: "rattachement_stripe_incoherent" };
    return { ok: true, entrepriseId: entreprise.id };
  }
  if (subscriptionId) {
    const entreprise = await lireEntreprise(admin.from("entreprises").select("id,stripe_customer_id,stripe_subscription_id").eq("stripe_subscription_id", subscriptionId).maybeSingle());
    if (entreprise && "ok" in entreprise) return entreprise;
    if (entreprise) return { ok: true, entrepriseId: entreprise.id };
  }
  if (customerId) {
    const entreprise = await lireEntreprise(admin.from("entreprises").select("id,stripe_customer_id,stripe_subscription_id").eq("stripe_customer_id", customerId).maybeSingle());
    if (entreprise && "ok" in entreprise) return entreprise;
    if (entreprise) return { ok: true, entrepriseId: entreprise.id };
  }
  return { ok: false, categorie: subscriptionId || customerId ? "entreprise_inconnue" : "metadata_absente" };
}

function diagnosticWebhook(niveau: "warn" | "error", evenement: Pick<StripeEvent,"id"|"type"|"livemode">, categorie: string, attendu?: "test"|"live") {
  console[niveau]("Webhook abonnement non traité", {
    categorie,
    type_evenement: evenement.type,
    empreinte_evenement: empreinteEvenementStripe(evenement.id),
    mode_recu: evenement.livemode ? "live" : "test",
    ...(attendu ? { mode_attendu: attendu } : {}),
  });
}

type DecisionFacture = {
  decision: "applique" | "perime" | "sans_effet" | "deja_traite";
  motif?: string | null;
  statut_resultant: string | null;
  notifier_echec: boolean;
};

// Contrat d'ordre Stripe (migration 20260927000506) : la transition d'accès, la
// trace « dernière facture » et la ligne `factures_abonnement` sont décidées
// et écrites en UNE transaction, sous verrou de la ligne entreprise, selon
// `event.created`. Un événement plus ancien que le dernier appliqué (ex. vieux
// `invoice.payment_failed` rejoué après `invoice.paid`) est journalisé
// `perime` et ne modifie rien.
async function appliquerEvenementFacture(admin: SupabaseAdmin, entrepriseId: string, evenement: StripeEvent): Promise<DecisionFacture> {
  const objet = evenement.data.object;
  const taxes = (objet.total_tax_amounts ?? []).reduce((total, taxe) => total + Number(taxe.amount ?? 0), 0);
  const totalCentimes = Number(objet.total ?? 0);
  const htCentimes = objet.subtotal_excluding_tax == null ? Math.max(0, totalCentimes - taxes) : Number(objet.subtotal_excluding_tax);
  const { data, error } = await admin.rpc("appliquer_evenement_facture_abonnement_service", {
    p_entreprise_id: entrepriseId,
    p_stripe_event_id: evenement.id,
    p_stripe_event_type: evenement.type,
    p_stripe_event_created: instantDepuisUnix(evenement.created),
    p_stripe_invoice_id: objet.id,
    p_invoice_status: objet.status || null,
    p_invoice_created: instantDepuisUnix(objet.created),
    p_numero: objet.number ?? null,
    p_periode_debut: instantDepuisUnix(objet.period_start),
    p_periode_fin: instantDepuisUnix(objet.period_end),
    p_montant_ht: htCentimes / 100,
    p_montant_tva: taxes / 100,
    p_montant_ttc: totalCentimes / 100,
    p_devise: objet.currency ?? "eur",
    p_url_facture: objet.hosted_invoice_url || null,
    p_url_pdf: objet.invoice_pdf || null,
  });
  if (error) throw new Error(error.message);
  if (!data || typeof data !== "object") throw new Error("Décision d'ordonnancement absente");
  return data as DecisionFacture;
}

// Journal d'ordonnancement des événements sans transition d'accès : purement
// informatif, jamais bloquant (un échec ne doit pas provoquer de rejeu Stripe).
async function journaliserSansEffet(admin: SupabaseAdmin, entrepriseId: string, evenement: StripeEvent, motif: string) {
  try {
    const objet = evenement.data.object;
    const { error } = await admin.rpc("journaliser_evenement_stripe_ordre_service", {
      p_flux: "abonnement",
      p_stripe_event_id: evenement.id,
      p_stripe_event_type: evenement.type,
      p_stripe_event_created: instantDepuisUnix(evenement.created),
      p_objet_type: objet.object ?? "inconnu",
      p_objet_id: objet.id,
      p_entreprise_id: entrepriseId,
      p_motif: motif,
    });
    if (error) throw error;
  } catch {
    console.warn("Journal d'ordonnancement Stripe non écrit", { categorie: "journal_ordre_indisponible", type_evenement: evenement.type });
  }
}

function evenementOrdonne(evenement: StripeEvent): EvenementOrdonne {
  return {
    id: evenement.id,
    type: evenement.type,
    created: evenement.created,
    objetType: evenement.data.object.object ?? "inconnu",
    objetId: evenement.data.object.id,
  };
}

async function notifierPaiementEchoueSansEchouer(admin: SupabaseAdmin, entrepriseId: string, objet: StripeObjet) {
  try {
    const { data: entreprise } = await admin
      .from("entreprises")
      .select("nom,abonnement_offre,abonnement_periodicite")
      .eq("id", entrepriseId)
      .maybeSingle();
    if (!entreprise?.nom) return;
    await notifierPaiementAbonnementEchoue({
      destinataire: objet.customer_email ?? null,
      entrepriseNom: String(entreprise.nom),
      offre: entreprise.abonnement_offre ?? null,
      periodicite: entreprise.abonnement_periodicite ?? null,
      montantTtc: typeof objet.total === "number" ? objet.total / 100 : null,
      devise: objet.currency ?? null,
      dateEvenementIso: instantDepuisUnix(objet.created),
      numeroFacture: objet.number ?? null,
      lienFacture: objet.hosted_invoice_url ?? null,
    });
  } catch {
    // Notification purement informative : jamais bloquante pour le webhook.
    console.warn("Notification paiement échoué non envoyée", { categorie: "preparation_impossible" });
  }
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_ABONNEMENT_SECRET;
  if (!secret) return NextResponse.json({ error: "Webhook abonnement non configuré" }, { status: 503 });
  const brut = await request.text();
  if (!verifierSignatureStripe(brut, request.headers.get("stripe-signature"), secret)) {
    return NextResponse.json({ error: "Signature invalide" }, { status: 400 });
  }
  let evenementBrut: unknown;
  try {
    evenementBrut = JSON.parse(brut);
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }
  const evenementPourMode = evenementBrut as Partial<StripeEvent>;
  const configurationMode = resoudreModeStripeWebhook();
  if (!configurationMode.valide) {
    if (evenementStripeMinimalValide(evenementBrut)) diagnosticWebhook("error", evenementBrut, `configuration_${configurationMode.motif}`);
    return NextResponse.json({ error: "Webhook temporairement indisponible" }, { status: 503 });
  }
  if (evenementPourMode.livemode !== configurationMode.livemode) {
    if (evenementStripeMinimalValide(evenementBrut)) diagnosticWebhook("warn", evenementBrut, "mode_stripe_incorrect", configurationMode.mode);
    if (evenementPourMode.livemode === false && configurationMode.mode === "live") return NextResponse.json({ received: true, ignored: true });
    return NextResponse.json({ error: "Webhook temporairement indisponible" }, { status: 503 });
  }
  if (evenementPourMode.account) return NextResponse.json({ error: "Événement Connect refusé sur le webhook abonnement" }, { status: 400 });
  if (!evenementStripeMinimalValide(evenementBrut)) {
    return NextResponse.json({ error: "Événement Stripe invalide" }, { status: 400 });
  }
  const evenement = evenementBrut;

  let admin: SupabaseAdmin;
  try {
    admin = createAdminClient();
  } catch {
    diagnosticWebhook("error", evenement, "configuration_supabase_invalide", configurationMode.mode);
    return NextResponse.json({ error: "Webhook temporairement indisponible" }, { status: 503 });
  }
  const objet = evenement.data.object;
  let resolutionEntreprise: ResolutionEntreprise;
  try {
    resolutionEntreprise = await entreprisePour(admin, objet);
  } catch {
    diagnosticWebhook("error", evenement, "connexion_supabase", configurationMode.mode);
    return NextResponse.json({ error: "Webhook temporairement indisponible" }, { status: 503 });
  }
  if (!resolutionEntreprise.ok) {
    diagnosticWebhook("error", evenement, resolutionEntreprise.categorie, configurationMode.mode);
    const statut = ["format_identifiant_invalide","metadata_absente","rattachement_stripe_incoherent"].includes(resolutionEntreprise.categorie) ? 422 : 503;
    return NextResponse.json({ error: "Événement Stripe non traitable" }, { status: statut });
  }
  const entrepriseId = resolutionEntreprise.entrepriseId;
  // ACL canonique : le journal d'idempotence passe par une RPC de service dédiée
  // (`service_role` n'a plus d'accès direct à `abonnement_evenements`).
  let reservation: { code?: string; message?: string } | null = null;
  let reservationEtat: string | null = null;
  try {
    const resultat = await admin.rpc("reserver_evenement_abonnement_service", {
      p_stripe_event_id: evenement.id,
      p_entreprise_id: entrepriseId,
      p_type: evenement.type,
      p_payload: {
        livemode: evenement.livemode,
        object_id: objet.id,
        customer_id: identifiant(objet.customer),
        subscription_id: objet.object === "subscription" ? objet.id : identifiant(objet.subscription),
      },
    });
    reservation = resultat.error;
    reservationEtat = (resultat.data as string) ?? null;
  } catch {
    diagnosticWebhook("error", evenement, "connexion_supabase", configurationMode.mode);
    return NextResponse.json({ error: "Journal indisponible" }, { status: 503 });
  }
  if (reservationEtat === "duplicate") return NextResponse.json({ received: true, duplicate: true });
  if (reservation) {
    diagnosticWebhook("error", evenement, categoriserErreurSupabase(reservation), configurationMode.mode);
    return NextResponse.json({ error: "Journal indisponible" }, { status: 503 });
  }

  let statutResultant: string | null = null;
  try {
    if (evenement.type === "checkout.session.completed" && objet.mode === "subscription") {
      if (!entrepriseId) throw new Error("Entreprise absente de la session Stripe");
      const subscriptionId = identifiant(objet.subscription);
      if (!subscriptionId) throw new Error("Abonnement absent de la session Stripe");
      statutResultant = await synchroniserAbonnementCoordonne(admin, entrepriseId, subscriptionId, evenementOrdonne(evenement));
      await reconcilierAbonnementStripe(entrepriseId);
      // R2-B : capacité personnes = DB → Stripe (autorité DB, out-of-order safe).
      await reconcilierCapacitePersonnesStripe({ entrepriseId, evenementCreatedAt: evenement.created, source: "webhook" }).catch(() => undefined);
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(evenement.type)) {
      const subscriptionId = objet.object === "subscription" ? objet.id : identifiant(objet.subscription);
      if (!subscriptionId) throw new Error("Abonnement Stripe introuvable");
      // Le payload peut être ancien : l'abonnement est RELU chez Stripe sous
      // verrou, puis appliqué par la RPC ordonnée (filigrane d'accès).
      statutResultant = await synchroniserAbonnementCoordonne(admin, entrepriseId, subscriptionId, evenementOrdonne(evenement));
      if (entrepriseId) {
        await reconcilierCapacitePersonnesStripe({ entrepriseId, evenementCreatedAt: evenement.created, source: "webhook" }).catch(() => undefined);
      }
    } else if (evenement.type === "invoice.created" && objet.billing_reason !== "subscription_create") {
      if (!entrepriseId) throw new Error("Entreprise de la facture Stripe introuvable");
      const customerId = identifiant(objet.customer);
      if (!customerId) throw new Error("Client Stripe absent de la facture");
      await Promise.all([
        ajouterDepassementAppareilsFacture({ entrepriseId, customerId, invoiceId: objet.id, montantHt: await calculerDepassementAppareils(entrepriseId) }),
        ajouterDepassementStockageFacture({ entrepriseId, customerId, invoiceId: objet.id }),
      ]);
      await journaliserSansEffet(admin, entrepriseId, evenement, "depassements_facture");
    } else if (["invoice.paid", "invoice.payment_failed", "invoice.payment_action_required"].includes(evenement.type)) {
      if (!entrepriseId) throw new Error("Entreprise de la facture Stripe introuvable");
      // Décision produit conservée (Preview) : un `invoice.payment_failed`
      // APPLICABLE suspend immédiatement (pas de période de grâce).
      // `invoice.payment_action_required` (3-D Secure à confirmer) n'est jamais
      // un échec : trace de facture seulement, statut d'accès inchangé.
      // `invoice.paid` restaure l'accès et régularise l'impayé. L'ordre, les
      // rejeux et les livraisons concurrentes sont arbitrés en base.
      const decision = await appliquerEvenementFacture(admin, entrepriseId, evenement);
      statutResultant = decision.statut_resultant;
      if (decision.decision === "perime") {
        console.warn("Événement Stripe périmé journalisé sans effet", {
          categorie: "evenement_perime",
          motif: decision.motif ?? null,
          type_evenement: evenement.type,
          empreinte_evenement: empreinteEvenementStripe(evenement.id),
        });
      }
      // P1 — un paiement d'abonnement échoué suspend l'accès : le client doit en
      // être informé. Best-effort STRICT, et seulement si l'échec a été
      // réellement APPLIQUÉ : un vieux `payment_failed` rejoué (périmé) ou déjà
      // traité ne renvoie pas d'e-mail.
      if (decision.notifier_echec) {
        await notifierPaiementEchoueSansEchouer(admin, entrepriseId, objet);
      }
    } else {
      await journaliserSansEffet(admin, entrepriseId, evenement, evenement.type === "invoice.created" ? "facture_initiale" : "type_non_traite");
    }
    await admin.rpc("finaliser_evenement_abonnement_service", {
      p_stripe_event_id: evenement.id,
      p_statut_resultant: statutResultant,
    });
    return NextResponse.json({ received: true });
  } catch (e) {
    // Rollback de la réservation : l'évènement redeviendra rejouable.
    await admin.rpc("annuler_evenement_abonnement_service", { p_stripe_event_id: evenement.id });
    // B1 — verrou remise toujours occupé après reprise : état transitoire, pas
    // une panne. On demande une re-livraison (503 + Retry-After), sans alarme
    // « error » ni corps d'erreur métier.
    if (e instanceof VerrouRemiseOccupe) {
      diagnosticWebhook("warn", evenement, "verrou_remise_occupe", configurationMode.mode);
      return NextResponse.json({ received: false, deferred: true }, { status: 503, headers: { "Retry-After": "5" } });
    }
    diagnosticWebhook("error", evenement, "echec_metier_apres_journalisation", configurationMode.mode);
    return NextResponse.json({ error: "Synchronisation impossible" }, { status: 500 });
  }
}
