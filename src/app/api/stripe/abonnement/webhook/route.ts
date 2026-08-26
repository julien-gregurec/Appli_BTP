import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ajouterDepassementAppareilsFacture, ajouterDepassementStockageFacture, calculerDepassementAppareils, reconcilierAbonnementStripe, recupererAbonnementStripe, statutAbonnementDepuisStripe, synchroniserExpirationRemise, type StripeSubscription } from "@/lib/stripe-abonnement";
import { verifierSignatureStripe } from "@/lib/stripe";
import { categoriserErreurSupabase, empreinteEvenementStripe, identifiantUuidValide, resoudreModeStripeWebhook } from "@/lib/stripe-webhook-environment";

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
type StripeEvent = { id: string; type: string; livemode: boolean; account?: string; data: { object: StripeObjet } };
type SupabaseAdmin = ReturnType<typeof createAdminClient>;
type EntrepriseStripe = { id: string; stripe_customer_id?: string | null; stripe_subscription_id?: string | null };
type ResolutionEntreprise =
  | { ok: true; entrepriseId: string }
  | { ok: false; categorie: "metadata_absente" | "format_identifiant_invalide" | "entreprise_inconnue" | "rattachement_stripe_incoherent" | ReturnType<typeof categoriserErreurSupabase> };

function identifiant(reference: StripeReference) {
  return typeof reference === "string" ? reference : reference?.id || null;
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
    if (customerId && entreprise.stripe_customer_id && customerId !== entreprise.stripe_customer_id) {
      return { ok: false, categorie: "rattachement_stripe_incoherent" };
    }
    if (subscriptionId && entreprise.stripe_subscription_id && subscriptionId !== entreprise.stripe_subscription_id) {
      return { ok: false, categorie: "rattachement_stripe_incoherent" };
    }
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

function diagnosticWebhook(niveau: "warn" | "error", evenement: Pick<StripeEvent, "id" | "type" | "livemode">, categorie: string, attendu?: "test" | "live") {
  console[niveau]("Webhook abonnement non traité", {
    categorie,
    type_evenement: evenement.type,
    empreinte_evenement: empreinteEvenementStripe(evenement.id),
    mode_recu: evenement.livemode ? "live" : "test",
    ...(attendu ? { mode_attendu: attendu } : {}),
  });
}

async function synchroniserAbonnement(entrepriseId: string, abonnement: StripeSubscription) {
  const admin = createAdminClient();
  await synchroniserExpirationRemise(entrepriseId, abonnement);
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
  if (["essentiel", "premium", "mini", "pro", "business", "entreprise", "sur_mesure"].includes(offre || "")) miseAJour.abonnement_offre = offre;
  if (["mensuel", "annuel"].includes(periodicite || "")) miseAJour.abonnement_periodicite = periodicite;
  const { error } = await admin.from("entreprises").update(miseAJour).eq("id", entrepriseId);
  if (error) throw new Error(error.message);
  if (offre && periodicite && ["mensuel", "annuel"].includes(periodicite)) {
    const { data: plan } = await admin
      .from("plans_abonnement")
      .select("id,version,prix_mensuel_ht,prix_annuel_ht")
      .eq("code", offre)
      .eq("actif", true)
      .maybeSingle();
    const { data: contrat } = await admin
      .from("abonnements_entreprises")
      .select("id,code_offre,prix_contractuel_ht,version_tarif")
      .eq("entreprise_id", entrepriseId)
      .maybeSingle();
    const memeOffre = contrat?.code_offre === offre;
    const prixContractuel = memeOffre && contrat?.prix_contractuel_ht != null
      ? contrat.prix_contractuel_ht
      : (periodicite === "annuel" ? plan?.prix_annuel_ht : plan?.prix_mensuel_ht);
    if (plan && prixContractuel != null) {
      const { error: contratErreur } = await admin.from("abonnements_entreprises").upsert({
        entreprise_id: entrepriseId,
        plan_id: plan.id,
        code_offre: offre,
        version_tarif: memeOffre ? contrat?.version_tarif ?? plan.version : plan.version,
        periodicite,
        prix_contractuel_ht: prixContractuel,
        statut: statut === "actif" ? "actif" : statut === "suspendu" ? "suspendu" : statut === "annule" ? "annule" : "essai",
        debut_periode: instantDepuisUnix(abonnement.current_period_start),
        fin_periode: instantDepuisUnix(abonnement.current_period_end),
        stripe_subscription_id: abonnement.id,
        stripe_customer_id: identifiant(abonnement.customer),
        updated_at: new Date().toISOString(),
      }, { onConflict: "entreprise_id" });
      if (contratErreur) throw new Error(contratErreur.message);
    }
  }
  return statut;
}

async function synchroniserFactureAbonnement(entrepriseId: string, objet: StripeObjet, statut: string) {
  const admin = createAdminClient();
  const taxes = (objet.total_tax_amounts ?? []).reduce((total, taxe) => total + Number(taxe.amount ?? 0), 0);
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
    payee_at: statut === "paid" ? new Date().toISOString() : null,
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
  const configurationMode = resoudreModeStripeWebhook();
  if (!configurationMode.valide) {
    diagnosticWebhook("error", evenement, `configuration_${configurationMode.motif}`);
    return NextResponse.json({ error: "Webhook temporairement indisponible" }, { status: 503 });
  }
  if (evenement.livemode !== configurationMode.livemode) {
    diagnosticWebhook("warn", evenement, "mode_stripe_incorrect", configurationMode.mode);
    if (!evenement.livemode && configurationMode.mode === "live") {
      return NextResponse.json({ received: true, ignored: true });
    }
    return NextResponse.json({ error: "Webhook temporairement indisponible" }, { status: 503 });
  }
  if (evenement.account) return NextResponse.json({ error: "Événement Connect refusé sur le webhook abonnement" }, { status: 400 });

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
    const statut = ["format_identifiant_invalide", "metadata_absente", "rattachement_stripe_incoherent"].includes(resolutionEntreprise.categorie) ? 422 : 503;
    return NextResponse.json({ error: "Événement Stripe non traitable" }, { status: statut });
  }
  const entrepriseId = resolutionEntreprise.entrepriseId;
  let reservation: { code?: string; message?: string } | null;
  try {
    const resultatReservation = await admin.from("abonnement_evenements").insert({
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
    reservation = resultatReservation.error;
  } catch {
    diagnosticWebhook("error", evenement, "connexion_supabase", configurationMode.mode);
    return NextResponse.json({ error: "Journal indisponible" }, { status: 503 });
  }
  if (reservation?.code === "23505") return NextResponse.json({ received: true, duplicate: true });
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
      await synchroniserFactureAbonnement(entrepriseId, objet, objet.status || evenement.type.replace("invoice.", ""));
    }
    await admin.from("abonnement_evenements").update({ statut_resultant: statutResultant }).eq("stripe_event_id", evenement.id);
    return NextResponse.json({ received: true });
  } catch {
    await admin.from("abonnement_evenements").delete().eq("stripe_event_id", evenement.id);
    diagnosticWebhook("error", evenement, "echec_metier_apres_journalisation", configurationMode.mode);
    return NextResponse.json({ error: "Synchronisation impossible" }, { status: 500 });
  }
}
