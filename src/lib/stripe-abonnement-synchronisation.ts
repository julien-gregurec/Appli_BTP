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
import { recupererAbonnementStripe, statutAbonnementDepuisStripe, type StripeSubscription } from "@/lib/stripe-abonnement";
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

export async function synchroniserAbonnementCoordonne(
  admin: SupabaseAdmin,
  entrepriseId: string,
  subscriptionId: string,
  evenementId: string,
) {
  const verrou = await acquerirVerrouRemiseAvecReprise(admin, subscriptionId, `webhook:${empreinteEvenementStripe(evenementId)}`);
  try {
    // Le payload peut être ancien ou désordonné : seule cette relecture est une
    // observation Stripe utilisable pour la remise et la saga active.
    let abonnementActuel = await recupererAbonnementStripe(subscriptionId);
    // B3 — première liaison : la chaîne remise ci-dessous exige que la
    // subscription soit déjà rattachée à l'entreprise. On lie ici (CAS sur NULL,
    // fail-closed si déjà liée à une autre subscription).
    const lien = await admin.rpc("lier_subscription_entreprise_service", {
      p_entreprise_id: entrepriseId,
      p_stripe_subscription_id: subscriptionId,
      p_stripe_customer_id: identifiant(abonnementActuel.customer),
    });
    if (lien.error) throw new Error(lien.error.message);
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
