import { describe, expect, it } from "vitest";
import { SITE } from "./site";

describe("identité canonique", () => {
  it("utilise exclusivement ELSATIA Tools et le domaine Tools", () => {
    expect(SITE.productName).toBe("ELSATIA Tools");
    expect(SITE.shortName).toBe("Tools");
    expect(SITE.defaultUrl).toBe("https://tools.elsatia.fr");
    expect(SITE.tagline).toContain("boîte à outils numérique");
  });
});
