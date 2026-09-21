import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationRemise } from "./stripe-discount-consistency";
import { reconcilierOperationRemiseSousVerrou, synchroniserExpirationRemiseSousVerrou } from "./stripe-discount-server";
import { observerRemiseDepuisAbonnement, type StripeSubscription } from "./stripe-abonnement";

const CLE_PRIVEE_TEST_B64 = "MC4CAQAwBQYDK2VwBCIEIBREYG+YWvbZZDoV/UNDGaB8WQTMiUy27PQ4rQEicZlo";

function operationInitiale(): OperationRemise {
  return {
    id: "81000000-0000-4000-8000-000000000001",
    intention_id: "81000000-0000-4000-8000-000000000002",
    entreprise_id: "81000000-0000-4000-8000-000000000003",
    abonnement_entreprise_id: "81000000-0000-4000-8000-000000000004",
    stripe_subscription_id: "sub_r72_server",
    type_operation: "application",
    etat_souhaite: {
      active: true, type: "pourcentage", valeur: 20, duree: "once",
      description: "Serveur", motif_interne: "Test serveur",
    },
    statut: "pending",
    coupon_stripe_id: null,
    cle_idempotence_coupon: "coupon-key",
    cle_idempotence_application: null,
    numero_posts_application: 0,
    nombre_tentatives: 0,
  };
}

describe("frontière serveur d'attestation Stripe", () => {
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_r72_server";
    process.env.STRIPE_STATE_ATTESTATION_KEY_ID = "test-r72-v1";
    process.env.STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64 = CLE_PRIVEE_TEST_B64;
  });

  afterEach(() => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_STATE_ATTESTATION_KEY_ID;
    delete process.env.STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64;
  });

  it("relit Stripe puis appelle uniquement le finaliseur attesté", async () => {
    let operation = operationInitiale();
    let coupon: string | null = null;
    let lectures = 0;
    const rpc = vi.fn(async (fonction: string, args: Record<string, unknown>) => {
      if (fonction === "plateforme_transition_operation_remise_serveur") {
        const statut = String(args.p_nouveau_statut) as OperationRemise["statut"];
        operation = {
          ...operation,
          statut,
          nombre_tentatives: operation.nombre_tentatives + (statut === "stripe_in_progress" ? 1 : 0),
        };
        return { data: structuredClone(operation), error: null };
      }
      if (fonction === "plateforme_enregistrer_coupon_operation_remise_serveur") {
        operation = { ...operation, coupon_stripe_id: String(args.p_coupon_stripe_id) };
        return { data: structuredClone(operation), error: null };
      }
      if (fonction === "plateforme_preparer_post_application_remise_serveur") {
        operation = { ...operation, numero_posts_application: 1, cle_idempotence_application: "apply-key-1" };
        return { data: structuredClone(operation), error: null };
      }
      if (fonction === "plateforme_finaliser_operation_remise_attestee_serveur") {
        const payload = args.p_attestation as Record<string, unknown>;
        expect(payload).toMatchObject({
          action: "APPLY",
          operation_id: operation.id,
          stripe_subscription_id: "sub_r72_server",
          stripe_customer_id: "cus_r72_server",
          coupon_id: "coupon_r72_server",
          discount_presence: "present",
          discount_count: 1,
          discount_id: "di_r72_server",
          discount_source_type: "coupon",
          discount_source_id: "coupon_r72_server",
          tentative: 1,
          generation: 1,
        });
        expect(String(args.p_signature)).toMatch(/^[A-Za-z0-9+/]{86}==$/);
        operation = { ...operation, statut: "completed" };
        return { data: structuredClone(operation), error: null };
      }
      return { data: null, error: new Error(`RPC inattendue ${fonction}`) };
    });
    const admin = { rpc };
    const stripe = {
      async lire(): Promise<StripeSubscription> {
        lectures++;
        return {
          id: "sub_r72_server", customer: "cus_r72_server", status: "active",
          discounts: coupon ? [{ id: "di_r72_server", source: { type: "coupon", coupon: { id: coupon } } }] : [],
        };
      },
      observer: observerRemiseDepuisAbonnement,
      async creerCoupon() { return { id: "coupon_r72_server" }; },
      async appliquerCoupon() { coupon = "coupon_r72_server"; },
      async retirerCoupon() { coupon = null; },
    };

    const resultat = await reconcilierOperationRemiseSousVerrou(admin as never, operation, "82000000-0000-4000-8000-000000000001", stripe);

    expect(resultat.statut).toBe("completed");
    expect(lectures).toBe(3);
    const fonctions = rpc.mock.calls.map(([fonction]) => fonction);
    expect(fonctions).toContain("plateforme_finaliser_operation_remise_attestee_serveur");
    expect(fonctions).not.toContain("plateforme_enregistrer_preuve_stripe_serveur");
    expect(fonctions).not.toContain("plateforme_finaliser_operation_remise_serveur");
  });

  it("le chemin webhook/expiration refuse un discount non développé avant SQL", async () => {
    const rpc = vi.fn();
    const abonnement: StripeSubscription = {
      id: "sub_r72_server", customer: "cus_r72_server", status: "active",
      discounts: ["di_unexpanded_active"],
    };
    await expect(synchroniserExpirationRemiseSousVerrou(
      { rpc } as never,
      "81000000-0000-4000-8000-000000000003",
      abonnement,
      "82000000-0000-4000-8000-000000000001",
      { observer: observerRemiseDepuisAbonnement } as never,
    )).rejects.toThrow("incomplète");
    expect(rpc).not.toHaveBeenCalled();
  });
});
