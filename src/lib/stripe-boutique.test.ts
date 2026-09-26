import { afterEach, describe, expect, it, vi } from "vitest";

const requeteStripe = vi.fn();
vi.mock("@/lib/stripe-abonnement", () => ({ requeteStripe }));

const { creerSessionCheckoutBoutique, stripeBoutiqueEstConfigure } = await import("./stripe-boutique");

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("garde-fou boutique", () => {
  it("refuse le Checkout avant tout appel Stripe lorsque la boutique est désactivée", async () => {
    vi.stubEnv("FEATURE_BOUTIQUE_ENABLED", "false");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://preview.example.invalid");
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_placeholder");

    await expect(creerSessionCheckoutBoutique({
      commandeId: "commande-test",
      entrepriseId: "entreprise-test",
      lignes: [{ nom: "Produit", quantite: 1, prixUnitaireCentimes: 1000 }],
    })).rejects.toThrow(/indisponible/);
    expect(requeteStripe).not.toHaveBeenCalled();
    expect(stripeBoutiqueEstConfigure(process.env)).toBe(false);
  });
});
