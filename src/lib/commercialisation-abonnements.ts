import { resoudreUrlContactCommercial } from "./brand";
import { IDENTITE_VENDEUR } from "./identite-vendeur";

type Environnement = Record<string, string | undefined>;

export type ModeStripeCommercial = "test" | "live" | "absent";

/**
 * Mode Stripe de l'environnement, lu sur le PRÉFIXE public de la clé (jamais sa
 * valeur) et sur `STRIPE_WEBHOOK_EXPECTED_MODE`. Fail-closed : une clé de format
 * inconnu, ou un mode attendu « live », valent Live.
 */
export function modeStripeCommercial(env: Environnement = process.env): ModeStripeCommercial {
  const cle = env.STRIPE_SECRET_KEY?.trim() ?? "";
  const attendu = env.STRIPE_WEBHOOK_EXPECTED_MODE?.trim().toLowerCase();
  if (attendu === "live") return "live";
  if (!cle) return attendu === "test" ? "test" : "absent";
  return /^(sk|rk)_test_/.test(cle) ? "test" : "live";
}

/**
 * Champs d'identité du vendeur exigés sur une facture d'abonnement réelle (Live).
 * Source unique : `IDENTITE_VENDEUR` (Legal Consent). Aucune variable
 * `LIRIA_VENDEUR_*` : un champ `DECISION_REQUIRED` ferme le Live, rien n'est inventé.
 */
export const CHAMPS_VENDEUR_FACTURE_LIVE = ["exploitant", "nomCommercial", "forme", "siret", "rcs", "adresse"] as const;

export type PrerequisLive =
  | "ouverture_live_non_confirmee"
  | "regime_tva_non_confirme"
  | `identite_vendeur:${(typeof CHAMPS_VENDEUR_FACTURE_LIVE)[number]}`;

/**
 * Prérequis légaux d'une vente Live encore manquants (décisions propriétaire 2, 3
 * et 4 du plan de portage Stripe, train V9) :
 *   * ouverture Live explicite (`ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE=true`) ;
 *   * régime de TVA confirmé (`LEGAL_TVA_REGIME_CONFIRME=true`, distinct du texte
 *     affiché : ni `NEXT_PUBLIC_LEGAL_TVA` ni `STRIPE_AUTOMATIC_TAX_ENABLED` ne
 *     valent confirmation) ;
 *   * identité vendeur prouvée pour chaque champ de facture.
 */
export function prerequisLiveManquants(env: Environnement = process.env): PrerequisLive[] {
  const manquants: PrerequisLive[] = [];
  if (env.ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE !== "true") manquants.push("ouverture_live_non_confirmee");
  if (env.LEGAL_TVA_REGIME_CONFIRME !== "true") manquants.push("regime_tva_non_confirme");
  for (const champ of CHAMPS_VENDEUR_FACTURE_LIVE) {
    if (IDENTITE_VENDEUR[champ].statut !== "PROUVE" || !IDENTITE_VENDEUR[champ].valeur) manquants.push(`identite_vendeur:${champ}`);
  }
  return manquants;
}

/** Facturation commerciale finale autorisée : toujours en Test (sans valeur), en Live seulement prérequis confirmés. */
export function facturationFinaleAutorisee(env: Environnement = process.env) {
  return modeStripeCommercial(env) !== "live" || prerequisLiveManquants(env).length === 0;
}

/**
 * Verrou de commercialisation (verrou UNIQUE, P3 du portage Stripe, train V9).
 *
 * La souscription payante reste fermée par défaut et ne s'ouvre que sur
 * `ABONNEMENTS_PUBLICS_OUVERTS=true`. En Stripe Live, elle exige en plus les
 * prérequis légaux confirmés (`prerequisLiveManquants`). En Stripe Test, la
 * qualification reste possible sans ouvrir le Live. Aucune date d'ouverture.
 */
export function abonnementsPublicsOuverts(env: Environnement = process.env) {
  return env.ABONNEMENTS_PUBLICS_OUVERTS === "true" && facturationFinaleAutorisee(env);
}

export const MENTION_STRIPE_TEST = "Stripe Test : document sans valeur comptable ni fiscale.";

/**
 * Pied des factures d'abonnement (posé sur le client Stripe). Limité aux
 * informations PROUVÉES de `IDENTITE_VENDEUR` ; le numéro de TVA n'apparaît que
 * s'il est fourni ET le régime confirmé. Aucune mention de régime n'est déduite.
 */
export function piedDeFactureAbonnement(env: Environnement = process.env) {
  const i = IDENTITE_VENDEUR;
  const valeurs = [i.nomCommercial, i.exploitant, i.formeAbregee, i.adresse, i.rcs, i.siret]
    .filter((champ) => champ.statut === "PROUVE" && champ.valeur)
    .map((champ) => (champ === i.siret ? `SIRET ${champ.valeur}` : champ.valeur));
  const lignes = [valeurs.join(" · ")];
  const tva = env.NEXT_PUBLIC_LEGAL_TVA?.trim();
  if (tva && env.LEGAL_TVA_REGIME_CONFIRME === "true") lignes.push(`TVA intracommunautaire : ${tva}`);
  if (modeStripeCommercial(env) !== "live") lignes.unshift(MENTION_STRIPE_TEST);
  return lignes.join("\n");
}

export function destinationCtaOffreTarifaire({
  cleOffre,
  devisObligatoire,
  paiementConfigure,
  abonnementsOuverts,
}: {
  cleOffre: string;
  devisObligatoire?: boolean;
  paiementConfigure: boolean;
  abonnementsOuverts: boolean;
}) {
  if (devisObligatoire || !paiementConfigure || !abonnementsOuverts) {
    return resoudreUrlContactCommercial();
  }

  return `/signup?offre=${encodeURIComponent(cleOffre)}`;
}

export const MESSAGE_OUVERTURE_PROCHAINE =
  "Les abonnements en ligne ouvriront prochainement. Contactez ELSATIA pour préparer votre accès.";
