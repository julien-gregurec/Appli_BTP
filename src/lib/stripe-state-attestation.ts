import { createPrivateKey, randomUUID, sign } from "node:crypto";
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

export type ObservationAttestationStripe = {
  stripe_subscription_id: string;
  stripe_customer_id: string;
  coupon_id: string | null;
};

export type PayloadAttestationStripe = {
  version: 1;
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
    "elsatia.stripe-state-attestation.v1",
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

export function construirePayloadAttestationStripe(params: {
  operation: OperationRemise;
  observation: ObservationAttestationStripe;
  environment: EnvironnementAttestationStripe;
  keyId: string;
  observedAt?: Date;
  jti?: string;
}): PayloadAttestationStripe {
  const observedAt = params.observedAt ?? new Date();
  const expiresAt = new Date(observedAt.getTime() + 60_000);
  const application = params.operation.type_operation === "application";
  return {
    version: 1,
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
