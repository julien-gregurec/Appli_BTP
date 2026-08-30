import { describe, expect, it } from "vitest";
import { EXTERNAL_URLS, getAppEnvironment, isNativeBuild, SITE } from "./site";

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
  });
});
