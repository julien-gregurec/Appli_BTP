import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  signInWithPassword: vi.fn(),
  estPlateformeAdmin: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/lib/plateforme", () => ({ estPlateformeAdmin: mocks.estPlateformeAdmin }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      signInWithPassword: mocks.signInWithPassword,
    },
  })),
}));

import { loginAction } from "./auth";

describe("loginAction — routage post-connexion selon le statut admin plateforme", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signInWithPassword.mockResolvedValue({ error: null });
  });

  const formulaire = (email: string, password: string) => {
    const formData = new FormData();
    formData.set("email", email);
    formData.set("password", password);
    return formData;
  };

  it("redirige un admin plateforme directement vers /plateforme, jamais vers l'onboarding entreprise", async () => {
    mocks.estPlateformeAdmin.mockResolvedValue(true);
    await expect(loginAction(formulaire("admin@example.invalid", "motdepasse"))).rejects.toThrow(
      "REDIRECT:/plateforme",
    );
    expect(mocks.estPlateformeAdmin).toHaveBeenCalled();
  });

  it("redirige un utilisateur normal vers /dashboard (comportement inchangé)", async () => {
    mocks.estPlateformeAdmin.mockResolvedValue(false);
    await expect(loginAction(formulaire("employe@example.invalid", "motdepasse"))).rejects.toThrow(
      "REDIRECT:/dashboard",
    );
  });

  it("ne vérifie jamais le statut admin plateforme si les identifiants sont invalides", async () => {
    mocks.signInWithPassword.mockResolvedValueOnce({ error: { message: "Invalid login credentials" } });
    await expect(loginAction(formulaire("admin@example.invalid", "mauvais-mot-de-passe"))).rejects.toThrow(
      "REDIRECT:/login?error=",
    );
    expect(mocks.estPlateformeAdmin).not.toHaveBeenCalled();
  });
});
