import {
  MODULES_COMMERCIAUX,
  FORFAITS_VENDABLES,
  type CodeForfaitVendable,
  type PeriodiciteAbonnement,
} from "@/lib/commercial/catalogue";
import type { Remise } from "@/lib/commercial/types";

/**
 * REPRÉSENTATION STRIPE du catalogue commercial (§16).
 *
 * Ce module ne fait AUCUN appel réseau : il décrit seulement comment chaque
 * élément commercial doit exister côté Stripe, et quel mécanisme Stripe porte
 * quel type de remise. Il sert de contrat au lot Stripe R4 et au garde-fou
 * `verify:stripe-prices`.
 *
 * Rien ici ne concerne Stripe Live, qui n'est ni lu ni modifié par ce lot.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Price IDs
// ─────────────────────────────────────────────────────────────────────────────

/** Forfaits — variables déjà en place (`stripe-abonnement.ts`). */
export function variablePrixForfait(forfait: CodeForfaitVendable, periodicite: PeriodiciteAbonnement): string {
  return `STRIPE_PRICE_${forfait.toUpperCase()}_${periodicite.toUpperCase()}`;
}

/** Capacité « personne active » supplémentaire — variables déjà en place. */
export function variablePrixPersonneSup(forfait: CodeForfaitVendable, periodicite: PeriodiciteAbonnement): string {
  return `STRIPE_PRICE_COMPTE_SUP_${forfait.toUpperCase()}_${periodicite.toUpperCase()}`;
}

/**
 * Modules — variables À CRÉER par le lot Stripe (aucun Price module n'existe
 * aujourd'hui). Un Price par module × forfait × périodicité, car le prix à la
 * carte dépend du forfait de départ (gradient Mini plein tarif / Pro réduit).
 */
export function variablePrixModule(
  moduleCle: string,
  forfait: CodeForfaitVendable,
  periodicite: PeriodiciteAbonnement,
): string {
  return `STRIPE_PRICE_MODULE_${moduleCle.toUpperCase()}_${forfait.toUpperCase()}_${periodicite.toUpperCase()}`;
}

export function variablePrixStockage(periodicite: PeriodiciteAbonnement): string {
  return `STRIPE_PRICE_BLOC_STOCKAGE_${periodicite.toUpperCase()}`;
}

