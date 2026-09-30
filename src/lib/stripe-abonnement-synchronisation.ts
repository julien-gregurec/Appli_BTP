// Synchronisation d'un abonnement Stripe vers ELSATIA.
//
// Ce module porte la logique métier qui vivait auparavant dans
// `src/app/api/stripe/abonnement/webhook/route.ts`. Un fichier `route.ts` ne
// peut exporter que les gestionnaires HTTP reconnus par Next.js (GET, POST, …)
// et la configuration de segment : tout autre export est refusé au build par la
// vérification de types générée par Next.js. La fonction
// `synchroniserAbonnementCoordonne` est une fonction métier interne — pas un
// gestionnaire HTTP — et devait donc sortir de la route pour rester importable
// (route, tests, futurs appelants) sans casser le build.
//
// Le comportement est repris à l'identique : même ordre d'appels, mêmes RPC,
// mêmes erreurs propagées.
import { createAdminClient } from "@/lib/supabase/admin";
import { offreFactureeDepuisSubscription, recupererAbonnementStripe, statutAbonnementDepuisStripe, type StripeSubscription } from "@/lib/stripe-abonnement";
import { empreinteEvenementStripe } from "@/lib/stripe-webhook-environment";
import { passerelleStripeRemise } from "@/lib/stripe-discount-gateway";
import { acquerirVerrouRemise, libererVerrouRemise, lireOperationActiveRemiseServeur, reconcilierOperationRemiseSousVerrou, synchroniserExpirationRemiseSousVerrou, VerrouRemiseOccupe } from "@/lib/stripe-discount-server";

export type SupabaseAdmin = ReturnType<typeof createAdminClient>;
export type StripeReference = string | { id?: string } | null | undefined;

export function identifiant(reference: StripeReference) {
  return typeof reference === "string" ? reference : reference?.id || null;
}

export function dateDepuisUnix(valeur?: number | null) {
  return valeur ? new Date(valeur * 1000).toISOString().slice(0, 10) : null;
}

export function instantDepuisUnix(valeur?: number | null) {
  return valeur ? new Date(valeur * 1000).toISOString() : null;
}

// B1 — un verrou remise occupé est un état transitoire (un autre évènement de la
// MÊME subscription est en cours de traitement), pas une panne. On tente une
// courte reprise en place ; si le verrou reste occupé, l'appelant renvoie un
// code HTTP « rejouable » (503) pour que Stripe re-livre — jamais un 500.
async function acquerirVerrouRemiseAvecReprise(admin: SupabaseAdmin, subscriptionId: string, proprietaire: string) {
  const attentesMs = [150, 300, 600];
  for (let i = 0; ; i++) {
    try {
      return await acquerirVerrouRemise(admin, subscriptionId, proprietaire);
    } catch (e) {
      if (!(e instanceof VerrouRemiseOccupe) || i >= attentesMs.length) throw e;
      await new Promise((r) => setTimeout(r, attentesMs[i]));
    }
  }
}

// Contrat d'ordre Stripe (migration 20260927000506) : l'événement qui a
// déclenché la relecture. `created` est l'horloge Stripe de l'événement, jamais
// l'ordre d'arrivée HTTP.
export type EvenementOrdonne = {
  id: string;
  type: string;
  created: number;
  objetType: string;
  objetId: string;
};

export type DecisionOrdre = { decision: "applique" | "perime" | "deja_traite"; statut_resultant: string | null };

/**
 * Rattachement refusé par la base (ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1) :
 * subscription d'un autre client, ou ancienne subscription encore vivante chez
 * Stripe (double abonnement). Non traitable en l'état : 422, jamais appliqué.
 */
export class RattachementSubscriptionRefuse extends Error {
  constructor() {
    super("Rattachement de subscription Stripe refusé");
    this.name = "RattachementSubscriptionRefuse";
  }
}

/** Issue de `lier`/`relier` : la subscription est-elle la courante de l'entreprise ? */
export type IssueRattachement = "lie" | "deja_lie" | "relie" | "remplacee" | "terminale_ignoree";

/**
 * Rattache la subscription relue à l'entreprise (ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1).
 *
 * - Première liaison ou subscription déjà courante : contrat historique.
 * - L'entreprise porte une AUTRE subscription : l'ancienne est RELUE chez
 *   Stripe ; la base ne remplace que si elle est terminée (`canceled`,
 *   `incomplete_expired`) et le client identique (fail-closed sinon).
 * - Subscription déjà remplacée, ou nouvelle déjà terminale : jamais rattachée,
 *   l'événement est sans effet sur l'accès.
 */
async function rattacherSubscription(admin: SupabaseAdmin, entrepriseId: string, abonnement: StripeSubscription): Promise<IssueRattachement> {
  const { data: entreprise, error: lecture } = await admin
    .from("entreprises")
    .select("stripe_subscription_id")
    .eq("id", entrepriseId)
    .maybeSingle();
  if (lecture) throw new Error(lecture.message);
  const courante = (entreprise as { stripe_subscription_id?: string | null } | null)?.stripe_subscription_id ?? null;
  let ancienneStatut: string | null = null;
  if (courante && courante !== abonnement.id) {
    ancienneStatut = (await recupererAbonnementStripe(courante)).status;
  }
  const { data, error } = await admin.rpc("relier_subscription_reabonnement_service", {
    p_entreprise_id: entrepriseId,
    p_nouvelle_subscription_id: abonnement.id,
    p_stripe_customer_id: identifiant(abonnement.customer),
    p_nouvelle_statut_stripe: abonnement.status,
    p_ancienne_subscription_id: courante && courante !== abonnement.id ? courante : null,
    p_ancienne_statut_stripe: ancienneStatut,
  });
  if (error) {
    if ((error as { code?: string }).code === "42501") throw new RattachementSubscriptionRefuse();
    throw new Error(error.message);
  }
  return (data as IssueRattachement | null) ?? "deja_lie";
}

