import { createPublicKey, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { OperationRemise } from "./stripe-discount-consistency";
import {
  ACTIONS_ATTESTATION_STRIPE,
  canonicaliserAttestationStripe,
  construirePayloadAttestationStripe,
  creerAttestationStripe,
  environnementAttestationStripe,
  signerAttestationStripe,
  type PayloadAttestationStripe,
  type VariablesAttestationStripe,
} from "./stripe-state-attestation";

// Paire Ed25519 exclusivement réservée aux tests ; aucune clé déployée.
const CLE_PRIVEE_TEST_B64 = "MC4CAQAwBQYDK2VwBCIEIBREYG+YWvbZZDoV/UNDGaB8WQTMiUy27PQ4rQEicZlo";
const CLE_PUBLIQUE_TEST_HEX = "3632f3c67fde5945a2cf79ecfd6bf632723581544400556ebc5f860d541bc209";

function operation(type: "application" | "retrait" = "application"): OperationRemise {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    intention_id: "10000000-0000-4000-8000-000000000002",
    entreprise_id: "10000000-0000-4000-8000-000000000003",
    abonnement_entreprise_id: "10000000-0000-4000-8000-000000000004",
    stripe_subscription_id: "sub_test_attestation",
    type_operation: type,
    etat_souhaite: type === "application"
      ? { active: true, type: "pourcentage", valeur: 73, duree: "once", description: "Test", motif_interne: "Test" }
      : { active: false },
    statut: type === "application" ? "stripe_applied" : "stripe_removed",
    coupon_stripe_id: type === "application" ? "coupon_test_73" : null,
    cle_idempotence_coupon: null,
    cle_idempotence_application: null,
    numero_posts_application: type === "application" ? 2 : 0,
    nombre_tentatives: 3,
  };
}

function environnement(overrides: VariablesAttestationStripe = {}): VariablesAttestationStripe {
  return {
    STRIPE_SECRET_KEY: "sk_test_attestation",
    STRIPE_STATE_ATTESTATION_KEY_ID: "test-r72-v1",
    STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64: CLE_PRIVEE_TEST_B64,
    ...overrides,
  };
}

const observationPresente = {
  status: "present" as const,
  count: 1 as const,
  discount_id: "di_test_73",
  source_type: "coupon" as const,
  source_id: "coupon_test_73",
  coupon_id: "coupon_test_73",
};

const observationAbsente = {
  status: "absent" as const,
  count: 0 as const,
  discount_id: null,
  source_type: null,
  source_id: null,
  coupon_id: null,
};

function payload() {
  return construirePayloadAttestationStripe({
    operation: operation(),
    observation: {
      stripe_subscription_id: "sub_test_attestation",
      stripe_customer_id: "cus_test_attestation",
      ...observationPresente,
    },
    environment: "test",
    keyId: "test-r72-v1",
    observedAt: new Date("2026-08-28T10:00:00.000Z"),
    jti: "10000000-0000-4000-8000-000000000005",
  });
}

function verifier(payloadSigne: PayloadAttestationStripe, signature: string) {
  const spki = Buffer.concat([
    Buffer.from("302a300506032b6570032100", "hex"),
    Buffer.from(CLE_PUBLIQUE_TEST_HEX, "hex"),
  ]);
  const key = createPublicKey({ key: spki, format: "der", type: "spki" });
  return verify(null, Buffer.from(canonicaliserAttestationStripe(payloadSigne)), key, Buffer.from(signature, "base64"));
}

describe("attestation asymétrique de l'état Stripe", () => {
  it("canonicalise dans un ordre fixe indépendant de l'ordre JSON", () => {
    const original = payload();
    const reordonne = Object.fromEntries(Object.entries(original).reverse()) as PayloadAttestationStripe;
    expect(canonicaliserAttestationStripe(reordonne)).toBe(canonicaliserAttestationStripe(original));
  });

  it("signe Ed25519 et la clé publique vérifie sans pouvoir signer", () => {
    const original = payload();
    const signature = signerAttestationStripe(original, environnement());
    expect(verifier(original, signature)).toBe(true);
  });

  it.each([
    ["coupon_id", "coupon_forge"],
    ["discount_id", "di_forge"],
    ["discount_presence", "absent"],
    ["discount_count", 0],
    ["discount_source_type", "promotion_code"],
    ["discount_source_id", "promo_forge"],
    ["discount_value", 74],
    ["discount_type", "montant"],
    ["stripe_subscription_id", "sub_autre"],
    ["operation_id", "20000000-0000-4000-8000-000000000001"],
    ["tentative", 4],
    ["environment", "live"],
    ["action", "REMOVE"],
  ] as const)("refuse la falsification de %s", (champ, valeur) => {
    const original = payload();
    const signature = signerAttestationStripe(original, environnement());
    expect(verifier({ ...original, [champ]: valeur }, signature)).toBe(false);
  });

  it("lie REMOVE et EXPIRATION_SYNC à des actions distinctes", () => {
    const retrait = construirePayloadAttestationStripe({
      operation: operation("retrait"),
      observation: { stripe_subscription_id: "sub_test_attestation", stripe_customer_id: "cus_test_attestation", ...observationAbsente },
      environment: "test", keyId: "test-r72-v1",
    });
    const expiration = construirePayloadAttestationStripe({
      operation: { ...operation("retrait"), etat_souhaite: { active: false, mode: "expiration_stripe" } },
      observation: { stripe_subscription_id: "sub_test_attestation", stripe_customer_id: "cus_test_attestation", ...observationAbsente },
      environment: "test", keyId: "test-r72-v1",
    });
    expect(retrait.action).toBe("REMOVE");
    expect(expiration.action).toBe("EXPIRATION_SYNC");
    expect(ACTIONS_ATTESTATION_STRIPE).toContain("COMPENSATION_APPLY");
    expect(ACTIONS_ATTESTATION_STRIPE).toContain("COMPENSATION_REMOVE");
  });

  it("borne l'attestation à 60 secondes et génère un jti unique", () => {
    const original = payload();
    expect(Date.parse(original.expires_at) - Date.parse(original.observed_at)).toBe(60_000);
    expect(original.jti).toBe("10000000-0000-4000-8000-000000000005");
  });

  it("dérive test/live de la clé Stripe et refuse un environnement ambigu", () => {
    expect(environnementAttestationStripe({ STRIPE_SECRET_KEY: "sk_test_x" })).toBe("test");
    expect(environnementAttestationStripe({ STRIPE_SECRET_KEY: "sk_live_x" })).toBe("live");
    expect(() => environnementAttestationStripe({ STRIPE_SECRET_KEY: "rk_test_x" })).toThrow();
  });

  it("échoue sans clé privée distincte du service_role", () => {
    expect(() => creerAttestationStripe({
      operation: operation(),
      observation: { stripe_subscription_id: "sub_test_attestation", stripe_customer_id: "cus_test_attestation", ...observationPresente },
      environnement: environnement({ STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64: undefined }),
    })).toThrow("Clé privée");
  });

  it("refuse de signer une absence portant encore une identité Discount", () => {
    expect(() => creerAttestationStripe({
      operation: operation("retrait"),
      observation: {
        stripe_subscription_id: "sub_test_attestation",
        stripe_customer_id: "cus_test_attestation",
        status: "absent", count: 0, discount_id: "di_still_active",
        source_type: null, source_id: null, coupon_id: null,
      } as never,
      environnement: environnement(),
    })).toThrow("Absence Stripe incohérente");
  });
});
