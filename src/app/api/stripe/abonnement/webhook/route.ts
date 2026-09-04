import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ajouterDepassementAppareilsFacture, ajouterDepassementStockageFacture, calculerDepassementAppareils, reconcilierAbonnementStripe, recupererAbonnementStripe, statutAbonnementDepuisStripe, type StripeSubscription } from "@/lib/stripe-abonnement";
import { verifierSignatureStripe } from "@/lib/stripe";
import { categoriserErreurSupabase, empreinteEvenementStripe, identifiantUuidValide, resoudreModeStripeWebhook } from "@/lib/stripe-webhook-environment";
import { reconcilierCapacitePersonnesStripe } from "@/lib/stripe-capacite-reconcile";
import { passerelleStripeRemise } from "@/lib/stripe-discount-gateway";
import { acquerirVerrouRemise, libererVerrouRemise, lireOperationActiveRemiseServeur, reconcilierOperationRemiseSousVerrou, synchroniserExpirationRemiseSousVerrou } from "@/lib/stripe-discount-server";

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
  discounts?: Array<string | { id?: string }> | null;
  number?: string | null;
  currency?: string;
  subtotal_excluding_tax?: number | null;
  total?: number;
  total_tax_amounts?: Array<{ amount?: number }>;
};
type StripeEvent = { id: string; type: string; livemode: boolean; created?: number; account?: string; data: { object: StripeObjet } };
type SupabaseAdmin = ReturnType<typeof createAdminClient>;
type EntrepriseStripe = { id: string; stripe_customer_id?: string | null; stripe_subscription_id?: string | null };
type ResolutionEntreprise =
  | { ok: true; entrepriseId: string }
  | { ok: false; categorie: "metadata_absente" | "format_identifiant_invalide" | "entreprise_inconnue" | "rattachement_stripe_incoherent" | ReturnType<typeof categoriserErreurSupabase> };

function identifiant(reference: StripeReference) {
  return typeof reference === "string" ? reference : reference?.id || null;
}

function evenementStripeMinimalValide(valeur: unknown): valeur is StripeEvent {
  if (!valeur || typeof valeur !== "object") return false;
  const candidat = valeur as Partial<StripeEvent>;
  return typeof candidat.id === "string" && candidat.id.trim() !== ""
    && typeof candidat.type === "string" && candidat.type.trim() !== ""
    && typeof candidat.livemode === "boolean"
    && !!candidat.data && typeof candidat.data === "object"
    && !!candidat.data.object && typeof candidat.data.object === "object"
    && typeof candidat.data.object.id === "string" && candidat.data.object.id.trim() !== "";
}

function dateDepuisUnix(valeur?: number | null) {
  return valeur ? new Date(valeur * 1000).toISOString().slice(0, 10) : null;
}

