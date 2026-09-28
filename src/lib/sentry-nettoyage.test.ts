import { describe, expect, it } from "vitest";
import { nettoyerEvenementSentry } from "./sentry-nettoyage";

describe("nettoyage Sentry", () => {
  it("retire jetons, URL complètes, cookies et autorisation", () => {
    const evenement = nettoyerEvenementSentry({
      message: "Échec pour a@b.fr sur https://app.elsatia.fr/document/JETON_SECRET",
      request: {
        url: "https://app.elsatia.fr/auth/confirm?token_hash=HASH_SECRET&type=recovery",
        query_string: "token_hash=HASH_SECRET",
        cookies: { sb: "x" },
        headers: { Cookie: "sb=x", Authorization: "Bearer CRON", "user-agent": "UA" },
      },
      breadcrumbs: [{ message: "nav", data: { to: "https://reserves.elsatia.fr/invitation/JETON_INV", from: "/x?code=CODE" } }],
    });
    const brut = JSON.stringify(evenement);
    for (const fuite of ["JETON_SECRET", "HASH_SECRET", "a@b.fr", "Bearer CRON", "sb=x", "JETON_INV", "CODE"]) {
      expect(brut).not.toContain(fuite);
    }
    expect(evenement.request.url).toBe("https://app.elsatia.fr/auth/…");
    expect(evenement.request.headers["user-agent"]).toBe("UA");
  });
});
