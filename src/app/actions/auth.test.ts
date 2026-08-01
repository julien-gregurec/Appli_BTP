import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  urlCanonique: "https://preview.example.invalid",
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  headers: vi.fn(),
  signUp: vi.fn(),
  resetPasswordForEmail: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/brand", () => ({ BRAND: { urlPublique: mocks.urlCanonique } }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signUp: mocks.signUp,
      resetPasswordForEmail: mocks.resetPasswordForEmail,
    },
  })),
}));

import { demanderReinitialisationAction, signupAction } from "./auth";

describe("actions Auth et URL canonique", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signUp.mockResolvedValue({ data: { user: { id: "user-test" }, session: null }, error: null });
    mocks.resetPasswordForEmail.mockResolvedValue({ error: null });
  });

  it("ignore l’origine de la requête lors d’une récupération", async () => {
    const formData = new FormData();
    formData.set("email", "recette@example.invalid");

    await expect(demanderReinitialisationAction(formData)).rejects.toThrow("REDIRECT:");

    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.resetPasswordForEmail).toHaveBeenCalledWith("recette@example.invalid", {
      redirectTo: `${mocks.urlCanonique}/auth/callback?next=%2Fnouveau-mot-de-passe`,
    });
  });

  it("utilise l’URL canonique pour la confirmation d’inscription", async () => {
    const formData = new FormData();
    formData.set("email", "recette@example.invalid");
    formData.set("password", "mot-de-passe-test");
    formData.set("nom", "Recette");
    formData.set("prenom", "Elsatia");
    formData.set("code_entreprise", "entreprise");

    await expect(signupAction(formData)).rejects.toThrow("REDIRECT:");

    expect(mocks.headers).not.toHaveBeenCalled();
    expect(mocks.signUp).toHaveBeenCalledWith(expect.objectContaining({
      options: expect.objectContaining({
        emailRedirectTo: `${mocks.urlCanonique}/auth/callback?next=%2Fonboarding%3Fcode%3DENTREPRISE`,
      }),
    }));
  });
});
