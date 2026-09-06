// Logique pure de la vue opérateur « Diagnostic Stripe & webhooks »
// (`src/app/(app)/plateforme/stripe/page.tsx`). Aucune I/O, aucun accès Supabase
// ni Stripe : la page se contente de brancher ces fonctions sur des lignes déjà
// lues sous RLS plateforme.

export const JOURS_SILENCE_ALERTE = 7;

// Statuts Stripe d'une facture d'abonnement qui n'est PAS encaissée. `void` et
// `uncollectible` sont inclus : ils réclament une décision opérateur, pas un
// simple délai. `draft` en est exclu (facture pas encore émise).
export const STATUTS_FACTURE_EN_ECHEC = ["open", "uncollectible", "past_due", "payment_failed", "void"] as const;

export type EvenementJournal = { entreprise_id: string | null; created_at: string };
export type AbonnementSuivi = { id: string; abonnement_statut: string; stripe_subscription_id: string | null };

export function joursDepuis(valeur: string | null | undefined, maintenant: number = Date.now()) {
  if (!valeur) return null;
  const date = new Date(valeur);
  if (Number.isNaN(date.getTime())) return null;
  return Math.floor((maintenant - date.getTime()) / 86_400_000);
}

// Les évènements arrivent triés du plus récent au plus ancien : la première
// occurrence rencontrée pour une entreprise est donc la plus récente.
export function dernierEvenementParEntreprise<T extends EvenementJournal>(evenements: readonly T[]) {
  const dernier = new Map<string, T>();
  for (const evenement of evenements) {
    if (evenement.entreprise_id && !dernier.has(evenement.entreprise_id)) dernier.set(evenement.entreprise_id, evenement);
  }
  return dernier;
}

// Signal exploitable côté opérateur : le journal ne conserve que les évènements
// TRAITÉS (un échec métier est retiré pour rester rejouable). On ne peut donc
// pas détecter une panne en lisant des erreurs — on la détecte par le SILENCE
// d'un abonnement qui devrait produire des évènements.
export function abonnementsSilencieux<T extends AbonnementSuivi>(
  abonnements: readonly T[],
  dernierEvenement: ReadonlyMap<string, EvenementJournal>,
  options: { seuilJours?: number; maintenant?: number } = {},
) {
  const seuil = options.seuilJours ?? JOURS_SILENCE_ALERTE;
  return abonnements.filter((abonnement) => {
    if (!abonnement.stripe_subscription_id) return false;
    if (!["essai", "actif"].includes(abonnement.abonnement_statut)) return false;
    const jours = joursDepuis(dernierEvenement.get(abonnement.id)?.created_at, options.maintenant);
    return jours === null || jours > seuil;
  });
}

// Le payload journalisé est borné par la RPC de service (livemode, object_id,
// customer_id, subscription_id). On n'affiche jamais le JSON brut : uniquement
// les clés attendues, et seulement si ce sont bien des chaînes.
export function texteDepuisPayload(payload: Record<string, unknown> | null | undefined, cle: string) {
  const valeur = payload?.[cle];
  return typeof valeur === "string" && valeur.trim() !== "" ? valeur : null;
}

export function modeDepuisPayload(payload: Record<string, unknown> | null | undefined) {
  if (payload?.livemode === true) return "live";
  if (payload?.livemode === false) return "test";
  return null;
}