/** Toutes les variables d'environnement Stripe attendues par le catalogue. */
export function variablesStripeAttendues(): {
  existantes: string[];
  aCreer: string[];
} {
  const existantes: string[] = [];
  const aCreer: string[] = [];
  for (const forfait of FORFAITS_VENDABLES) {
    for (const periodicite of ["mensuel", "annuel"] as const) {
      existantes.push(variablePrixForfait(forfait, periodicite));
      existantes.push(variablePrixPersonneSup(forfait, periodicite));
      for (const definition of MODULES_COMMERCIAUX) {
        if (!definition.vendableALaCarte) continue;
        if (definition.inclusDansForfaits.includes(forfait)) continue;
        if (typeof definition.prixCarteCentimes[forfait] !== "number") continue;
        aCreer.push(variablePrixModule(definition.cle, forfait, periodicite));
      }
    }
  }
  for (const periodicite of ["mensuel", "annuel"] as const) aCreer.push(variablePrixStockage(periodicite));
  return { existantes: [...new Set(existantes)].sort(), aCreer: [...new Set(aCreer)].sort() };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Mécanisme Stripe par type de remise
// ─────────────────────────────────────────────────────────────────────────────

export type MecanismeStripeRemise =
  | { mecanisme: "coupon"; duration: "once" | "repeating" | "forever"; durationInMonths?: number; champ: "percent_off" | "amount_off" }
  | { mecanisme: "price_dedie"; raison: string }
  | { mecanisme: "credit_commercial"; raison: string };

/**
 * Traduction d'une remise ELSATIA en mécanisme Stripe.
 *
 * Règle §16 : on ne crée JAMAIS un Price par remise en pourcentage — le coupon
 * `percent_off` existe, il est traçable et il est déjà câblé (saga
 * `plateforme_operations_remise`). Un Price dédié n'est justifié que pour un
 * PRIX NÉGOCIÉ, qui doit rester figé même si le tarif public bouge : un coupon
 * `amount_off` ne le tiendrait pas (l'écart devrait être recalculé à chaque
 * changement de grille, ce qui casserait précisément la promesse).
 */
export function mecanismeStripePour(
  remise: Remise,
  periodicite: PeriodiciteAbonnement,
): MecanismeStripeRemise {
  if (remise.type === "prix_negocie") {
    return {
      mecanisme: "price_dedie",
      raison:
        "Un prix négocié est figé : il doit être porté par un Price Stripe dédié "
        + "(metadata.elsatia_remise_id), jamais par un coupon dont le montant devrait être recalculé.",
    };
  }
  const champ = remise.type === "pourcentage" ? "percent_off" : "amount_off";
  switch (remise.duree.mode) {
    case "une_echeance":
      return { mecanisme: "coupon", duration: "once", champ };
    case "nb_echeances":
      if (periodicite === "annuel") {
        return {
          mecanisme: "credit_commercial",
          raison:
            "Stripe compte `duration_in_months` en MOIS : sur un abonnement annuel, N échéances "
            + "ne se traduisent pas fidèlement. Utiliser des dates explicites ou un crédit commercial.",
        };
      }
      return { mecanisme: "coupon", duration: "repeating", durationInMonths: remise.duree.nombre, champ };
    case "dates": {
      return {
        mecanisme: "credit_commercial",
        raison:
          "Stripe n'exprime pas une fenêtre de dates sur un coupon : la fin est portée par ELSATIA "
          + "(expiration explicite via la saga de retrait), pas par Stripe.",
      };
    }
    case "jusqu_a_revocation":
    case "permanente":
      return { mecanisme: "coupon", duration: "forever", champ };
  }
}

/**
 * Nom de coupon Stripe : plafonné à 40 caractères par l'API (rejet en erreur,
 * pas de troncature). Contrainte déjà rencontrée en recette (voir
 * `nomCouponRemise` dans `app/actions/plateforme.ts`).
 */
export const LONGUEUR_MAX_NOM_COUPON = 40;

export function metadonneesStripeRemise(remise: Remise): Record<string, string> {
  return {
    elsatia_remise_id: remise.id,
    elsatia_type: remise.type,
    elsatia_perimetre: remise.perimetre.cles?.length
      ? `${remise.perimetre.cible}:${remise.perimetre.cles.join(",")}`
      : remise.perimetre.cible,
    elsatia_duree: remise.duree.mode,
    elsatia_debut: remise.duree.debut,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Points d'attention du cycle de vie
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Une remise posée par `discounts[0][coupon]` s'applique AU PRORATA sur TOUTES
 * les lignes de la facture en billing_mode « flexible » (vérifié empiriquement,
 * REMISES-CLIENTS-V1). Une remise ELSATIA de périmètre restreint (un module,
 * le forfait seul…) n'est donc PAS représentable telle quelle par un coupon
 * d'abonnement : il faut un coupon posé sur la ligne (`discounts` au niveau de
 * l'item) ou un Price dédié.
 */
export const COUPON_ABONNEMENT_EST_GLOBAL = true;

export function couponAbonnementSuffit(remise: Remise): boolean {
  return remise.perimetre.cible === "abonnement";
}

export type PointAttentionStripe = {
  sujet: string;
  constat: string;
};

export const POINTS_ATTENTION_STRIPE: readonly PointAttentionStripe[] = [
  {
    sujet: "Prorata sur changement de formule",
    constat:
      "Un changement de forfait en cours de période produit des lignes de prorata. La remise en "
      + "pourcentage s'y applique aussi (coupon au niveau abonnement) ; un prix négocié porté par un "
      + "Price dédié suit le prorata de ce Price. Les deux comportements doivent être affichés avant confirmation.",
  },
  {
    sujet: "Renouvellement",
    constat:
      "Un coupon `forever` survit au renouvellement ; un coupon `repeating` s'éteint tout seul. "
      + "L'expiration doit être répercutée côté ELSATIA par le webhook (saga d'expiration existante).",
  },
  {
    sujet: "Annulation",
    constat:
      "L'annulation d'un abonnement n'annule pas la remise côté ELSATIA : elle doit passer à l'état "
      + "`revoquee` ou `expiree`, jamais rester `active` sur un abonnement mort.",
  },
  {
    sujet: "Lignes de facture",
    constat:
      "Chaque élément commercial (forfait, capacité, module, stockage, IA) doit être une LIGNE distincte, "
      + "pour que la facture reste lisible et que le périmètre d'une remise soit vérifiable.",
  },
  {
    sujet: "Taxes",
    constat:
      "Les montants du catalogue sont HT. `STRIPE_AUTOMATIC_TAX_ENABLED` gouverne la TVA côté Stripe : "
      + "le moteur ne calcule la TVA que pour l'aperçu, jamais pour la facture réelle.",
  },
  {
    sujet: "Facture déjà émise",
    constat:
      "Aucune remise, aucune révocation ne doit modifier une facture émise. Toute correction passe par un avoir.",
  },
];
