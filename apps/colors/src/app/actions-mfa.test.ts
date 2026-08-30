import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((destination: string): never => {
    throw Object.assign(new Error(destination), { destination });
  }),
  createClient: vi.fn(),
  tentativeMfaAutorisee: vi.fn(),
  getUser: vi.fn(),
  listFactors: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  getAuthenticatorAssuranceLevel: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/rate-limit-mfa", () => ({ tentativeMfaAutorisee: mocks.tentativeMfaAutorisee }));

import { verifierMfaColorsAction } from "@/app/actions-mfa";

function formulaire(code: string, next = "/dashboard") {
  const donnees = new FormData();
  donnees.set("code", code);
  donnees.set("next", next);
  return donnees;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tentativeMfaAutorisee.mockResolvedValue(true);
  mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  mocks.listFactors.mockResolvedValue({ data: { totp: [{ id: "factor-1", status: "verified" }] }, error: null });
  mocks.challenge.mockResolvedValue({ data: { id: "challenge-1" }, error: null });
  mocks.verify.mockResolvedValue({ data: {}, error: null });
  mocks.getAuthenticatorAssuranceLevel.mockResolvedValue({ data: { currentLevel: "aal2" }, error: null });
  mocks.createClient.mockResolvedValue({
    auth: {
      getUser: mocks.getUser,
      mfa: {
        listFactors: mocks.listFactors,
        challenge: mocks.challenge,
        verify: mocks.verify,
        getAuthenticatorAssuranceLevel: mocks.getAuthenticatorAssuranceLevel,
      },
    },
  });
});

describe("verifierMfaColorsAction — challenge AAL2 Colors", () => {
  it("élève la session et redirige vers le dépôt demandé", async () => {
    await expect(verifierMfaColorsAction(formulaire("123456", "/inventaire"))).rejects.toMatchObject({
      destination: "/inventaire",
    });
    expect(mocks.verify).toHaveBeenCalledWith({ factorId: "factor-1", challengeId: "challenge-1", code: "123456" });
  });

  it("refuse un code incorrect ou expiré", async () => {
    mocks.verify.mockResolvedValue({ data: null, error: { message: "invalid" } });
    await expect(verifierMfaColorsAction(formulaire("000000"))).rejects.toMatchObject({
      destination: expect.stringContaining("/login/mfa?next=%2Fdashboard&error="),
    });
  });

  it("ne lance aucun challenge sans facteur vérifié", async () => {
    mocks.listFactors.mockResolvedValue({ data: { totp: [] }, error: null });
    await expect(verifierMfaColorsAction(formulaire("123456"))).rejects.toMatchObject({
      destination: expect.stringContaining("/login/mfa?"),
    });
    expect(mocks.challenge).not.toHaveBeenCalled();
  });

  it("neutralise une destination externe", async () => {
    await expect(verifierMfaColorsAction(formulaire("123456", "http://evil.example"))).rejects.toMatchObject({
      destination: "/dashboard",
    });
  });

  it("bloque au-delà de la limite anti-bruteforce", async () => {
    mocks.tentativeMfaAutorisee.mockResolvedValue(false);
    await expect(verifierMfaColorsAction(formulaire("123456"))).rejects.toMatchObject({
      destination: expect.stringContaining("/login/mfa?"),
    });
    expect(mocks.listFactors).not.toHaveBeenCalled();
  });

  it("rejette un code mal formé sans consulter le compteur", async () => {
    await expect(verifierMfaColorsAction(formulaire("abc"))).rejects.toMatchObject({
      destination: expect.stringContaining("/login/mfa?"),
    });
    expect(mocks.tentativeMfaAutorisee).not.toHaveBeenCalled();
  });

  it("renvoie vers /login sans session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(verifierMfaColorsAction(formulaire("123456"))).rejects.toMatchObject({ destination: "/login" });
  });
});

describe("actions-mfa Colors — non-journalisation", () => {
  const source = readFileSync(join(process.cwd(), "src/app/actions-mfa.ts"), "utf8");

  it("ne journalise rien et n’interpole jamais le code", () => {
    expect(source).not.toMatch(/console\.|Sentry/);
    expect(source).not.toMatch(/\$\{\s*code\s*\}/);
    expect(source).not.toMatch(/error\.message/);
  });
});
