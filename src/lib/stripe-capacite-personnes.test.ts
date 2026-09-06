import { afterEach, describe, expect, it, vi } from "vitest";

const deps = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: deps.createAdminClient }));
vi.mock("@/lib/stripe-discount-server", () => ({ acquerirVerrouRemise: vi.fn(), libererVerrouRemise: vi.fn() }));

const { modifierCapacitePersonnesStripe, synchroniserCapacitePersonnesDepuisStripe, TARIF_CAPACITE_PERSONNE_MENSUEL_HT } = await import("./stripe-capacite-personnes");

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

function abonnement(items: Array<{ id: string; quantity?: number; price: { id: string } }>) {
  return { id: "sub_test", customer: "cus_test", status: "active", metadata: { offre: "mini", periodicite: "mensuel" }, items: { data: items } };
}

describe("contrat Stripe TEST de capacité personnes", () => {
  it("fige les prix mensuels unitaires par forfait", () => {
    expect(TARIF_CAPACITE_PERSONNE_MENSUEL_HT).toEqual({ mini: 15, pro: 12, business: 9, entreprise: 9 });
  });

  it("transmet au RPC webhook la quantité de l'item allowlisté", async () => {
    vi.stubEnv("STRIPE_PRICE_COMPTE_SUP_MINI_MENSUEL", "price_capacity");
    const rpc = vi.fn(async () => ({ data: 5, error: null }));
    const admin = { rpc };
    const resultat = await synchroniserCapacitePersonnesDepuisStripe(admin as never, "entreprise", abonnement([
      { id: "si_autre", quantity: 1, price: { id: "price_ia" } },
      { id: "si_capacity", quantity: 5, price: { id: "price_capacity" } },
    ]), "evt_test");
    expect(resultat.quantite).toBe(5);
    expect(rpc).toHaveBeenCalledWith("plateforme_synchroniser_capacite_personnes_stripe_serveur", expect.objectContaining({
      p_stripe_item_id: "si_capacity", p_quantite: 5, p_subscription_status: "active",
    }));
  });

  it("échoue fermé sur deux items capacité", async () => {
    vi.stubEnv("STRIPE_PRICE_COMPTE_SUP_MINI_MENSUEL", "price_capacity");
    await expect(synchroniserCapacitePersonnesDepuisStripe({ rpc: vi.fn() } as never, "entreprise", abonnement([
      { id: "si_1", quantity: 1, price: { id: "price_capacity" } },
      { id: "si_2", quantity: 1, price: { id: "price_capacity" } },
    ]), "evt_test")).rejects.toThrow("dupliquées");
  });

  it("échoue fermé sur le Price d'un autre forfait", async () => {
    vi.stubEnv("STRIPE_PRICE_COMPTE_SUP_MINI_MENSUEL", "price_mini");
    vi.stubEnv("STRIPE_PRICE_COMPTE_SUP_PRO_MENSUEL", "price_pro");
    await expect(synchroniserCapacitePersonnesDepuisStripe({ rpc: vi.fn() } as never, "entreprise", abonnement([
      { id: "si_pro", quantity: 2, price: { id: "price_pro" } },
    ]), "evt_test")).rejects.toThrow("incohérent");
  });

  it("refuse toute mutation si la clé et le mode ne sont pas explicitement TEST", async () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_interdite");
    vi.stubEnv("STRIPE_WEBHOOK_EXPECTED_MODE", "live");
    await expect(modifierCapacitePersonnesStripe({ entrepriseId: "e", nouvelleQuantite: 1, acteurId: "u" }))
      .rejects.toThrow("limitée à Stripe TEST");
    expect(deps.createAdminClient).not.toHaveBeenCalled();
  });
});
