import { afterEach, describe, expect, it, vi } from "vitest";
import { isEmailLoginDisabled } from "./auth-mode";

function environnement(overrides: Record<string, string | undefined> = {}) {
  vi.stubEnv("DISABLE_EMAIL_LOGIN", "true");
  vi.stubEnv("ELSATIA_LOCAL_DEMO", "true");
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("VERCEL_ENV", undefined);
  for (const [cle, valeur] of Object.entries(overrides)) vi.stubEnv(cle, valeur);
}

afterEach(() => vi.unstubAllEnvs());

describe("isEmailLoginDisabled", () => {
  it("autorise uniquement la démonstration locale explicitement configurée", () => {
    environnement();
    expect(isEmailLoginDisabled()).toBe(true);
  });

  it("refuse DISABLE_EMAIL_LOGIN seul", () => {
    environnement({ ELSATIA_LOCAL_DEMO: undefined });
    expect(isEmailLoginDisabled()).toBe(false);
  });

  it("refuse le mode prototype en production", () => {
    environnement({ NODE_ENV: "production" });
    expect(isEmailLoginDisabled()).toBe(false);
  });

  it("refuse le mode prototype dans une Preview Vercel", () => {
    environnement({ VERCEL: "1", VERCEL_ENV: "preview" });
    expect(isEmailLoginDisabled()).toBe(false);
  });

  it("refuse toute cible Supabase distante", () => {
    environnement({ NEXT_PUBLIC_SUPABASE_URL: "https://project-ref.supabase.co" });
    expect(isEmailLoginDisabled()).toBe(false);
  });
});
