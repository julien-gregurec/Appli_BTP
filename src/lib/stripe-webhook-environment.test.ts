import { describe, expect, it } from "vitest";
import { categoriserErreurSupabase, empreinteEvenementStripe, identifiantUuidValide, resoudreModeStripeWebhook } from "./stripe-webhook-environment";

describe("configuration explicite du mode webhook Stripe", () => {
  it("autorise uniquement test et live", () => {
    expect(resoudreModeStripeWebhook({ NODE_ENV: "test", STRIPE_WEBHOOK_EXPECTED_MODE: "test" })).toEqual({ valide: true, mode: "test", livemode: false });
    expect(resoudreModeStripeWebhook({ NODE_ENV: "test", STRIPE_WEBHOOK_EXPECTED_MODE: "LIVE" })).toEqual({ valide: true, mode: "live", livemode: true });
  });

  it("reste fermé si la configuration est absente, vide ou invalide", () => {
    expect(resoudreModeStripeWebhook({ NODE_ENV: "test" })).toEqual({ valide: false, motif: "absente" });
    expect(resoudreModeStripeWebhook({ NODE_ENV: "test", STRIPE_WEBHOOK_EXPECTED_MODE: "  " })).toEqual({ valide: false, motif: "vide" });
    expect(resoudreModeStripeWebhook({ NODE_ENV: "test", STRIPE_WEBHOOK_EXPECTED_MODE: "preview" })).toEqual({ valide: false, motif: "invalide" });
  });
});

describe("diagnostic webhook sans donnée sensible", () => {
  it("produit une empreinte stable et non réversible à la place de l'identifiant Stripe", () => {
    const identifiant = "evt_secret_a_ne_pas_journaliser";
    const empreinte = empreinteEvenementStripe(identifiant);
    expect(empreinte).toHaveLength(16);
    expect(empreinte).not.toContain(identifiant);
    expect(empreinte).toBe(empreinteEvenementStripe(identifiant));
  });

  it("valide uniquement un UUID exploitable comme clé étrangère", () => {
    expect(identifiantUuidValide("11111111-1111-4111-8111-111111111111")).toBe(true);
    expect(identifiantUuidValide("entreprise-preview")).toBe(false);
  });

  it.each([
    ["23503", "violation_cle_etrangere"],
    ["42P01", "table_ou_migration_absente"],
    ["PGRST205", "table_ou_migration_absente"],
    ["08006", "connexion_supabase"],
    ["42501", "autorisation_supabase"],
    ["inconnu", "erreur_supabase"],
  ])("catégorise %s sans exposer le message SQL", (code, categorie) => {
    expect(categoriserErreurSupabase({ code, message: "détail sensible" })).toBe(categorie);
  });
});
