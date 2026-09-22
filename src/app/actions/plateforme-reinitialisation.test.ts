import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const URL_CANONIQUE = "https://app.exemple-liria.invalid";

const mocks = vi.hoisted(() => ({
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
vi.mock("@/lib/stripe-abonnement", () => ({
  appliquerCouponAbonnement: vi.fn(),
  creerCouponRemise: vi.fn(),
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

describe("reinitialiserMotDePassePlateformeAction — URL canonique plutôt qu'un en-tête client", () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = URL_CANONIQUE;
    mocks.rpc.mockResolvedValue({ error: null });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it("construit le lien de réinitialisation à partir de l'URL canonique, sans dépendre d'un en-tête client", async () => {
    const formData = new FormData();
    formData.set("email", "recette@example.invalid");
    formData.set("motif", "Test automatisé");

    await expect(reinitialiserMotDePassePlateformeAction("entreprise-test", formData)).rejects.toThrow("REDIRECT:");

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("recette@example.invalid", {
      redirectTo: `${URL_CANONIQUE}/auth/callback?next=%2Fnouveau-mot-de-passe`,
    });
  });

  it("échoue proprement si l'URL canonique n'est pas configurée, sans jamais appeler le RPC de journalisation ni envoyer d'e-mail", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const formData = new FormData();
    formData.set("email", "recette@example.invalid");
    formData.set("motif", "Test automatisé");

    await expect(reinitialiserMotDePassePlateformeAction("entreprise-test", formData)).rejects.toThrow("REDIRECT:/plateforme?error=");

    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.resetPasswordForEmail).not.toHaveBeenCalled();
  });
});
