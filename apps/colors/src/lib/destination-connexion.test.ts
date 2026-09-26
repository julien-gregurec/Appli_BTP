import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { porteCookieSession, urlConnexionDepuis } from "@/lib/destination-connexion";

describe("porteCookieSession", () => {
  it("reconnaît un cookie Supabase quel que soit le suffixe de projet", () => {
    expect(porteCookieSession(["sb-abcdefgh-auth-token"])).toBe(true);
    expect(porteCookieSession(["theme", "sb-x.0"])).toBe(true);
  });

  it("ne confond pas un cookie applicatif avec une session", () => {
    expect(porteCookieSession([])).toBe(false);
    expect(porteCookieSession(["theme", "consentement", "supabase"])).toBe(false);
  });
});

describe("urlConnexionDepuis", () => {
  it("mémorise la page demandée pour y revenir après connexion", () => {
    expect(urlConnexionDepuis({ chemin: "/inventaire/abc?tri=recent", sessionPresente: false }))
      .toBe("/login?next=%2Finventaire%2Fabc%3Ftri%3Drecent");
  });

  it("n'ajoute pas de next quand la destination est déjà celle par défaut", () => {
    expect(urlConnexionDepuis({ chemin: "/dashboard", sessionPresente: false })).toBe("/login");
    expect(urlConnexionDepuis({ chemin: null, sessionPresente: false })).toBe("/login");
  });

  it("annonce une session terminée uniquement si un cookie d'authentification accompagnait la requête", () => {
    expect(urlConnexionDepuis({ chemin: "/dashboard", sessionPresente: true })).toBe("/login?error=session-expiree");
    expect(urlConnexionDepuis({ chemin: "/dashboard", sessionPresente: false })).not.toContain("error=");
  });

  it("combine destination mémorisée et session terminée", () => {
    const url = urlConnexionDepuis({ chemin: "/depots", sessionPresente: true });
    expect(url).toContain("next=%2Fdepots");
    expect(url).toContain("error=session-expiree");
  });

  it("refuse toute destination qui n'est pas prouvée locale", () => {
    for (const hostile of ["https://exemple.test/vol", "//exemple.test", "/\\exemple.test", "javascript:alert(1)", "/chemin%0d%0aX"]) {
      expect(urlConnexionDepuis({ chemin: hostile, sessionPresente: false })).toBe("/login");
    }
  });
});

describe("en-têtes de requête", () => {
  it("sont posés avec set — jamais append — pour qu'une valeur envoyée par le client soit écrasée", () => {
    const proxy = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");
    expect(proxy).toMatch(/enTetesRequete\.set\(EN_TETE_CHEMIN,/);
    expect(proxy).toMatch(/enTetesRequete\.set\(\s*EN_TETE_SESSION,/);
    expect(proxy).not.toMatch(/enTetesRequete\.append\(/);
  });
});