function instantDepuisUnix(valeur?: number | null) {
  return valeur ? new Date(valeur * 1000).toISOString() : null;
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

async function synchroniserAbonnement(admin: SupabaseAdmin, entrepriseId: string, abonnement: StripeSubscription) {
  const offre = abonnement.metadata?.offre;
  const periodicite = abonnement.metadata?.periodicite;
  const statut = statutAbonnementDepuisStripe(abonnement.status);
  // ACL canonique (migration 255) : `service_role` n'a plus d'écriture directe sur
  // `entreprises` (hors colonnes abonnement/stripe), `plans_abonnement`,
  // `abonnements_entreprises`. La synchronisation passe par une RPC SECURITY
  // DEFINER bornée qui vérifie le lien subscription ↔ entreprise (fail-closed).
  const { data, error } = await admin.rpc("synchroniser_abonnement_stripe_service", {
    p_entreprise_id: entrepriseId,
    p_stripe_subscription_id: abonnement.id,
    p_stripe_customer_id: identifiant(abonnement.customer),
    p_statut: statut,
    p_offre: ["essentiel", "premium", "mini", "pro", "business", "entreprise", "sur_mesure"].includes(offre || "") ? offre : null,
    p_periodicite: ["mensuel", "annuel"].includes(periodicite || "") ? periodicite : null,
    p_echeance: dateDepuisUnix(abonnement.current_period_end),
    p_essai_fin: dateDepuisUnix(abonnement.trial_end),
    p_annulation_prevue_at: abonnement.cancel_at_period_end ? instantDepuisUnix(abonnement.cancel_at || abonnement.current_period_end) : null,
    p_debut_periode: instantDepuisUnix(abonnement.current_period_start),
    p_fin_periode: instantDepuisUnix(abonnement.current_period_end),
  });
  if (error) throw new Error(error.message);
  return (data as string) ?? statut;
}

async function synchroniserFactureAbonnement(admin: SupabaseAdmin, entrepriseId: string, objet: StripeObjet, statut: string) {
  const taxes = (objet.total_tax_amounts ?? []).reduce((total, taxe) => total + Number(taxe.amount ?? 0), 0);
  const totalCentimes = Number(objet.total ?? 0);
  const htCentimes = objet.subtotal_excluding_tax == null ? Math.max(0, totalCentimes - taxes) : Number(objet.subtotal_excluding_tax);
  // ACL canonique : `factures_abonnement` n'est plus écrite en direct par `service_role`.
  const { error } = await admin.rpc("synchroniser_facture_abonnement_service", {
    p_entreprise_id: entrepriseId,
    p_stripe_invoice_id: objet.id,
    p_numero: objet.number ?? null,
    p_periode_debut: instantDepuisUnix(objet.period_start),
    p_periode_fin: instantDepuisUnix(objet.period_end),
    p_montant_ht: htCentimes / 100,
    p_montant_tva: taxes / 100,
    p_montant_ttc: totalCentimes / 100,
    p_devise: (objet.currency ?? "eur").toUpperCase(),
    p_statut: statut,
    p_url_facture: objet.hosted_invoice_url ?? null,
    p_url_pdf: objet.invoice_pdf ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function synchroniserAbonnementCoordonne(
  admin: SupabaseAdmin,
  entrepriseId: string,
  subscriptionId: string,
  evenementId: string,
) {
  const verrou = await acquerirVerrouRemise(admin, subscriptionId, `webhook:${empreinteEvenementStripe(evenementId)}`);
  try {
    // Le payload peut être ancien ou désordonné : seule cette relecture est une
    // observation Stripe utilisable pour la remise et la saga active.
    let abonnementActuel = await recupererAbonnementStripe(subscriptionId);
    const operation = await lireOperationActiveRemiseServeur(admin, subscriptionId, verrou);
    if (operation) {
      await reconcilierOperationRemiseSousVerrou(admin, operation, verrou, passerelleStripeRemise);
      abonnementActuel = await recupererAbonnementStripe(subscriptionId);
    }
    const expiration = await synchroniserExpirationRemiseSousVerrou(
      admin, entrepriseId, abonnementActuel, verrou, passerelleStripeRemise,
    );
    if (expiration) abonnementActuel = await recupererAbonnementStripe(subscriptionId);
    return await synchroniserAbonnement(admin, entrepriseId, abonnementActuel);
  } finally {
    await libererVerrouRemise(admin, subscriptionId, verrou);
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
      statutResultant = await synchroniserAbonnementCoordonne(admin, entrepriseId, subscriptionId, evenement.id);
      await reconcilierAbonnementStripe(entrepriseId);
      // R2-B : capacité personnes = DB → Stripe (autorité DB, out-of-order safe).
      await reconcilierCapacitePersonnesStripe({ entrepriseId, evenementCreatedAt: evenement.created, source: "webhook" }).catch(() => undefined);
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(evenement.type)) {
      const subscriptionId = objet.object === "subscription" ? objet.id : identifiant(objet.subscription);
      if (!subscriptionId) throw new Error("Abonnement Stripe introuvable");
      statutResultant = await synchroniserAbonnementCoordonne(admin, entrepriseId, subscriptionId, evenement.id);
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
      await synchroniserFactureAbonnement(admin, entrepriseId, objet, objet.status || evenement.type.replace("invoice.", ""));
    }
    await admin.rpc("finaliser_evenement_abonnement_service", {
      p_stripe_event_id: evenement.id,
      p_statut_resultant: statutResultant,
    });
    return NextResponse.json({ received: true });
  } catch {
    await admin.rpc("annuler_evenement_abonnement_service", { p_stripe_event_id: evenement.id });
    diagnosticWebhook("error", evenement, "echec_metier_apres_journalisation", configurationMode.mode);
    return NextResponse.json({ error: "Synchronisation impossible" }, { status: 500 });
  }
}
