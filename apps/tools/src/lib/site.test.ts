import { describe, expect, it } from "vitest";
import { EXTERNAL_URLS, getAppEnvironment, isNativeBuild, PUBLIC_LEGAL_LINKS, SITE } from "./site";

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
    expect(EXTERNAL_URLS.colors).toBe("https://colors.elsatia.fr");
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
