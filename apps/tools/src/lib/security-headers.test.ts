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

  /*
   * FINAL-PREPILOT-CONSOLIDATION-V1 §8 — le repli `connect-src 'self'` n'est PAS un trou.
   *
   * La réserve connue est qu'un build sans `NEXT_PUBLIC_SUPABASE_URL` produit une CSP réduite à
   * l'origine propre. Ce n'est pas un blocage silencieux, parce que la CSP et le code client
   * sont décidés par le MÊME environnement de build : Next fige les `NEXT_PUBLIC_*` dans le
   * bundle, donc un build sans la variable embarque un `isElsatiaAccountConfigured()` faux et
   * n'émet jamais d'appel Supabase. La politique décrit exactement ce que l'application fait.
   *
   * La divergence redoutée — CSP sans l'origine, client qui l'appelle quand même — exigerait
   * deux environnements différents pour un seul build. Elle est donc structurellement
   * impossible, et c'est cela que ce test fixe : le repli est TOTAL (aucune origine résiduelle),
   * pas partiel.
   *
   * Ce qui reste à couvrir avant un déploiement n'est pas une question de sécurité mais de
   * parité fonctionnelle : rien n'échoue bruyamment si la variable manque, et le déploiement
   * livrerait alors un Tools sans compte. `scripts/verify-secrets.mjs` ne porte pas sur les
   * `NEXT_PUBLIC_*` de Tools — d'où la garde de pré-déploiement demandée au rapport.
   */
  it("replie la CSP en cohérence avec un client qui n'appellera aucun cloud", () => {
    const policy = buildContentSecurityPolicy({});
    expect(directive(policy, "connect-src")).toBe("connect-src 'self'");
    /* Aucune origine cloud résiduelle nulle part dans la politique. */
    expect(policy).not.toMatch(/supabase|elsatia\.fr|wss:/);
    /* Le durcissement, lui, ne dépend d'aucune variable : il tient dans les deux cas. */
    for (const options of [{}, PROD]) {
      const built = buildContentSecurityPolicy(options);
      expect(directive(built, "frame-ancestors")).toBe("frame-ancestors 'none'");
      expect(directive(built, "object-src")).toBe("object-src 'none'");
      expect(directive(built, "base-uri")).toBe("base-uri 'none'");
      expect(built).toContain("upgrade-insecure-requests");
    }
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
