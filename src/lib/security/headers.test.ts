import { describe, expect, it } from "vitest";
import { construireContentSecurityPolicy, headersSecurite } from "./headers";

describe("headers HTTP de sécurité", () => {
  it("construit une CSP de production sans script inline ni eval", () => {
    const csp = construireContentSecurityPolicy({
      nonce: "nonce-test",
      isDevelopment: false,
      supabaseUrl: "https://projet.supabase.co",
      sentryDsn: "https://cle@o123.ingest.sentry.io/456",
    });

    expect(csp).toContain("script-src 'self' 'nonce-nonce-test' 'strict-dynamic'");
    expect(csp).not.toMatch(/script-src[^;]*'unsafe-inline'/);
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("connect-src 'self' https://projet.supabase.co wss://projet.supabase.co https://o123.ingest.sentry.io");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toMatch(/(?:^|\s)\*(?:\s|;|$)/);
  });

  it("réserve unsafe-eval au développement", () => {
    const csp = construireContentSecurityPolicy({ nonce: "dev", isDevelopment: true });
    expect(csp).toMatch(/script-src[^;]*'unsafe-eval'/);
  });

  it("autorise Supabase HTTP local uniquement en développement", () => {
    const dev = construireContentSecurityPolicy({ nonce: "n", isDevelopment: true, supabaseUrl: "http://127.0.0.1:54321" });
    expect(dev).toContain("connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321");
    const production = construireContentSecurityPolicy({ nonce: "n", isDevelopment: false, supabaseUrl: "http://127.0.0.1:54321" });
    expect(production).not.toContain("127.0.0.1");
  });

  it("active les protections de transport et d'isolation utiles", () => {
    const headers = new Map(headersSecurite(true).map(({ key, value }) => [key, value]));
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    expect(headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
    expect(headers.has("Cross-Origin-Embedder-Policy")).toBe(false);
  });
});
