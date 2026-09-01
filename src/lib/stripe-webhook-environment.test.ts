import { describe, expect, it } from "vitest";
import { categoriserErreurSupabase, empreinteEvenementStripe, identifiantUuidValide, resoudreModeStripeWebhook } from "./stripe-webhook-environment";

describe("configuration explicite du mode webhook Stripe", () => {
  it("autorise uniquement test et live", () => {
    expect(resoudreModeStripeWebhook({ STRIPE_WEBHOOK_EXPECTED_MODE: "test" })).toEqual({ valide: true, mode: "test", livemode: false });
    expect(resoudreModeStripeWebhook({ STRIPE_WEBHOOK_EXPECTED_MODE: "LIVE" })).toEqual({ valide: true, mode: "live", livemode: true });
  });
  it("reste fermé si la configuration est absente, vide ou invalide", () => {
    expect(resoudreModeStripeWebhook({})).toEqual({ valide: false, motif: "absente" });
    expect(resoudreModeStripeWebhook({ STRIPE_WEBHOOK_EXPECTED_MODE: "  " })).toEqual({ valide: false, motif: "vide" });
    expect(resoudreModeStripeWebhook({ STRIPE_WEBHOOK_EXPECTED_MODE: "preview" })).toEqual({ valide: false, motif: "invalide" });
  });
});

describe("diagnostic webhook sans donnée sensible", () => {
  it("produit une empreinte stable et non réversible", () => {
    const id = "evt_confidentiel";
    expect(empreinteEvenementStripe(id)).toHaveLength(16);
    expect(empreinteEvenementStripe(id)).not.toContain(id);
  });
  it("valide les UUID", () => {
    expect(identifiantUuidValide("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(identifiantUuidValide("entreprise-preview")).toBe(false);
  });
  it("catégorise sans exposer le message", () => {
    expect(categoriserErreurSupabase({ code: "42P01", message: "privé" })).toBe("table_ou_migration_absente");
  });
});
