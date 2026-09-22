import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const URL_CANONIQUE = "https://app.exemple-liria.invalid";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/plateforme", () => ({ estPlateformeAdmin: vi.fn(async () => false) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signUp: mocks.signUp,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
    },
  })),
}));

import { demanderReinitialisationAction, signupAction } from "./auth";

describe("actions Auth — URL canonique plutôt que des en-têtes client (Host/Origin)", () => {
  const original = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = URL_CANONIQUE;
    mocks.signUp.mockResolvedValue({ data: { user: { id: "user-test" }, session: null }, error: null });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    if (original === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = original;
  });

  it("construit le lien de confirmation d'inscription à partir de l'URL canonique, jamais d'un en-tête client", async () => {
    const formData = new FormData();
    formData.set("email", "recette@example.invalid");
    formData.set("password", "mot-de-passe-test");
    formData.set("nom", "Recette");
    formData.set("prenom", "Elsatia");
    formData.set("code_entreprise", "entreprise");

    await expect(signupAction(formData)).rejects.toThrow("REDIRECT:");

    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        emailRedirectTo: `${URL_CANONIQUE}/auth/callback?next=%2Fonboarding%3Fcode%3DENTREPRISE`,
      }),
    }));
  });

  it("échoue proprement (redirection vers /signup avec un message) si l'URL canonique n'est pas configurée", async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    const formData = new FormData();
    formData.set("email", "recette@example.invalid");
    formData.set("password", "mot-de-passe-test");
    formData.set("nom", "Recette");
    formData.set("prenom", "Elsatia");

    await expect(signupAction(formData)).rejects.toThrow("REDIRECT:/signup?error=");
    expect(mocks.signUp).not.toHaveBeenCalled();
  });

  it("construit le lien de réinitialisation de mot de passe à partir de l'URL canonique", async () => {
    const formData = new FormData();
    formData.set("email", "recette@example.invalid");

    await expect(demanderReinitialisationAction(formData)).rejects.toThrow("REDIRECT:");

    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("recette@example.invalid", {
      redirectTo: `${URL_CANONIQUE}/auth/callback?next=%2Fnouveau-mot-de-passe`,
    });
  });
});
