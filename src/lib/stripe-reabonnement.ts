// ELSATIA — Stripe Resubscription Flow V1
// (docs/qualification/ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1.md)
//
// Module pur (sans I/O) : décide du parcours de reprise d'un abonnement à partir
// de l'état Stripe relu (autorité) et des écrans correspondants à partir de
// l'état local (affichage seulement, jamais une autorisation).
//
// Règles :
// - subscription encore réactivable chez Stripe → réactivation (Portail
//   Stripe : reprise d'une résiliation programmée, paiement d'une facture) ;
// - subscription terminée (`canceled`, `incomplete_expired`) → nouveau Checkout,
//   même client Stripe, SANS essai (l'essai ELSATIA est consommé) ;
// - jamais deux subscriptions vivantes (garde anti-double abonnement).

/** Statuts Stripe d'une subscription définitivement terminée (non réactivable). */
export const STATUTS_STRIPE_TERMINAUX: ReadonlySet<string> = new Set(["canceled", "incomplete_expired"]);

/** Statuts Stripe pour lesquels un paiement est attendu avant tout accès. */
export const STATUTS_STRIPE_PAIEMENT_REQUIS: ReadonlySet<string> = new Set(["past_due", "unpaid", "incomplete"]);

export type ParcoursAbonnement =
  /** Aucune subscription n'a jamais existé : premier Checkout (essai = reliquat local). */
  | "premier_abonnement"
  /** Subscription vivante, sans résiliation programmée : rien à reprendre. */
  | "actif"
  /** Résiliation programmée (`cancel_at_period_end` / `cancel_at`) : reprise via le Portail. */
  | "reprendre_portail"
  /** `past_due` / `unpaid` / `incomplete` : régler la facture ou changer de moyen de paiement. */
  | "paiement_requis"
  /** Subscription terminée : nouveau Checkout, même client, sans essai. */
  | "nouveau_checkout"
  /** État non gérable en libre-service (`paused`, statut inconnu) : support. */
  | "support";

export type SubscriptionObservee = {
  status: string;
  cancel_at_period_end?: boolean | null;
  cancel_at?: number | null;
};

export function parcoursDepuisSubscription(subscription: SubscriptionObservee | null | undefined): ParcoursAbonnement {
  if (!subscription) return "premier_abonnement";
  const statut = subscription.status;
  if (STATUTS_STRIPE_TERMINAUX.has(statut)) return "nouveau_checkout";
  if (STATUTS_STRIPE_PAIEMENT_REQUIS.has(statut)) return "paiement_requis";
  if (statut === "active" || statut === "trialing") {
    return subscription.cancel_at_period_end || subscription.cancel_at ? "reprendre_portail" : "actif";
  }
  return "support";
}

/** Parcours qui passent par le Portail Stripe plutôt que par une fonction dupliquée. */
export function parcoursViaPortail(parcours: ParcoursAbonnement) {
  return parcours === "reprendre_portail" || parcours === "paiement_requis";
}

/**
 * Vrai si la subscription interdit tout nouveau Checkout : elle existe encore
 * (facturable ou réactivable). Seul un statut terminal ouvre un réabonnement.
 */
export function subscriptionBloqueCheckout(subscription: SubscriptionObservee) {
  return !STATUTS_STRIPE_TERMINAUX.has(subscription.status);
}

// ─────────────────────────────────────────────────────────────────────────────
// Écrans et messages
// ─────────────────────────────────────────────────────────────────────────────

