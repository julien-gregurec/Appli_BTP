import { createAdminClient } from "@/lib/supabase/admin";
import {
  reconcilierOperationRemise,
  type EtatStripeRemise,
  type OperationRemise,
  type PasserelleStripeRemise,
  type StatutOperationRemise,
} from "@/lib/stripe-discount-consistency";

type Admin = ReturnType<typeof createAdminClient>;

export class VerrouRemiseOccupe extends Error {
  constructor() {
    super("Une synchronisation de remise est déjà en cours.");
    this.name = "VerrouRemiseOccupe";
  }
}

export async function acquerirVerrouRemise(admin: Admin, subscriptionId: string, proprietaire: string) {
  const { data, error } = await admin.rpc("plateforme_acquerir_verrou_remise_serveur", {
    p_stripe_subscription_id: subscriptionId,
    p_proprietaire: proprietaire,
  });
  if (error) throw new Error("Verrou de remise indisponible");
  if (!data) throw new VerrouRemiseOccupe();
  return String(data);
}

export async function libererVerrouRemise(admin: Admin, subscriptionId: string, verrouToken: string) {
  await admin.rpc("plateforme_relacher_verrou_remise_serveur", {
    p_stripe_subscription_id: subscriptionId,
    p_verrou_token: verrouToken,
  });
}

export async function lireOperationRemiseServeur(admin: Admin, operationId: string, verrouToken: string) {
  const { data, error } = await admin.rpc("plateforme_lire_operation_remise_serveur", {
    p_operation_id: operationId,
    p_verrou_token: verrouToken,
  });
  if (error || !data) throw new Error("Opération de remise indisponible");
  return data as unknown as OperationRemise;
}

export async function resoudreAbonnementOperationRemiseServeur(operationId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("plateforme_resoudre_abonnement_operation_remise_serveur", {
    p_operation_id: operationId,
  });
  if (error || !data) throw new Error("Opération de remise introuvable");
  return String(data);
}

export async function lireOperationActiveRemiseServeur(admin: Admin, subscriptionId: string, verrouToken: string) {
  const { data, error } = await admin.rpc("plateforme_lire_operation_active_remise_serveur", {
    p_stripe_subscription_id: subscriptionId,
    p_verrou_token: verrouToken,
  });
  if (error) throw new Error("Registre de remise indisponible");
  return data ? data as unknown as OperationRemise : null;
}

function stockageServeur(admin: Admin, verrouToken: string) {
  return {
    async transition(operationId: string, statut: StatutOperationRemise, _etat: EtatStripeRemise | null, _coupon?: string | null, erreur?: string | null) {
      const { data, error } = await admin.rpc("plateforme_transition_operation_remise_serveur", {
        p_operation_id: operationId,
        p_verrou_token: verrouToken,
        p_nouveau_statut: statut,
        p_empreinte_erreur: erreur ?? null,
      });
      if (error || !data) throw new Error("Transition serveur indisponible");
      return data as unknown as OperationRemise;
    },
    async preparerApplication(operationId: string) {
      const { data, error } = await admin.rpc("plateforme_preparer_post_application_remise_serveur", {
        p_operation_id: operationId,
        p_verrou_token: verrouToken,
      });
      if (error || !data) throw new Error("Préparation Stripe indisponible");
      return data as unknown as OperationRemise;
    },
    async enregistrerCoupon(operationId: string, couponId: string) {
      const { data, error } = await admin.rpc("plateforme_enregistrer_coupon_operation_remise_serveur", {
        p_operation_id: operationId,
        p_verrou_token: verrouToken,
        p_coupon_stripe_id: couponId,
      });
      if (error || !data) throw new Error("Checkpoint coupon indisponible");
      return data as unknown as OperationRemise;
    },
    async finaliser(operation: OperationRemise, etat: EtatStripeRemise) {
      const { data: checkpoint, error: erreurCheckpoint } = await admin.rpc("plateforme_enregistrer_preuve_stripe_serveur", {
        p_operation_id: operation.id,
        p_verrou_token: verrouToken,
        p_numero_tentative: operation.nombre_tentatives,
        p_etat_observe: etat,
      });
      const preuve = checkpoint && typeof checkpoint === "object" && "preuve_serveur_id" in checkpoint
        ? String((checkpoint as { preuve_serveur_id: unknown }).preuve_serveur_id)
        : "";
      if (erreurCheckpoint || !preuve) throw new Error("Preuve Stripe serveur indisponible");
      const { data, error } = await admin.rpc("plateforme_finaliser_operation_remise_serveur", {
        p_operation_id: operation.id,
        p_verrou_token: verrouToken,
        p_preuve_serveur_id: preuve,
      });
      if (error || !data) throw new Error("Finalisation serveur indisponible");
      return data as unknown as OperationRemise;
    },
  };
}

export async function reconcilierOperationRemiseSousVerrou(
  admin: Admin,
  operation: OperationRemise,
  verrouToken: string,
  stripe: PasserelleStripeRemise,
) {
  return reconcilierOperationRemise(operation, stockageServeur(admin, verrouToken), stripe);
}

export async function reconcilierOperationRemiseServeur(
  operationId: string,
  subscriptionId: string,
  proprietaire: string,
  stripe: PasserelleStripeRemise,
) {
  const admin = createAdminClient();
  const verrou = await acquerirVerrouRemise(admin, subscriptionId, proprietaire);
  try {
    const operation = await lireOperationRemiseServeur(admin, operationId, verrou);
    return await reconcilierOperationRemiseSousVerrou(admin, operation, verrou, stripe);
  } finally {
    await libererVerrouRemise(admin, subscriptionId, verrou);
  }
}
