import { createPrivateKey, randomUUID, sign } from "node:crypto";
import type { ObservationRemiseStripe } from "@/lib/stripe-abonnement";
import type { OperationRemise } from "@/lib/stripe-discount-consistency";

export const ACTIONS_ATTESTATION_STRIPE = [
  "APPLY",
  "REMOVE",
  "EXPIRATION_SYNC",
  "COMPENSATION_APPLY",
  "COMPENSATION_REMOVE",
] as const;

export type ActionAttestationStripe = (typeof ACTIONS_ATTESTATION_STRIPE)[number];
export type EnvironnementAttestationStripe = "test" | "live";
export type VariablesAttestationStripe = Readonly<Record<string, string | undefined>>;

export type ObservationAttestationStripe = ObservationRemiseStripe & {
  stripe_subscription_id: string;
  stripe_customer_id: string;
};

export type PayloadAttestationStripe = {
  version: 2;
  key_id: string;
  environment: EnvironnementAttestationStripe;
  action: ActionAttestationStripe;
  operation_id: string;
  intention_id: string;
  entreprise_id: string;
  abonnement_entreprise_id: string | null;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  tentative: number;
  generation: number;
  discount_presence: "absent" | "present";
  discount_count: 0 | 1;
  discount_id: string | null;
  discount_source_type: "coupon" | "promotion_code" | null;
  discount_source_id: string | null;
  coupon_id: string | null;
  discount_type: string | null;
  discount_value: number | null;
  discount_duration: string | null;
  discount_duration_months: number | null;
  observed_at: string;
  expires_at: string;
  jti: string;
};

const CHAMPS_CANONIQUES: ReadonlyArray<keyof PayloadAttestationStripe> = [
  "key_id",
  "environment",
  "action",
  "operation_id",
  "intention_id",
  "entreprise_id",
  "abonnement_entreprise_id",
  "stripe_subscription_id",
  "stripe_customer_id",
  "tentative",
  "generation",
  "discount_presence",
  "discount_count",
  "discount_id",
  "discount_source_type",
  "discount_source_id",
  "coupon_id",
  "discount_type",
  "discount_value",
  "discount_duration",
  "discount_duration_months",
  "observed_at",
  "expires_at",
  "jti",
];

export function canonicaliserAttestationStripe(payload: PayloadAttestationStripe) {
  return [
    "elsatia.stripe-state-attestation.v2",
    ...CHAMPS_CANONIQUES.map((champ) => `${champ}=${payload[champ] === null ? "~" : String(payload[champ])}`),
  ].join("\n");
}

export function environnementAttestationStripe(environnement: VariablesAttestationStripe = process.env): EnvironnementAttestationStripe {
  const secretStripe = environnement.STRIPE_SECRET_KEY ?? "";
  if (secretStripe.startsWith("sk_test_")) return "test";
  if (secretStripe.startsWith("sk_live_")) return "live";
  throw new Error("Environnement Stripe impossible à attester");
}

function actionOperation(operation: OperationRemise): ActionAttestationStripe {
  if (operation.type_operation === "application") return "APPLY";
  return operation.etat_souhaite.mode === "expiration_stripe" ? "EXPIRATION_SYNC" : "REMOVE";
}

