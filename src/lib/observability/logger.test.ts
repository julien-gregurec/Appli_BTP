import { describe, expect, it, vi } from "vitest";
import { logErreur, logInfo, logWarn } from "@/lib/observability/logger";

describe("journalisation structurée — rédaction des secrets", () => {
  it("masque un JWT, un IBAN et une clé Stripe présents dans un message", () => {
    const espion = vi.spyOn(console, "error").mockImplementation(() => {});
    logErreur("auth", "Échec avec jeton eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PYE4Bh9Ei9GzY et IBAN FR7630006000011234567890189 et clé sk_live_abcdefghijklmnop");
    const ligne = espion.mock.calls[0][0] as string;
    expect(ligne).not.toMatch(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/);
    expect(ligne).not.toContain("FR7630006000011234567890189");
    expect(ligne).not.toContain("sk_live_abcdefghijklmnop");
    expect(ligne).toContain("[jwt-redacted]");
    expect(ligne).toContain("[iban-redacted]");
    expect(ligne).toContain("[clé-redacted]");
    espion.mockRestore();
  });

  it("masque les clés de contexte sensibles (authorization, password, token, cookie...)", () => {
    const espion = vi.spyOn(console, "warn").mockImplementation(() => {});
    logWarn("security", "Tentative suspecte", {
      route: "/api/x",
      authorization: "Bearer abcdef",
      password: "secret123",
      cookie: "session=abcde",
      details: { token: "xyz", nested: { api_key: "abc" } },
    });
    const ligne = espion.mock.calls[0][0] as string;
    expect(ligne).not.toContain("Bearer abcdef");
    expect(ligne).not.toContain("secret123");
    expect(ligne).not.toContain("session=abcde");
    expect(ligne).not.toContain('"token":"xyz"');
    expect(ligne).not.toContain('"api_key":"abc"');
    const parsed = JSON.parse(ligne);
    expect(parsed.authorization).toBe("[redacted]");
    expect(parsed.password).toBe("[redacted]");
    espion.mockRestore();
  });

  it("pseudonymise l'identifiant utilisateur au lieu de le journaliser en clair", () => {
    const espion = vi.spyOn(console, "info").mockImplementation(() => {});
    logInfo("data", "Consultation", { userId: "11111111-1111-1111-1111-111111111111" });
    const ligne = espion.mock.calls[0][0] as string;
    expect(ligne).not.toContain("11111111-1111-1111-1111-111111111111");
    const parsed = JSON.parse(ligne);
    expect(parsed.userId).toMatch(/^u_/);
    espion.mockRestore();
  });

  it("produit un JSON structuré avec les champs de corrélation attendus", () => {
    const espion = vi.spyOn(console, "info").mockImplementation(() => {});
    logInfo("platform", "Test", { requestId: "req-1", route: "/api/test", statusCode: 200, durationMs: 12 });
    const ligne = JSON.parse(espion.mock.calls[0][0] as string);
    expect(ligne).toMatchObject({ niveau: "info", categorie: "platform", requestId: "req-1", route: "/api/test", statusCode: 200, durationMs: 12 });
    expect(typeof ligne.timestamp).toBe("string");
    espion.mockRestore();
  });
});
