import { describe, expect, it } from "vitest";
import { cookiesPourUrl } from "./cookies";

const URL_DOC = "https://app.elsatia.fr/imprimer/devis/123";

describe("cookiesPourUrl (isolation du jeton de session au tirage PDF)", () => {
  it("lie chaque cookie à l'URL du document (jamais diffusé à un hôte tiers)", () => {
    const cookies = cookiesPourUrl("sb-access-token=abc; sb-refresh-token=def", URL_DOC);
    expect(cookies).toEqual([
      { name: "sb-access-token", value: "abc", url: URL_DOC },
      { name: "sb-refresh-token", value: "def", url: URL_DOC },
    ]);
    // Preuve de non-régression REDTEAM-V2 : tout cookie porte l'URL du document,
    // donc Chromium ne l'émet que vers cette origine, jamais vers `logo_url`.
    expect(cookies.every((c) => c.url === URL_DOC)).toBe(true);
  });

  it("préserve les « = » internes d'une valeur base64", () => {
    const [cookie] = cookiesPourUrl("sb-access-token=eyJhbGc=.payload=", URL_DOC);
    expect(cookie.value).toBe("eyJhbGc=.payload=");
  });

  it("ignore les segments vides ou sans nom", () => {
    expect(cookiesPourUrl("; =sansnom; valide=1;", URL_DOC)).toEqual([
      { name: "valide", value: "1", url: URL_DOC },
    ]);
  });

  it("renvoie une liste vide pour un en-tête vide", () => {
    expect(cookiesPourUrl("", URL_DOC)).toEqual([]);
  });
});
