import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const racine = resolve(import.meta.dirname, "../..");
const panneau = readFileSync(resolve(racine, "components/MfaSecurityPanel.tsx"), "utf8");
const challenge = readFileSync(resolve(racine, "components/MfaChallengeForm.tsx"), "utf8");
const route = readFileSync(resolve(racine, "app/api/auth/mfa/unenroll/route.ts"), "utf8");
const proxy = readFileSync(resolve(racine, "lib/supabase/proxy.ts"), "utf8");
const gardeServeur = readFileSync(resolve(racine, "lib/auth/mfa-server.ts"), "utf8");

describe("implémentation MFA officielle", () => {
  it("utilise enroll, challenge, verify et listFactors", () => {
    expect(panneau).toContain("auth.mfa.enroll");
    expect(panneau).toContain("auth.mfa.challenge");
    expect(panneau).toContain("auth.mfa.verify");
    expect(panneau).toContain("auth.mfa.listFactors");
  });
  it("utilise getAuthenticatorAssuranceLevel pour la garde", () => {
    expect(proxy).toContain("auth.mfa.getAuthenticatorAssuranceLevel");
    expect(gardeServeur).toContain("auth.mfa.getAuthenticatorAssuranceLevel");
    expect(gardeServeur).toContain("notFound()");
  });
  it("médiatise unenroll côté serveur", () => {
    expect(route).toContain("auth.mfa.unenroll");
    expect(route).toContain("plateforme_role_courant");
  });
  it("ne journalise ni code ni secret dans les composants MFA", () => {
    expect(`${panneau}\n${challenge}`).not.toMatch(/console\.(?:log|info|warn|error)/);
    expect(`${panneau}\n${challenge}`).not.toMatch(/localStorage|sessionStorage/);
  });
  it("efface les codes à usage unique", () => {
    expect(panneau).toContain('[facteurId]: ""');
    expect(challenge).toContain('setCode("")');
  });
});