async function journaliserSubscriptionIgnoree(admin: SupabaseAdmin, entrepriseId: string, evenement: EvenementOrdonne, motif: string) {
  const { error } = await admin.rpc("journaliser_evenement_stripe_ordre_service", {
    p_flux: "abonnement",
    p_stripe_event_id: evenement.id,
    p_stripe_event_type: evenement.type,
    p_stripe_event_created: instantDepuisUnix(evenement.created),
    p_objet_type: evenement.objetType,
    p_objet_id: evenement.objetId,
    p_entreprise_id: entrepriseId,
    p_motif: motif,
  });
  if (error) console.warn("Journal d'ordonnancement Stripe non écrit", { categorie: "journal_ordre_indisponible", type_evenement: evenement.type });
}

async function synchroniserAbonnement(admin: SupabaseAdmin, entrepriseId: string, abonnement: StripeSubscription, evenement: EvenementOrdonne) {
  // Offre FACTURÉE : le Price de forfait courant fait autorité sur la metadata
  // du Checkout, que le Portail ne met pas à jour lors d'un changement d'offre
  // (ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1, B-3).
  const facturee = offreFactureeDepuisSubscription(abonnement);
  if (facturee.divergence) {
    console.warn("Offre Stripe : metadata divergente du Price facturé, Price retenu", {
      categorie: "offre_metadata_divergente",
      type_evenement: evenement.type,
      empreinte_evenement: empreinteEvenementStripe(evenement.id),
    });
  }
  const offre = facturee.offre;
  const periodicite = facturee.periodicite;
  const statut = statutAbonnementDepuisStripe(abonnement.status);
  // ACL canonique (migration 255) : `service_role` n'a plus d'écriture directe sur
  // `entreprises` (hors colonnes abonnement/stripe), `plans_abonnement`,
  // `abonnements_entreprises`. La synchronisation passe par une RPC SECURITY
  // DEFINER bornée qui vérifie le lien subscription ↔ entreprise (fail-closed).
  // Version ordonnée : verrou ligne entreprise + filigrane d'accès. Une
  // relecture déclenchée par un événement antérieur au dernier appliqué
  // rafraîchit l'offre et les échéances mais ne peut pas inverser le statut
  // d'accès (ex. vieux past_due relu pendant qu'un invoice.paid plus récent
  // était appliqué en parallèle).
  const { data, error } = await admin.rpc("synchroniser_abonnement_stripe_ordonne_service", {
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
    p_stripe_event_id: evenement.id,
    p_stripe_event_type: evenement.type,
    p_stripe_event_created: instantDepuisUnix(evenement.created),
    p_objet_type: evenement.objetType,
    p_objet_id: evenement.objetId,
  });
  if (error) throw new Error(error.message);
  const resultat = (data ?? null) as DecisionOrdre | null;
  return resultat?.statut_resultant ?? statut;
}

/**
 * Relit la subscription chez Stripe, la rattache, puis l'applique par la RPC
 * ordonnée. Renvoie le statut résultant, ou `null` si la subscription n'est pas
 * (ou plus) celle de l'entreprise : événement journalisé sans effet.
 */
export async function synchroniserAbonnementCoordonne(
  admin: SupabaseAdmin,
  entrepriseId: string,
  subscriptionId: string,
  evenement: EvenementOrdonne,
): Promise<string | null> {
  const verrou = await acquerirVerrouRemiseAvecReprise(admin, subscriptionId, `webhook:${empreinteEvenementStripe(evenement.id)}`);
  try {
    // Le payload peut être ancien ou désordonné : seule cette relecture est une
    // observation Stripe utilisable pour la remise et la saga active.
    let abonnementActuel = await recupererAbonnementStripe(subscriptionId);
    // B3 — première liaison : la chaîne remise ci-dessous exige que la
    // subscription soit déjà rattachée à l'entreprise. Réabonnement : une
    // nouvelle subscription ne remplace l'ancienne que si celle-ci est terminée
    // chez Stripe (fail-closed sinon).
    const issue = await rattacherSubscription(admin, entrepriseId, abonnementActuel);
    if (issue === "remplacee" || issue === "terminale_ignoree") {
      await journaliserSubscriptionIgnoree(admin, entrepriseId, evenement,
        issue === "remplacee" ? "subscription_remplacee" : "subscription_terminale_non_rattachee");
      return null;
    }
    const operation = await lireOperationActiveRemiseServeur(admin, subscriptionId, verrou);
    if (operation) {
      await reconcilierOperationRemiseSousVerrou(admin, operation, verrou, passerelleStripeRemise);
      abonnementActuel = await recupererAbonnementStripe(subscriptionId);
    }
    const expiration = await synchroniserExpirationRemiseSousVerrou(
      admin, entrepriseId, abonnementActuel, verrou, passerelleStripeRemise,
    );
    if (expiration) abonnementActuel = await recupererAbonnementStripe(subscriptionId);
    return await synchroniserAbonnement(admin, entrepriseId, abonnementActuel, evenement);
  } finally {
    await libererVerrouRemise(admin, subscriptionId, verrou);
  }
}
