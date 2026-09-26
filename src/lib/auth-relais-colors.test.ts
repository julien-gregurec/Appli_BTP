import { describe, expect, it } from "vitest";

import { lienRelaisColors, origineColors } from "@/lib/auth-relais-colors";

const COLORS = "https://colors.elsatia.fr";
const JETON = "b3f1c2d4e5a6b7c8d90123456789abcdef";

describe("origineColors", () => {
  it("retient l’origine HTTPS configurée, quel que soit le chemin", () => {
    expect(origineColors(COLORS, false)).toBe(COLORS);
    expect(origineColors(`${COLORS}/login?x=1`, false)).toBe(COLORS);
  });

  it("n’accepte le texte clair qu’en développement", () => {
    expect(origineColors("http://localhost:3010", true)).toBe("http://localhost:3010");
    expect(origineColors("http://localhost:3010", false)).toBeNull();
  });

  it("écarte une valeur absente, illisible ou d’un autre schéma", () => {
    for (const valeur of [undefined, "", "pas-une-url", "javascript:alert(1)", "ftp://colors.elsatia.fr"]) {
      expect(origineColors(valeur, true)).toBeNull();
    }
  });
});

describe("lienRelaisColors", () => {
  it("construit le lien de relais d’une récupération", () => {
    const lien = lienRelaisColors({ tokenHash: JETON, type: "recovery", origine: COLORS });
    const url = new URL(lien!);
    expect(url.origin).toBe(COLORS);
    expect(url.pathname).toBe("/auth/confirm");
    expect(url.searchParams.get("token_hash")).toBe(JETON);
    expect(url.searchParams.get("type")).toBe("recovery");
  });

  it("ne relaie que la récupération", () => {
    // Une confirmation d’inscription appartient à Gestion Pro : Colors n’a pas
    // d’écran d’inscription et ne doit jamais recevoir ce jeton.
    for (const type of ["email", "signup", "invite", "magiclink", "email_change", undefined]) {
      expect(lienRelaisColors({ tokenHash: JETON, type, origine: COLORS })).toBeNull();
    }
  });

  it("ne relaie rien si Colors n’est pas configurée : la page reste à l’identique", () => {
    expect(lienRelaisColors({ tokenHash: JETON, type: "recovery", origine: null })).toBeNull();
  });

  it("ne relaie rien sans jeton", () => {
    expect(lienRelaisColors({ tokenHash: undefined, type: "recovery", origine: COLORS })).toBeNull();
    expect(lienRelaisColors({ tokenHash: "", type: "recovery", origine: COLORS })).toBeNull();
  });

  it("ne dérive jamais l’hôte de destination d’une valeur reçue", () => {
    // L’origine vient de la configuration serveur ; un jeton forgé contenant
    // une URL ne peut que se retrouver encodé dans le paramètre.
    const lien = lienRelaisColors({
      tokenHash: "https://evil.example.com/vol",
      type: "recovery",
      origine: COLORS,
    });
    expect(new URL(lien!).origin).toBe(COLORS);
    expect(lien).not.toContain("//evil.example.com");
  });
});
