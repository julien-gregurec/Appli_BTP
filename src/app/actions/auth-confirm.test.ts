import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
  verifyOtp: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      verifyOtp: mocks.verifyOtp,
    },
  })),
}));

import { confirmerCompteAction } from "./auth";

describe("confirmerCompteAction — vérification uniquement sur clic explicite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyOtp.mockResolvedValue({ error: null });
  });

  const formulaire = (tokenHash: string, type: string, next?: string) => {
    const formData = new FormData();
    formData.set("token_hash", tokenHash);
    formData.set("type", type);
    if (next) formData.set("next", next);
    return formData;
  };

  it("refuse sans appeler verifyOtp si token_hash ou type est absent", async () => {
    await expect(confirmerCompteAction(formulaire("", "signup"))).rejects.toThrow(
      "REDIRECT:/login?error=",
    );
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
  });

  it("vérifie le token puis redirige vers /onboarding pour une confirmation d'inscription", async () => {
    await expect(confirmerCompteAction(formulaire("token-test", "signup"))).rejects.toThrow(
      "REDIRECT:/onboarding",
    );
    expect(mocks.verifyOtp).toHaveBeenCalledWith({ type: "signup", token_hash: "token-test" });
  });

  it("redirige vers /nouveau-mot-de-passe pour une récupération", async () => {
    await expect(confirmerCompteAction(formulaire("token-test", "recovery"))).rejects.toThrow(
      "REDIRECT:/nouveau-mot-de-passe",
    );
  });

  it("respecte un next interne fourni", async () => {
    await expect(confirmerCompteAction(formulaire("token-test", "signup", "/onboarding?code=ABC"))).rejects.toThrow(
      "REDIRECT:/onboarding?code=ABC",
    );
  });

  it("ignore un next externe et retombe sur le repli sûr", async () => {
    await expect(confirmerCompteAction(formulaire("token-test", "signup", "https://evil.example"))).rejects.toThrow(
      "REDIRECT:/onboarding",
    );
  });

  it("redirige vers /login avec une erreur générique si verifyOtp échoue (token déjà consommé)", async () => {
    mocks.verifyOtp.mockResolvedValueOnce({ error: { message: "Token already used" } });
    await expect(confirmerCompteAction(formulaire("token-test", "signup"))).rejects.toThrow(
      "REDIRECT:/login?error=Lien%20de%20confirmation%20invalide%20ou%20expir%C3%A9.",
    );
  });
});
