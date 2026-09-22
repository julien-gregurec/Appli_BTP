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
};
type StripeEvent = { id: string; type: string; livemode: boolean; account?: string; created?: number; data: { object: StripeObjet } };

// Délai de grâce (mission "closure V3", section 6) avant qu'un paiement en échec
// (subscription.status passé à past_due/unpaid) ne coupe réellement l'accès. Le
// produit n'a pas tranché sa durée (docs/DECISIONS_TARIFICATION_NON_RECOMMANDEES.md) :
// plutôt que de choisir arbitrairement un nombre de jours, la durée est configurable
// et vaut 0 par défaut (comportement conservateur inchangé tant que rien n'est réglé).
// Elle ne s'applique jamais à `invoice.payment_action_required` (3-D Secure à
// confirmer, pas un échec de paiement) : voir plus bas.
function delaiGraceJours() {
  const brut = Number(process.env.STRIPE_DELAI_GRACE_PAIEMENT_JOURS ?? 0);
  return Number.isFinite(brut) && brut > 0 ? brut : 0;
}

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

async function synchroniserAbonnement(entrepriseId: string, abonnement: StripeSubscription, evenementCreeAt: string | null) {
  const admin = createAdminClient();

  // Hors-ordre (mission "closure V3", section 7) : un event Stripe livré en retard
  // (retry après incident réseau, etc.) ne doit jamais écraser un état déjà plus
  // frais. On compare l'horodatage de l'*event* (pas de l'objet) à celui du
  // dernier event de statut effectivement appliqué pour cette entreprise.
  const { data: etatActuel } = await admin
    .from("entreprises")
    .select("abonnement_statut,suspension_prevue_at,abonnement_dernier_evenement_at")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (evenementCreeAt && etatActuel?.abonnement_dernier_evenement_at && evenementCreeAt <= etatActuel.abonnement_dernier_evenement_at) {
    return { statut: (etatActuel.abonnement_statut as string | null) ?? null, ignoreHorsOrdre: true };
  }

  const offre = abonnement.metadata?.offre;
  const periodicite = abonnement.metadata?.periodicite;
  const statutCible = statutAbonnementDepuisStripe(abonnement.status);
  const statutActuel = (etatActuel?.abonnement_statut as string) ?? null;

  const miseAJour: Record<string, unknown> = {
    stripe_subscription_id: abonnement.id,
    stripe_customer_id: identifiant(abonnement.customer),
    abonnement_echeance: dateDepuisUnix(abonnement.current_period_end),
    abonnement_essai_fin: dateDepuisUnix(abonnement.trial_end),
    abonnement_annulation_prevue_at: abonnement.cancel_at_period_end ? instantDepuisUnix(abonnement.cancel_at || abonnement.current_period_end) : null,
    updated_at: new Date().toISOString(),
  };
  if (evenementCreeAt) miseAJour.abonnement_dernier_evenement_at = evenementCreeAt;

  let statutResultant = statutCible;
  if (statutCible === "suspendu" && statutActuel && statutActuel !== "suspendu" && statutActuel !== "annule") {
    // Transition vers un échec de paiement (past_due/unpaid) : jamais de coupure
    // synchrone et inconditionnelle. Le délai de grâce (0 par défaut, cf.
    // delaiGraceJours) décide seul du moment réel de la suspension, via
    // suspension_prevue_at + appliquer_suspensions_impayes() (cron) — même
    // mécanisme que le signalement manuel d'impayé par un admin plateforme.
    const echeance = new Date(Date.now() + delaiGraceJours() * 86400000);
    miseAJour.impaye_signale_at = new Date().toISOString();
    miseAJour.suspension_prevue_at = echeance.toISOString();
    miseAJour.abonnement_statut = statutActuel; // accès conservé jusqu'à l'échéance
    statutResultant = statutActuel;
  } else if (statutCible === "actif") {
    // Paiement régularisé (ou abonnement qui redevient actif) : la restauration
    // d'accès, elle, est toujours immédiate — aucune raison de faire attendre un
    // client qui vient de payer.
    miseAJour.abonnement_statut = "actif";
    miseAJour.impaye_signale_at = null;
    miseAJour.suspension_prevue_at = null;
  } else {
    miseAJour.abonnement_statut = statutCible;
  }

  if (["essentiel", "premium", "mini", "pro", "business", "entreprise", "sur_mesure"].includes(offre || "")) miseAJour.abonnement_offre = offre;
  if (["mensuel", "annuel"].includes(periodicite || "")) miseAJour.abonnement_periodicite = periodicite;
  const { error } = await admin.from("entreprises").update(miseAJour).eq("id", entrepriseId);
  if (error) throw new Error(error.message);
  const statut = statutResultant;
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
  return { statut, ignoreHorsOrdre: false };
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

  const evenementCreeAt = instantDepuisUnix(evenement.created);
  let statutResultant: string | null = null;
  try {
    if (evenement.type === "checkout.session.completed" && objet.mode === "subscription") {
      if (!entrepriseId) throw new Error("Entreprise absente de la session Stripe");
      const subscriptionId = identifiant(objet.subscription);
      if (!subscriptionId) throw new Error("Abonnement absent de la session Stripe");
      const resultat = await synchroniserAbonnement(entrepriseId, await recupererAbonnementStripe(subscriptionId), evenementCreeAt);
      statutResultant = resultat.ignoreHorsOrdre ? "ignore_hors_ordre" : resultat.statut;
      await reconcilierAbonnementStripe(entrepriseId);
    } else if (["customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted"].includes(evenement.type)) {
      if (!entrepriseId) throw new Error("Entreprise Stripe introuvable");
      const resultat = await synchroniserAbonnement(entrepriseId, objet as StripeSubscription, evenementCreeAt);
      statutResultant = resultat.ignoreHorsOrdre ? "ignore_hors_ordre" : resultat.statut;
    } else if (evenement.type === "invoice.created" && objet.billing_reason !== "subscription_create") {
      if (!entrepriseId) throw new Error("Entreprise de la facture Stripe introuvable");
      const customerId = identifiant(objet.customer);
      if (!customerId) throw new Error("Client Stripe absent de la facture");
      await Promise.all([
        ajouterDepassementAppareilsFacture({ entrepriseId, customerId, invoiceId: objet.id, montantHt: await calculerDepassementAppareils(entrepriseId) }),
        ajouterDepassementStockageFacture({ entrepriseId, customerId, invoiceId: objet.id }),
      ]);
    } else if (evenement.type === "invoice.paid") {
      // Paiement réussi : restauration d'accès immédiate (jamais de délai de grâce
      // pour redonner l'accès), et régularisation de tout impayé en cours.
      if (!entrepriseId) throw new Error("Entreprise de la facture Stripe introuvable");
      statutResultant = "actif";
      const { error } = await admin.from("entreprises").update({
        abonnement_statut: "actif",
        impaye_signale_at: null,
        suspension_prevue_at: null,
        derniere_facture_stripe_id: objet.id,
        derniere_facture_url: objet.hosted_invoice_url || null,
        derniere_facture_pdf: objet.invoice_pdf || null,
        derniere_facture_statut: objet.status || evenement.type,
        derniere_facture_at: instantDepuisUnix(objet.created) || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", entrepriseId);
      if (error) throw new Error(error.message);
      await synchroniserFactureAbonnement(entrepriseId, objet, objet.status || evenement.type.replace("invoice.", ""));
    } else if (evenement.type === "invoice.payment_action_required") {
      // 3-D Secure à confirmer : ce n'est PAS un échec de paiement (mission
      // "closure V3", section 6 — rapport de qualification V2 §4/§9). Ne jamais
      // suspendre ni poser d'échéance de suspension ici ; seule la trace de
      // facture est mise à jour. La bascule éventuelle vers "suspendu" ne peut
      // venir que d'un vrai échec (subscription.status past_due/unpaid, ou
      // invoice.payment_failed juste en dessous).
      if (!entrepriseId) throw new Error("Entreprise de la facture Stripe introuvable");
      statutResultant = "action_requise";
      const { error } = await admin.from("entreprises").update({
        derniere_facture_stripe_id: objet.id,
        derniere_facture_url: objet.hosted_invoice_url || null,
        derniere_facture_pdf: objet.invoice_pdf || null,
        derniere_facture_statut: objet.status || evenement.type,
        derniere_facture_at: instantDepuisUnix(objet.created) || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", entrepriseId);
      if (error) throw new Error(error.message);
      await synchroniserFactureAbonnement(entrepriseId, objet, objet.status || evenement.type.replace("invoice.", ""));
    } else if (evenement.type === "invoice.payment_failed") {
      // Échec réel de paiement : pose (ou confirme) une échéance de suspension
      // avec délai de grâce, sans couper l'accès immédiatement — même mécanisme
      // que synchroniserAbonnement() pour customer.subscription.updated, en
      // filet de sécurité si cet event invoice arrive sans event subscription
      // correspondant.
      if (!entrepriseId) throw new Error("Entreprise de la facture Stripe introuvable");
      const { data: etatActuel } = await admin
        .from("entreprises")
        .select("abonnement_statut,impaye_signale_at,suspension_prevue_at")
        .eq("id", entrepriseId)
        .maybeSingle();
      const dejaSignale = Boolean(etatActuel?.impaye_signale_at && etatActuel?.suspension_prevue_at);
      const miseAJour: Record<string, unknown> = {
        derniere_facture_stripe_id: objet.id,
        derniere_facture_url: objet.hosted_invoice_url || null,
        derniere_facture_pdf: objet.invoice_pdf || null,
        derniere_facture_statut: objet.status || evenement.type,
        derniere_facture_at: instantDepuisUnix(objet.created) || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      if (etatActuel?.abonnement_statut !== "suspendu" && etatActuel?.abonnement_statut !== "annule" && !dejaSignale) {
        miseAJour.impaye_signale_at = new Date().toISOString();
        miseAJour.suspension_prevue_at = new Date(Date.now() + delaiGraceJours() * 86400000).toISOString();
      }
      statutResultant = (etatActuel?.abonnement_statut as string | undefined) ?? "suspendu_en_attente";
      const { error } = await admin.from("entreprises").update(miseAJour).eq("id", entrepriseId);
      if (error) throw new Error(error.message);
      await synchroniserFactureAbonnement(entrepriseId, objet, objet.status || evenement.type.replace("invoice.", ""));
    }
    await admin.from("abonnement_evenements").update({ statut_resultant: statutResultant }).eq("stripe_event_id", evenement.id);
    return NextResponse.json({ received: true });
  } catch (error) {
    await admin.from("abonnement_evenements").delete().eq("stripe_event_id", evenement.id);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Synchronisation impossible" }, { status: 500 });
  }
}
