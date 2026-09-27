import { afterEach, describe, expect, it } from "vitest";
import { generateSigningKey } from "@elsatia/identity";
import { construireContentSecurityPolicy } from "@/lib/security/headers";
import { destinationIdentiteApresConnexion, identityIssuer, identityJwks, lifecycleEndpoints, studioAccessDecision } from "./config";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe("identité centrale — configuration GP", () => {
  it("retour après connexion : routes /identity/ seulement, jamais de redirection ouverte", () => {
    expect(destinationIdentiteApresConnexion("/identity/studio/handoff?nonce=abc")).toBe("/identity/studio/handoff?nonce=abc");
    expect(destinationIdentiteApresConnexion("/dashboard")).toBeNull();
    expect(destinationIdentiteApresConnexion("//evil.test/identity/")).toBeNull();
    expect(destinationIdentiteApresConnexion("https://evil.test/identity/x")).toBeNull();
    expect(destinationIdentiteApresConnexion("/%2F%2Fevil.test")).toBeNull();
    expect(destinationIdentiteApresConnexion(undefined)).toBeNull();
  });

  it("émetteur et JWKS depuis l'environnement ; JWKS public sans composante privée ; absence = erreur", () => {
    delete process.env.ELSATIA_IDENTITY_SIGNING_KEYS;
    process.env.ELSATIA_IDENTITY_ISSUER = "https://gp.elsatia.test/identity";
    expect(() => identityIssuer()).toThrow(/CONFIG_INVALID/);
    const key = generateSigningKey();
    process.env.ELSATIA_IDENTITY_SIGNING_KEYS = JSON.stringify({ current: key.privateJwk });
    expect(identityIssuer().issuer).toBe("https://gp.elsatia.test/identity");
    const jwks = identityJwks();
    expect(jwks.keys).toHaveLength(1);
    expect(JSON.stringify(jwks)).not.toContain('"d"');
  });

  it("points d'entrée https requis ; accès Studio fail-closed", () => {
    process.env.ELSATIA_STUDIO_LIFECYCLE_URL = "http://studio.elsatia.test/api/elsatia/lifecycle";
    expect(() => lifecycleEndpoints()).toThrow(/https/);
    delete process.env.STUDIO_ACCESS_MODE;
    expect(studioAccessDecision("a@b.test").granted).toBe(false);
    process.env.STUDIO_ACCESS_MODE = "open";
    expect(studioAccessDecision("a@b.test").granted).toBe(true);
  });

  it("CSP : form-action élargi à l'origine Studio uniquement quand demandé", () => {
    const base = construireContentSecurityPolicy({ nonce: "n", isDevelopment: false });
    expect(base).toContain("form-action 'self';");
    const handoff = construireContentSecurityPolicy({ nonce: "n", isDevelopment: false, formActionOrigins: ["https://studio.elsatia.test/auth/elsatia/exchange"] });
    expect(handoff).toContain("form-action 'self' https://studio.elsatia.test;");
    const refuse = construireContentSecurityPolicy({ nonce: "n", isDevelopment: false, formActionOrigins: ["http://studio.elsatia.test"] });
    expect(refuse).toContain("form-action 'self';");
  });
});
