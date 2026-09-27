// Synchronisation de l'essai ELSATIA vers Stripe Checkout (finding F-1 du lot
// Stripe Ordering, rapport ELSATIA_STRIPE_TRIAL_SYNCHRONIZATION_V1).
//
// Décision produit : Stripe reprend UNIQUEMENT le temps restant de l'essai
// local ELSATIA. Jamais de second essai, jamais un `trial_end` au-delà de la
// fenêtre autorisée par la base (`entreprises_essai_dates_coherentes` :
// `abonnement_essai_fin ∈ [essai_debut, essai_debut + 30]`).
//
// Horloge : tout est calculé en UTC. Les colonnes d'essai sont des `date`
// PostgreSQL (UTC côté Supabase) et l'accès applicatif considère l'essai ouvert
// jusqu'à `essai_fin T23:59:59.999Z` (`essaiEnCours`, acces-socle-essai.ts).
// La fin locale exprimée en seconde Unix est donc `essai_fin T23:59:59Z` : sa
// date UTC (`dateDepuisUnix`) retombe exactement sur `essai_fin`, ce qui la
// rend acceptable par la contrainte au retour du webhook. Le fuseau du serveur
// Node (TZ, heure d'été) n'intervient à aucun moment.
import { DUREE_ESSAI_JOURS } from "@/lib/acces-socle-essai";

const SECONDES_PAR_JOUR = 86_400;

/**
 * Stripe Checkout refuse un `subscription_data[trial_end]` à moins de 48 h de
 * la création de la session. En deçà, l'essai restant n'est pas exprimable
 * sans dépasser la fenêtre locale : aucun essai Stripe (facturation immédiate).
 */
export const DELAI_MINIMUM_TRIAL_END_CHECKOUT_SECONDES = 48 * 3_600;

export type EtatEssaiLocal = {
  essaiDebut: string | null | undefined;
  essaiFin: string | null | undefined;
};

export type RaisonSansEssai =
  | "essai_expire"
  | "restant_inferieur_minimum_stripe"
  | "dates_absentes"
  | "dates_incoherentes";

export type EssaiCheckout =
  | {
    mode: "trial_end";
    /** Seconde Unix envoyée à Stripe (`subscription_data[trial_end]`). */
    trialEnd: number;
    /** Fin locale retenue (date UTC, bornée à essai_debut + 30). */
    finLocale: string;
    restantSecondes: number;
  }
  | {
    mode: "aucun";
    raison: RaisonSansEssai;
    finLocale: string | null;
    restantSecondes: number;
  };

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Date calendaire `YYYY-MM-DD` stricte (refuse 2026-02-30, les heures, etc.). */
function lireDate(valeur: string | null | undefined): number | null {
  if (typeof valeur !== "string") return null;
  const texte = valeur.trim().slice(0, 10);
  if (!DATE_ISO.test(texte)) return null;
  const ms = Date.parse(`${texte}T00:00:00.000Z`);
  if (!Number.isFinite(ms)) return null;
  if (new Date(ms).toISOString().slice(0, 10) !== texte) return null;
  return ms / 1000;
}

function dateUtc(secondes: number) {
  return new Date(secondes * 1000).toISOString().slice(0, 10);
}

/**
 * local_trial_end = fin du jour UTC `min(essai_fin, essai_debut + 30)`.
 * `null` quand la fenêtre n'est pas calculable ou incohérente : dans ce cas
 * aucun essai Stripe n'est accordé (fail-closed, pas de second essai).
 */
export function finEssaiLocaleUnix(etat: EtatEssaiLocal): { finUnix: number; finLocale: string } | { erreur: "dates_absentes" | "dates_incoherentes" } {
  const debut = lireDate(etat.essaiDebut);
  const finBrute = etat.essaiFin == null ? null : lireDate(etat.essaiFin);
  if (debut === null) {
    return { erreur: etat.essaiDebut == null && etat.essaiFin == null ? "dates_absentes" : "dates_incoherentes" };
  }
  if (etat.essaiFin != null && finBrute === null) return { erreur: "dates_incoherentes" };
  const borne = debut + DUREE_ESSAI_JOURS * SECONDES_PAR_JOUR;
  const fin = finBrute ?? borne;
  if (fin < debut) return { erreur: "dates_incoherentes" };
  const finRetenue = Math.min(fin, borne);
  return { finUnix: finRetenue + SECONDES_PAR_JOUR - 1, finLocale: dateUtc(finRetenue) };
}

/**
 * remaining_trial_seconds = max(0, local_trial_end - now).
 * - restant ≥ 48 h → `trial_end` = local_trial_end (jamais une durée relative :
 *   une session complétée tard ne peut pas pousser la fin d'essai) ;
 * - sinon → aucun essai Stripe.
 */
export function calculerEssaiCheckout(etat: EtatEssaiLocal, maintenant: Date = new Date()): EssaiCheckout {
  const maintenantUnix = Math.floor(maintenant.getTime() / 1000);
  if (!Number.isFinite(maintenantUnix)) throw new Error("Horloge invalide");
  const fin = finEssaiLocaleUnix(etat);
  if ("erreur" in fin) return { mode: "aucun", raison: fin.erreur, finLocale: null, restantSecondes: 0 };
  const restantSecondes = Math.max(0, fin.finUnix - maintenantUnix);
  if (restantSecondes === 0) {
    return { mode: "aucun", raison: "essai_expire", finLocale: fin.finLocale, restantSecondes };
  }
  if (restantSecondes < DELAI_MINIMUM_TRIAL_END_CHECKOUT_SECONDES) {
    return { mode: "aucun", raison: "restant_inferieur_minimum_stripe", finLocale: fin.finLocale, restantSecondes };
  }
  return { mode: "trial_end", trialEnd: fin.finUnix, finLocale: fin.finLocale, restantSecondes };
}

/** Paramètres Checkout correspondants : jamais `trial_period_days`. */
export function parametresEssaiCheckout(essai: EssaiCheckout): Record<string, string> {
  return essai.mode === "trial_end" ? { "subscription_data[trial_end]": String(essai.trialEnd) } : {};
}

/** Suffixe de clé d'idempotence : une clé Stripe ne se réutilise qu'à paramètres identiques. */
export function suffixeIdempotenceEssai(essai: EssaiCheckout) {
  return essai.mode === "trial_end" ? `essai-${essai.trialEnd}` : "sans-essai";
}