function validerObservationAttestationStripe(observation: ObservationAttestationStripe) {
  if (!/^sub_[A-Za-z0-9_]{1,120}$/.test(observation.stripe_subscription_id)
      || !/^cus_[A-Za-z0-9_]{1,120}$/.test(observation.stripe_customer_id)) {
    throw new Error("Identité Stripe impossible à attester");
  }
  if (observation.status === "absent") {
    if (observation.count !== 0 || observation.discount_id !== null
        || observation.source_type !== null || observation.source_id !== null
        || observation.coupon_id !== null) {
      throw new Error("Absence Stripe incohérente");
    }
    return;
  }
  if (observation.status !== "present" || observation.count !== 1
      || !/^di_[A-Za-z0-9_:-]{1,125}$/.test(observation.discount_id)
      || !/^[A-Za-z0-9_:-]{1,128}$/.test(observation.coupon_id)
      || !/^[A-Za-z0-9_:-]{1,128}$/.test(observation.source_id)
      || !["coupon", "promotion_code"].includes(observation.source_type)
      || (observation.source_type === "coupon" && observation.source_id !== observation.coupon_id)
      || (observation.source_type === "promotion_code" && !/^promo_[A-Za-z0-9_:-]{1,122}$/.test(observation.source_id))) {
    throw new Error("Présence Stripe incohérente");
  }
}

export function construirePayloadAttestationStripe(params: {
  operation: OperationRemise;
  observation: ObservationAttestationStripe;
  environment: EnvironnementAttestationStripe;
  keyId: string;
  observedAt?: Date;
  jti?: string;
}): PayloadAttestationStripe {
  validerObservationAttestationStripe(params.observation);
  const observedAt = params.observedAt ?? new Date();
  const expiresAt = new Date(observedAt.getTime() + 60_000);
  const application = params.operation.type_operation === "application";
  return {
    version: 2,
    key_id: params.keyId,
    environment: params.environment,
    action: actionOperation(params.operation),
    operation_id: params.operation.id,
    intention_id: params.operation.intention_id,
    entreprise_id: params.operation.entreprise_id,
    abonnement_entreprise_id: params.operation.abonnement_entreprise_id,
    stripe_subscription_id: params.observation.stripe_subscription_id,
    stripe_customer_id: params.observation.stripe_customer_id,
    tentative: params.operation.nombre_tentatives,
    generation: params.operation.numero_posts_application ?? 0,
    discount_presence: params.observation.status,
    discount_count: params.observation.count,
    discount_id: params.observation.discount_id,
    discount_source_type: params.observation.source_type,
    discount_source_id: params.observation.source_id,
    coupon_id: params.observation.coupon_id,
    discount_type: application ? params.operation.etat_souhaite.type ?? null : null,
    discount_value: application ? params.operation.etat_souhaite.valeur ?? null : null,
    discount_duration: application ? params.operation.etat_souhaite.duree ?? null : null,
    discount_duration_months: application ? params.operation.etat_souhaite.duree_mois ?? null : null,
    observed_at: observedAt.toISOString(),
    expires_at: expiresAt.toISOString(),
    jti: params.jti ?? randomUUID(),
  };
}

export function signerAttestationStripe(
  payload: PayloadAttestationStripe,
  environnement: VariablesAttestationStripe = process.env,
) {
  const clePrivee = environnement.STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64;
  if (!clePrivee) throw new Error("Clé privée d’attestation Stripe absente");
  const key = createPrivateKey({ key: Buffer.from(clePrivee, "base64"), format: "der", type: "pkcs8" });
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Clé d’attestation Stripe invalide");
  return sign(null, Buffer.from(canonicaliserAttestationStripe(payload), "utf8"), key).toString("base64");
}

export function creerAttestationStripe(params: {
  operation: OperationRemise;
  observation: ObservationAttestationStripe;
  environnement?: VariablesAttestationStripe;
  observedAt?: Date;
  jti?: string;
}) {
  const environnement = params.environnement ?? process.env;
  const keyId = environnement.STRIPE_STATE_ATTESTATION_KEY_ID;
  if (!keyId || !/^[a-z0-9_.:-]{1,64}$/.test(keyId)) throw new Error("Identifiant de clé d’attestation Stripe absent");
  const payload = construirePayloadAttestationStripe({
    operation: params.operation,
    observation: params.observation,
    environment: environnementAttestationStripe(environnement),
    keyId,
    observedAt: params.observedAt,
    jti: params.jti,
  });
  return { payload, signature: signerAttestationStripe(payload, environnement) };
}
