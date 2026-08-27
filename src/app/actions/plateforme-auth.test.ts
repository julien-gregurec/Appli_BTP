import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  urlCanonique: "https://preview.example.invalid",
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  rpc: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/plateforme", () => ({ estPlateformeAdmin: vi.fn(async () => true) }));
vi.mock("@/lib/brand", () => ({ BRAND: { urlPublique: mocks.urlCanonique } }));
vi.mock("@/lib/stripe-abonnement", () => ({
  appliquerCouponAbonnement: vi.fn(),
  couponActifDepuisAbonnement: vi.fn(),
  creerCouponRemise: vi.fn(),
  recupererAbonnementStripe: vi.fn(),
  retirerCouponAbonnement: vi.fn(),
  TYPES_REMISE: [],
  DUREES_REMISE: [],
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    rpc: mocks.rpc,
    auth: { resetPasswordForEmail: mocks.resetPasswordForEmail },
  })),
}));

import { reinitialiserMotDePassePlateformeAction } from "./plateforme";

describe("réinitialisation administrateur", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it("utilise l’URL canonique sans envoyer de véritable e-mail", async () => {
    const formData = new FormData();
    formData.set("email", "recette@example.invalid");
    formData.set("motif", "Test automatisé");

    await expect(reinitialiserMotDePassePlateformeAction("entreprise-test", formData)).rejects.toThrow("REDIRECT:");

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("recette@example.invalid", {
      redirectTo: `${mocks.urlCanonique}/auth/callback?next=%2Fnouveau-mot-de-passe`,
    });
  });
});
