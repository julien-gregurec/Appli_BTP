import { describe, expect, it } from "vitest";
import { buildConnectSrc, buildContentSecurityPolicy, buildSecurityHeaders, PERMISSIONS_POLICY, toHttpOrigin, toWebSocketOrigin } from "./security-headers";

const PROD = { supabaseUrl: "https://abcdefgh.supabase.co", billingApiUrl: "https://app.elsatia.fr/" };

function directive(policy: string, name: string) {
  return policy.split("; ").find((entry) => entry === name || entry.startsWith(`${name} `)) ?? null;
}

describe("politique de sécurité HTTP publique", () => {
  it("réduit une URL de configuration à son origine exacte", () => {
    expect(toHttpOrigin("https://abcdefgh.supabase.co/rest/v1?x=1")).toBe("https://abcdefgh.supabase.co");
    expect(toHttpOrigin("https://app.elsatia.fr/")).toBe("https://app.elsatia.fr");
    expect(toHttpOrigin("")).toBeNull();
    expect(toHttpOrigin(undefined)).toBeNull();
    expect(toHttpOrigin("pas-une-url")).toBeNull();
    expect(toHttpOrigin("javascript:alert(1)")).toBeNull();
    expect(toWebSocketOrigin("https://abcdefgh.supabase.co")).toBe("wss://abcdefgh.supabase.co");
  });

  it("n'autorise Supabase que sur l'origine exacte attendue, jamais un joker", () => {
    const sources = buildConnectSrc(PROD);
    expect(sources).toEqual(["'self'", "https://abcdefgh.supabase.co", "wss://abcdefgh.supabase.co", "https://app.elsatia.fr", "wss://app.elsatia.fr"]);
    expect(sources).not.toContain("*");
    expect(sources.some((source) => source.includes("*."))).toBe(false);
  });

  it("retombe sur la seule origine propre quand le cloud n'est pas configuré", () => {
    expect(buildConnectSrc()).toEqual(["'self'"]);
    expect(buildConnectSrc({ supabaseUrl: "  " })).toEqual(["'self'"]);
  });

  it("verrouille les directives structurantes de la CSP", () => {
    const policy = buildContentSecurityPolicy(PROD);
    expect(directive(policy, "default-src")).toBe("default-src 'self'");
    expect(directive(policy, "base-uri")).toBe("base-uri 'none'");
    expect(directive(policy, "object-src")).toBe("object-src 'none'");
    expect(directive(policy, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(policy, "frame-src")).toBe("frame-src 'none'");
    expect(directive(policy, "form-action")).toBe("form-action 'self'");
    expect(policy).toContain("upgrade-insecure-requests");
  });

  it("garde le service worker, le manifeste et les exports fonctionnels", () => {
    const policy = buildContentSecurityPolicy(PROD);
    expect(directive(policy, "worker-src")).toBe("worker-src 'self'");
    expect(directive(policy, "manifest-src")).toBe("manifest-src 'self'");
    // `blob:` est indispensable à la conversion PNG du plan coté.
    expect(directive(policy, "img-src")).toBe("img-src 'self' data: blob:");
    // La vue d'impression injecte une feuille de style en ligne.
    expect(directive(policy, "style-src")).toBe("style-src 'self' 'unsafe-inline'");
  });

  it("n'autorise aucun script d'origine tierce ni `eval` en production", () => {
    const policy = buildContentSecurityPolicy(PROD);
    expect(directive(policy, "script-src")).toBe("script-src 'self' 'unsafe-inline'");
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("http://");
  });

  it("n'ouvre `eval` et le websocket local qu'en développement", () => {
    const policy = buildContentSecurityPolicy({ ...PROD, isDevelopment: true });
    expect(directive(policy, "script-src")).toBe("script-src 'self' 'unsafe-inline' 'unsafe-eval'");
    expect(directive(policy, "connect-src")).toContain("ws://localhost:*");
    expect(policy).not.toContain("upgrade-insecure-requests");
  });

  it("expose la liste d'en-têtes attendue par le durcissement public", () => {
    const headers = buildSecurityHeaders(PROD);
    const byKey = Object.fromEntries(headers.map((header) => [header.key, header.value]));
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
    expect(byKey["Cross-Origin-Resource-Policy"]).toBe("same-site");
    expect(byKey["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
    // HSTS reste géré par la plateforme : ce lot ne l'élargit pas aux sous-domaines.
    expect(byKey["Strict-Transport-Security"]).toBeUndefined();
  });

  it("ferme les capteurs sans neutraliser le partage d'export mobile", () => {
    expect(PERMISSIONS_POLICY).toContain("camera=()");
    expect(PERMISSIONS_POLICY).toContain("geolocation=()");
    expect(PERMISSIONS_POLICY).toContain("microphone=()");
    expect(PERMISSIONS_POLICY).toContain("payment=()");
    expect(PERMISSIONS_POLICY).not.toContain("web-share");
    expect(PERMISSIONS_POLICY).not.toContain("fullscreen");
    expect(PERMISSIONS_POLICY).not.toContain("clipboard");
  });
});
