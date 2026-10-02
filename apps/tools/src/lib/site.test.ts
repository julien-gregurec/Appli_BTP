import { describe, expect, it } from "vitest";
import { EXTERNAL_URLS, elsatiaAppUrls, getAppEnvironment, isNativeBuild, navigationEnvironment, PUBLIC_LEGAL_LINKS, resolveToolsEnv, SITE } from "./site";

describe("identité canonique", () => {
  it("utilise exclusivement ELSATIA Tools et le domaine Tools", () => {
    expect(SITE.productName).toBe("ELSATIA Tools");
    expect(SITE.shortName).toBe("Tools");
    expect(SITE.defaultUrl).toBe("https://tools.elsatia.fr");
    expect(SITE.tagline).toContain("boîte à outils numérique");
  });

  it("centralise les environnements et URLs externes", () => {
    expect(getAppEnvironment("native-dev")).toBe("native-dev");
    expect(getAppEnvironment("inconnu")).toBe("production");
    expect(isNativeBuild("native")).toBe(true);
    // A-08 : les URLs d'application ne sont plus des constantes de Production (voir elsatiaAppUrls).
    expect(EXTERNAL_URLS).not.toHaveProperty("colors");
    expect(EXTERNAL_URLS).not.toHaveProperty("gestionPro");
    expect(EXTERNAL_URLS).not.toHaveProperty("accountCreation");
    expect(EXTERNAL_URLS.privacy).toBe("https://elsatia.fr/confidentialite");
    expect(EXTERNAL_URLS.terms).toBe("https://elsatia.fr/cgu");
    expect(EXTERNAL_URLS.legalNotice).toBe("https://elsatia.fr/mentions-legales");
    expect(EXTERNAL_URLS.support).toBe("https://elsatia.fr/contact");
    expect(EXTERNAL_URLS.accountDeletion).toBe("https://tools.elsatia.fr/suppression-compte");
  });

  it("expose les liens juridiques publics vers le site ELSATIA sans page dupliquée dans Tools", () => {
    expect(PUBLIC_LEGAL_LINKS.map((link) => [link.label, link.href])).toEqual([
      ["Mentions légales", "https://elsatia.fr/mentions-legales"],
      ["Confidentialité", "https://elsatia.fr/confidentialite"],
      ["CGU", "https://elsatia.fr/cgu"],
      ["Contact", "https://elsatia.fr/contact"],
      ["ELSATIA", "https://elsatia.fr"],
    ]);
    for (const link of PUBLIC_LEGAL_LINKS) {
      expect(link.href.startsWith("https://elsatia.fr")).toBe(true);
      expect(link.href).not.toContain("tools.elsatia.fr");
    }
  });
});

/*
 * A-08 + TOOLS_ENV (ELSATIA_SATELLITES_PREVIEW_READINESS_V2) : les liens Tools → Gestion Pro et
 * Tools → Colors suivent l'environnement ; une Preview ne bascule jamais vers la Production.
 */
describe("NEXT_PUBLIC_TOOLS_ENV strict", () => {
  it("accepte local, preview, production (et les modes natifs existants)", () => {
    for (const v of ["local", "preview", "production", "native-dev", "native-production"]) expect(resolveToolsEnv(v)).toBe(v);
  });
  it("absente : production (contrat historique — la garde de build impose la déclaration sur Vercel)", () => {
    expect(resolveToolsEnv(undefined)).toBe("production");
    expect(resolveToolsEnv("")).toBe("production");
  });
  it("inconnue : null (fail closed), jamais ramenée à un mode", () => {
    for (const v of ["prod", "Preview", "staging", "recette", "development"]) {
      expect(resolveToolsEnv(v)).toBeNull();
      expect(navigationEnvironment(v)).toBeNull();
    }
  });
  it("projette les modes natifs sur l'environnement de navigation", () => {
    expect(navigationEnvironment("native-dev")).toBe("local");
    expect(navigationEnvironment("native-production")).toBe("production");
  });
});

describe("liens Tools → Gestion Pro / Colors", () => {
  it("LOCAL → local", () => {
    expect(elsatiaAppUrls({ env: "local" })).toMatchObject({
      environment: "local", gestionPro: "http://localhost:3000", colors: "http://localhost:3010", accountCreation: "http://localhost:3000/signup",
    });
    expect(elsatiaAppUrls({ env: "local", gestionPro: "https://app.elsatia.fr" }).gestionPro).toBeNull();
  });

  it("PREVIEW → Preview déclarée, jamais la Production", () => {
    const preview = elsatiaAppUrls({ env: "preview", gestionPro: "https://gp-git-main.vercel.app", colors: "https://colors-git-main.vercel.app" });
    expect(preview).toMatchObject({
      environment: "preview", gestionPro: "https://gp-git-main.vercel.app", colors: "https://colors-git-main.vercel.app",
      accountCreation: "https://gp-git-main.vercel.app/signup",
    });
    expect(elsatiaAppUrls({ env: "preview" })).toMatchObject({ gestionPro: null, colors: null, accountCreation: null });
    expect(elsatiaAppUrls({ env: "preview", gestionPro: "https://app.elsatia.fr", colors: "https://colors.elsatia.fr" }))
      .toMatchObject({ gestionPro: null, colors: null, accountCreation: null });
  });

  it("PRODUCTION → hôtes canoniques", () => {
    expect(elsatiaAppUrls({ env: "production" })).toMatchObject({
      gestionPro: "https://app.elsatia.fr", colors: "https://colors.elsatia.fr", accountCreation: "https://app.elsatia.fr/signup",
    });
    expect(elsatiaAppUrls({ env: "production", gestionPro: "https://gp-git-main.vercel.app" }).gestionPro).toBeNull();
  });

  it("environnement inconnu → aucun lien", () => {
    expect(elsatiaAppUrls({ env: "recette" })).toMatchObject({ environment: null, gestionPro: null, colors: null, accountCreation: null });
  });
});
