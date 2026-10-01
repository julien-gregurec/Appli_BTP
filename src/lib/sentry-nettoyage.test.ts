import { describe, expect, it } from "vitest";
import { ibanTest } from "@/test/banking-fixtures";
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

  it("masque IBAN complets, chiffrés bancaires et clés du trousseau (données de test)", () => {
    const iban = ibanTest(1);
    const ibanEspace = iban.replace(/(.{4})/g, "$1 ").trim();
    const chiffreV2 = "v2:k2:A256GCM:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB:Q0lQSEVSVEVYVA";
    const chiffreV1 = "v1:AAAAAAAAAAAAAAAA:BBBBBBBBBBBBBBBBBBBBBB:Q0lQSEVSVEVYVA";
    const cle = `k2:${Buffer.alloc(32, 5).toString("base64")}`;
    const evenement = nettoyerEvenementSentry({
      message: `RIB ${iban} refusé`,
      exception: { values: [{ value: `Échec pour ${ibanEspace} (${chiffreV2})` }] },
      extra: { trousseau: `BANK_DATA_ENCRYPTION_KEYS=${cle}`, ancien: chiffreV1, affichage: "IBAN •••• 0189" },
      breadcrumbs: [{ message: `virement ${iban}`, data: { iban } }],
    });
    const brut = JSON.stringify(evenement);
    for (const fuite of [iban, ibanEspace, "Q0lQSEVSVEVYVA", cle, Buffer.alloc(32, 5).toString("base64")]) expect(brut).not.toContain(fuite);
    expect(brut).toContain("[IBAN masqué]");
    expect(brut).toContain("•••• 0189");
  });
});