export const MESSAGES_REABONNEMENT = {
  abonnement_annule: {
    titre: "Abonnement annulé",
    description: "Votre abonnement est terminé. Vos données sont conservées. Pour retrouver l’accès, réactivez un abonnement : le paiement est demandé dès la souscription, sans nouvelle période d’essai.",
  },
  reactiver: {
    libelle: "Réactiver mon abonnement",
    description: "Choisissez une offre : votre compte de facturation existant est réutilisé et l’accès revient dès que Stripe confirme le paiement.",
  },
  reprendre: {
    titre: "Résiliation programmée",
    libelle: "Reprendre l’abonnement",
    description: "Votre abonnement reste actif jusqu’à sa date de fin. Vous pouvez annuler la résiliation depuis le portail de facturation, sans nouvelle souscription ni nouveau paiement.",
  },
  paiement_requis: {
    titre: "Paiement requis",
    description: "Le dernier paiement de votre abonnement n’a pas abouti. Réglez la facture ou mettez à jour votre moyen de paiement : l’accès revient dès que Stripe confirme le paiement.",
    libellePayer: "Payer la facture",
    libellePortail: "Mettre à jour le moyen de paiement",
  },
  echec: {
    titre: "Réabonnement non finalisé",
    description: "Le réabonnement n’a pas abouti et aucun accès n’a été rouvert. Si un paiement a été refusé, aucun montant n’a été encaissé. Réessayez ou contactez le support.",
  },
  en_attente: {
    titre: "Réabonnement en cours de confirmation",
    description: "Votre paiement a été transmis à Stripe. L’accès revient automatiquement dès que Stripe confirme le règlement, en général en quelques secondes.",
  },
  support: {
    titre: "Abonnement à vérifier",
    description: "Votre abonnement est dans un état qui ne peut pas être repris en ligne. Contactez le support : vos données sont conservées.",
  },
} as const;

/** Messages d'erreur des actions, selon le parcours imposé par l'état Stripe. */
export const MESSAGE_REFUS_CHECKOUT: Record<Exclude<ParcoursAbonnement, "premier_abonnement" | "nouveau_checkout">, string> = {
  actif: "Un abonnement est déjà actif pour votre entreprise : gérez-le depuis le portail de facturation.",
  reprendre_portail: "Votre abonnement est encore actif avec une résiliation programmée : utilisez « Reprendre l’abonnement » plutôt qu’une nouvelle souscription.",
  paiement_requis: "Un paiement est en attente sur votre abonnement : réglez la facture ou mettez à jour votre moyen de paiement plutôt que de souscrire à nouveau.",
  support: "Votre abonnement ne peut pas être repris en ligne. Contactez le support.",
};

export const MESSAGE_CLIENT_STRIPE_INVALIDE =
  "Le compte de facturation associé à votre entreprise n’est plus utilisable. Contactez le support : aucun nouveau compte n’est créé automatiquement.";

export type EtatAbonnementLocal = {
  abonnementStatut: string | null | undefined;
  stripeSubscriptionId: string | null | undefined;
  annulationPrevueAt: string | null | undefined;
  derniereFactureStatut: string | null | undefined;
  derniereFactureUrl: string | null | undefined;
};

export type EcranReabonnement =
  | { cle: "abonnement_annule" }
  | { cle: "reprendre"; finPrevueAt: string }
  | { cle: "paiement_requis"; urlFacture: string | null }
  | null;

/**
 * Écran à afficher d'après l'état LOCAL (projection des webhooks). Purement
 * indicatif : chaque action relit Stripe avant d'agir.
 */
export function ecranReabonnement(etat: EtatAbonnementLocal): EcranReabonnement {
  if (!etat.stripeSubscriptionId) return null;
  if (etat.abonnementStatut === "annule") return { cle: "abonnement_annule" };
  if (etat.abonnementStatut === "suspendu") {
    // Une suspension sans facture impayée connue (fermeture administrative,
    // hors moteur de facturation) garde l'écran générique : jamais « Paiement
    // requis » à tort.
    const impayee = Boolean(etat.derniereFactureStatut) && etat.derniereFactureStatut !== "paid";
    if (!impayee) return null;
    const url = etat.derniereFactureUrl?.startsWith("https://") ? etat.derniereFactureUrl : null;
    return { cle: "paiement_requis", urlFacture: url };
  }
  if ((etat.abonnementStatut === "actif" || etat.abonnementStatut === "essai") && etat.annulationPrevueAt) {
    return { cle: "reprendre", finPrevueAt: etat.annulationPrevueAt };
  }
  return null;
}

/**
 * Une offre peut être (re)choisie : jamais souscrit, ou abonnement terminé.
 * Une subscription vivante (même suspendue) se gère par le Portail.
 */
export function offresSouscriptibles(etat: Pick<EtatAbonnementLocal, "abonnementStatut" | "stripeSubscriptionId">) {
  return !etat.stripeSubscriptionId || etat.abonnementStatut === "annule";
}
