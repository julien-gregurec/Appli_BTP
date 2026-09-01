import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  getUser: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth-mode", () => ({ isEmailLoginDisabled: () => false }));
vi.mock("@/app/actions/auth", () => ({ modifierMotDePasseAction: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mocks.getUser,
      mfa: { getAuthenticatorAssuranceLevel: mocks.getAuthenticatorAssuranceLevel },
    },
  })),
}));

import NouveauMotDePassePage from "./page";

const params = Promise.resolve({});

describe("NouveauMotDePassePage — élévation MFA avant changement de mot de passe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("session recovery aal1 d'un compte MFA : redirige vers /login/mfa (next = /nouveau-mot-de-passe)", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u" } } });
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal2" },
      error: null,
    });

    await expect(NouveauMotDePassePage({ searchParams: params })).rejects.toThrow(
      "REDIRECT:/login/mfa?next=%2Fnouveau-mot-de-passe",
    );
  });

  it("session aal2 : affiche le formulaire, aucune redirection", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u" } } });
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null,
    });

    const jsx = await NouveauMotDePassePage({ searchParams: params });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(jsx).toBeTruthy();
  });

  it("compte sans MFA (aal1/aal1) : affiche le formulaire, aucune redirection", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "u" } } });
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" },
      error: null,
    });

    const jsx = await NouveauMotDePassePage({ searchParams: params });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(jsx).toBeTruthy();
  });

  it("aucune session (lien expiré/déjà utilisé) : affiche l'écran d'invalidité, aucune vérification MFA", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const jsx = await NouveauMotDePassePage({ searchParams: params });
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(mocks.getAuthenticatorAssuranceLevel).not.toHaveBeenCalled();
    expect(jsx).toBeTruthy();
  });
});
