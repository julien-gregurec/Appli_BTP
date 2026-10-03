import { describe, expect, it } from "vitest";

import {
  ORIGINES_PRODUCTION_ELSATIA,
  environnementNavigationServeur,
  environnementNavigationStrict,
  estHoteProductionElsatia,
  urlApplicationPourEnvironnement,
  urlNavigationSure,
} from "./index";

const CATALOGUE_GP = {
  urlLocale: "http://localhost:3000",
  urlPreview: "https://elsatia-gp-git-main.vercel.app",
  urlProduction: "https://app.elsatia.fr",
};

describe("navigation inter-applications (A-08)", () => {
  it("lit l'environnement strictement : aucune valeur inconnue n'est ramenée à un défaut", () => {
    expect(environnementNavigationStrict("local")).toBe("local");
    expect(environnementNavigationStrict(" preview ")).toBe("preview");
    expect(environnementNavigationStrict("production")).toBe("production");
    for (const v of ["prod", "Preview", "staging", "test", "", undefined, null]) {
      expect(environnementNavigationStrict(v)).toBeNull();
    }
  });

  it("serveur : absent en local → local ; absent sur Vercel ou inconnu → aucun lien", () => {
    expect(environnementNavigationServeur({})).toBe("local");
    expect(environnementNavigationServeur({ VERCEL_ENV: "preview" })).toBeNull();
    expect(environnementNavigationServeur({ VERCEL_ENV: "production" })).toBeNull();
    expect(environnementNavigationServeur({ ELSATIA_APPLICATION_ENV: "staging" })).toBeNull();
    expect(environnementNavigationServeur({ ELSATIA_APPLICATION_ENV: "preview", VERCEL_ENV: "preview" })).toBe("preview");
  });

  it("reconnaît les hôtes de Production ELSATIA sans se laisser tromper par un suffixe", () => {
    for (const h of ["elsatia.fr", "app.elsatia.fr", "colors.elsatia.fr", "TOOLS.ELSATIA.FR", "reserves.elsatia.fr", "studio.elsatia.fr"]) {
      expect(estHoteProductionElsatia(h)).toBe(true);
    }
    for (const h of ["elsatia.fr.evil.com", "evilelsatia.fr", "x.vercel.app", "localhost"]) {
      expect(estHoteProductionElsatia(h)).toBe(false);
    }
  });

  it("LOCAL → local uniquement", () => {
    expect(urlApplicationPourEnvironnement(CATALOGUE_GP, "local")).toBe("http://localhost:3000");
    expect(urlNavigationSure("https://app.elsatia.fr", "local")).toBeNull();
    expect(urlNavigationSure("https://x.vercel.app", "local")).toBeNull();
  });

  it("PREVIEW → Preview, jamais la Production", () => {
    expect(urlApplicationPourEnvironnement(CATALOGUE_GP, "preview")).toBe("https://elsatia-gp-git-main.vercel.app");
    for (const prod of Object.values(ORIGINES_PRODUCTION_ELSATIA)) expect(urlNavigationSure(prod, "preview")).toBeNull();
    expect(urlNavigationSure("https://app.elsatia.fr/abonnement", "preview")).toBeNull();
    expect(urlNavigationSure("http://x.vercel.app", "preview")).toBeNull();
    expect(urlNavigationSure("http://localhost:3000", "preview")).toBeNull();
    // Catalogue mal renseigné (url_preview = URL de Production) : aucun lien.
    expect(urlApplicationPourEnvironnement({ ...CATALOGUE_GP, urlPreview: "https://app.elsatia.fr" }, "preview")).toBeNull();
    // url_preview absente : aucun lien, jamais de repli sur la Production.
    expect(urlApplicationPourEnvironnement({ ...CATALOGUE_GP, urlPreview: null }, "preview")).toBeNull();
  });

  it("PRODUCTION → hôte canonique uniquement", () => {
    expect(urlApplicationPourEnvironnement(CATALOGUE_GP, "production")).toBe("https://app.elsatia.fr");
    expect(urlNavigationSure("https://x.vercel.app", "production")).toBeNull();
    expect(urlNavigationSure("http://app.elsatia.fr", "production")).toBeNull();
  });

  it("refuse partout les schémas dangereux, identifiants et URL illisibles", () => {
    for (const env of ["local", "preview", "production"] as const) {
      for (const brute of ["javascript:alert(1)", "data:text/html,x", "//app.elsatia.fr", "/dashboard", "https://u:p@app.elsatia.fr", "file:///etc/passwd", "", "   "]) {
        expect(urlNavigationSure(brute, env)).toBeNull();
      }
    }
    expect(urlApplicationPourEnvironnement(CATALOGUE_GP, null)).toBeNull();
  });
});
