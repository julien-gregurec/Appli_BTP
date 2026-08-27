import type { DureeRemise, StripeSubscription, TypeRemise } from "@/lib/stripe-abonnement";

export type StatutOperationRemise =
  | "pending" | "stripe_in_progress" | "stripe_applied" | "stripe_removed"
  | "database_finalization_pending" | "completed" | "reconciliation_required"
  | "failed_before_stripe" | "cancelled";

export type EtatSouhaiteRemise = {
  active: boolean;
  mode?: "expiration_stripe";
  description?: string;
  motif_interne?: string;
  duree_mois?: number | null;
  type?: TypeRemise;
  valeur?: number;
  duree?: DureeRemise;
  nom_coupon?: string;
};

export type OperationRemise = {
  id: string;
  entreprise_id: string;
  stripe_subscription_id: string;
  type_operation: "application" | "retrait";
  etat_souhaite: EtatSouhaiteRemise;
  statut: StatutOperationRemise;
  coupon_stripe_id: string | null;
  cle_idempotence_coupon: string | null;
  cle_idempotence_application: string | null;
  numero_posts_application?: number;
  nombre_tentatives: number;
};

export type EtatStripeRemise = { coupon_id: string | null };

export type StockageSagaRemise = {
  transition: (operationId: string, statut: StatutOperationRemise, etat: EtatStripeRemise | null, couponId?: string | null, erreur?: string | null) => Promise<OperationRemise>;
  enregistrerCoupon: (operationId: string, couponId: string) => Promise<OperationRemise>;
  preparerApplication: (operationId: string, etat: EtatStripeRemise) => Promise<OperationRemise>;
  finaliser: (operation: OperationRemise, etat: EtatStripeRemise) => Promise<OperationRemise>;
};

export type PasserelleStripeRemise = {
  lire: (subscriptionId: string) => Promise<StripeSubscription>;
  couponActif: (abonnement: StripeSubscription) => string | null;
  creerCoupon: (souhait: EtatSouhaiteRemise, cleIdempotence: string) => Promise<{ id: string }>;
  appliquerCoupon: (subscriptionId: string, couponId: string, cleIdempotence: string) => Promise<unknown>;
  retirerCoupon: (subscriptionId: string) => Promise<unknown>;
};

export class OperationRemiseAReconcilier extends Error {
  constructor(cause?: unknown) {
    super("L’opération de remise doit être vérifiée et finalisée.", { cause });
    this.name = "OperationRemiseAReconcilier";
  }
}

function etatStripe(abonnement: StripeSubscription, stripe: PasserelleStripeRemise): EtatStripeRemise {
  return { coupon_id: stripe.couponActif(abonnement) };
}

function empreinteErreur(etape: string) {
  return `remise.${etape}`;
}

/**
 * Reprend une intention persistée. Stripe est toujours relu avant une mutation :
 * un timeout ou un redémarrage ne peut donc pas provoquer un DELETE aveugle, ni
 * répéter l'effet d'un POST déjà matérialisé.
 */
export async function reconcilierOperationRemise(
  operationInitiale: OperationRemise,
  stockage: StockageSagaRemise,
  stripe: PasserelleStripeRemise,
): Promise<OperationRemise> {
  let operation = operationInitiale;
  if (operation.statut === "completed") return operation;
  let etape = "lecture_stripe";
  let executionAcquise = false;
  try {
    let observe = etatStripe(await stripe.lire(operation.stripe_subscription_id), stripe);

    // Une expiration naturelle ne doit jamais retirer une remise apparue entre
    // le webhook et la relecture Stripe. Une intention encore pending est alors
    // annulée ; un checkpoint plus avancé est laissé à la reprise sans mutation.
    if (operation.type_operation === "retrait"
        && operation.etat_souhaite.mode === "expiration_stripe"
        && observe.coupon_id !== null) {
      if (operation.statut === "pending") {
        return await stockage.transition(operation.id, "cancelled", observe);
      }
      throw new Error("Expiration Stripe non confirmée");
    }

    if (operation.statut === "stripe_in_progress") {
      operation = await stockage.transition(operation.id, "reconciliation_required", observe, operation.coupon_stripe_id);
    }
    if (["pending", "reconciliation_required", "database_finalization_pending"].includes(operation.statut)) {
      operation = await stockage.transition(operation.id, "stripe_in_progress", observe);
      executionAcquise = true;
    }

    if (operation.type_operation === "application") {
      let couponId = operation.coupon_stripe_id;
      if (!couponId) {
        etape = "creation_coupon";
        if (!operation.cle_idempotence_coupon) throw new Error("Clé coupon absente");
        const coupon = await stripe.creerCoupon(operation.etat_souhaite, operation.cle_idempotence_coupon);
        couponId = coupon.id;
        operation = await stockage.enregistrerCoupon(operation.id, couponId);
      }
      if (observe.coupon_id !== couponId) {
        if (!executionAcquise) {
          operation = await stockage.transition(operation.id, "reconciliation_required", observe, couponId);
          operation = await stockage.transition(operation.id, "stripe_in_progress", observe, couponId);
          executionAcquise = true;
        }
        etape = "application_stripe";
        operation = await stockage.preparerApplication(operation.id, observe);
        if (!operation.cle_idempotence_application) throw new Error("Clé application absente");
        await stripe.appliquerCoupon(operation.stripe_subscription_id, couponId, operation.cle_idempotence_application);
        etape = "verification_application";
        observe = etatStripe(await stripe.lire(operation.stripe_subscription_id), stripe);
      }
      if (observe.coupon_id !== couponId) throw new Error("État Stripe non confirmé");
      if (operation.statut === "stripe_in_progress") {
        operation = await stockage.transition(operation.id, "stripe_applied", observe, couponId);
      }
    } else {
      if (observe.coupon_id !== null) {
        if (!executionAcquise) {
          operation = await stockage.transition(operation.id, "reconciliation_required", observe);
          operation = await stockage.transition(operation.id, "stripe_in_progress", observe);
          executionAcquise = true;
        }
        etape = "retrait_stripe";
        await stripe.retirerCoupon(operation.stripe_subscription_id);
        etape = "verification_retrait";
        observe = etatStripe(await stripe.lire(operation.stripe_subscription_id), stripe);
      }
      if (observe.coupon_id !== null) throw new Error("Retrait Stripe non confirmé");
      if (operation.statut === "stripe_in_progress") {
        operation = await stockage.transition(operation.id, "stripe_removed", observe);
      }
    }

    etape = "finalisation_sql";
    return await stockage.finaliser(operation, observe);
  } catch (erreurInitiale) {
    try {
      if (executionAcquise && !["completed", "failed_before_stripe", "cancelled", "reconciliation_required"].includes(operation.statut)) {
        await stockage.transition(operation.id, "reconciliation_required", null, operation.coupon_stripe_id, empreinteErreur(etape));
      }
    } catch {
      // L'intention existe déjà en base. Une indisponibilité SQL totale empêche le
      // checkpoint, mais la prochaine reprise relira Stripe avant toute mutation.
    }
    throw new OperationRemiseAReconcilier(erreurInitiale);
  }
}
