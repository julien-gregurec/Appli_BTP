import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
  headers: vi.fn(async () => new Headers()),
  getUser: vi.fn(),
  listFactors: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
  adminRpc: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: mocks.getUser,
      mfa: {
        listFactors: mocks.listFactors,
        challenge: mocks.challenge,
        verify: mocks.verify,
        getAuthenticatorAssuranceLevel: mocks.getAuthenticatorAssuranceLevel,
      },
    },
  })),
}));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ rpc: mocks.adminRpc })),
}));

import { verifierMfaConnexionAction } from "./mfa";

function formulaire(code: string, next = "/dashboard") {
  const donnees = new FormData();
  donnees.set("code", code);
  donnees.set("next", next);
  return donnees;
}

describe("verifierMfaConnexionAction — challenge AAL2 après connexion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.adminRpc.mockResolvedValue({ data: { autorise: true, reessayer_apres: 0 }, error: null });
    mocks.listFactors.mockResolvedValue({ data: { totp: [{ id: "factor-1", status: "verified" }] }, error: null });
    mocks.challenge.mockResolvedValue({ data: { id: "challenge-1" }, error: null });
    mocks.verify.mockResolvedValue({ data: {}, error: null });
    mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal2" }, error: null });
  });

  it("élève la session et redirige vers la destination interne quand le code est correct", async () => {
    await expect(verifierMfaConnexionAction(formulaire("123456", "/plateforme"))).rejects.toThrow(
      "REDIRECT:/plateforme",
    );
    expect(mocks.verify).toHaveBeenCalledWith({ factorId: "factor-1", challengeId: "challenge-1", code: "123456" });
  });

  it("refuse un code incorrect ou expiré sans élever la session", async () => {
    mocks.verify.mockResolvedValue({ data: null, error: { message: "invalid code" } });
    await expect(verifierMfaConnexionAction(formulaire("000000"))).rejects.toThrow(
      "REDIRECT:/login/mfa?next=%2Fdashboard&error=",
    );
    expect(mocks.challenge).toHaveBeenCalled();
  });

  it("ne lance aucun challenge en l’absence de facteur vérifié", async () => {
    mocks.listFactors.mockResolvedValue({ data: { totp: [{ id: "factor-1", status: "unverified" }] }, error: null });
    await expect(verifierMfaConnexionAction(formulaire("123456"))).rejects.toThrow("REDIRECT:/login/mfa?");
    expect(mocks.challenge).not.toHaveBeenCalled();
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it("neutralise une destination externe même après un code valide", async () => {
    await expect(verifierMfaConnexionAction(formulaire("123456", "//evil.example"))).rejects.toThrow(
      "REDIRECT:/dashboard",
    );
  });

  it("bloque au-delà de la limite anti-bruteforce, avant tout appel Supabase MFA", async () => {
    mocks.adminRpc.mockResolvedValue({ data: { autorise: false, reessayer_apres: 42 }, error: null });
    await expect(verifierMfaConnexionAction(formulaire("123456"))).rejects.toThrow("REDIRECT:/login/mfa?");
    expect(mocks.listFactors).not.toHaveBeenCalled();
    expect(mocks.challenge).not.toHaveBeenCalled();
  });

  it("rejette un code mal formé sans consommer le budget anti-bruteforce", async () => {
    await expect(verifierMfaConnexionAction(formulaire("12ab"))).rejects.toThrow("REDIRECT:/login/mfa?");
    expect(mocks.adminRpc).not.toHaveBeenCalled();
    expect(mocks.listFactors).not.toHaveBeenCalled();
  });

  it("renvoie vers /login si la session a disparu", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(verifierMfaConnexionAction(formulaire("123456"))).rejects.toThrow("REDIRECT:/login");
  });
});

describe("verifierMfaConnexionAction — non-journalisation du code", () => {
  const source = readFileSync(join(process.cwd(), "src/app/actions/mfa.ts"), "utf8");

  it("ne journalise rien", () => {
    expect(source).not.toMatch(/console\./);
    expect(source).not.toMatch(/Sentry|captureException/);
  });

  it("n’interpole jamais le code dans une URL ou un message", () => {
    // Le code n'est jamais concaténé ni inséré dans un littéral gabarit : il
    // n'apparaît que comme propriété abrégée de l'objet passé à mfa.verify.
    expect(source).not.toMatch(/\$\{\s*code\s*\}/);
    expect(source).not.toMatch(/[`"']\s*\+\s*code\b|\bcode\s*\+\s*[`"']/);
    expect(source).toContain("Code incorrect ou expiré.");
  });
});
