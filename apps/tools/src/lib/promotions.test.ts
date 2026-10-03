import { describe, expect, it } from "vitest";
import { FREE_ACCESS, resolveAccess } from "./access";
import { buildPromotions, getPromotion, getPromotionForAccess, promotions } from "./promotions";
import { elsatiaAppUrls } from "./site";

describe("promotions ELSATIA", () => {
  it("possède des ids uniques et des configurations complètes", () => {
    expect(new Set(promotions.map((promotion) => promotion.id)).size).toBe(promotions.length);
    for (const promotion of promotions) {
      expect(promotion.url).toMatch(/^https:\/\//);
      expect(promotion.contexts.length).toBeGreaterThan(0);
      expect(promotion.priority).toBeGreaterThan(0);
    }
  });

  it("ne retourne que les promotions actives", () => {
    expect(getPromotion("gestion-pro-quantitatifs")?.application).toBe("gestion-pro");
    expect(getPromotion("colors-peinture")?.application).toBe("colors");
    expect(getPromotion("colors-peinture")?.contexts).toContain("painting");
  });

  it("désactive centralement les promotions pour la capability Pro dédiée", () => {
    expect(getPromotionForAccess("gestion-pro-quantitatifs", FREE_ACCESS)).toBeDefined();
    expect(getPromotionForAccess("gestion-pro-quantitatifs", resolveAccess([{ tier: "pro", source: "web" }]))).toBeUndefined();
  });

  /* A-08 : sans URL sûre pour l'environnement, la promotion est désactivée (jamais un lien Production depuis une Preview). */
  it("désactive une promotion dont l'application n'a pas d'URL dans l'environnement", () => {
    const preview = buildPromotions(elsatiaAppUrls({ env: "preview", colors: "https://colors-git-main.vercel.app" }));
    expect(preview.find((p) => p.id === "gestion-pro-quantitatifs")?.active).toBe(false);
    expect(preview.find((p) => p.id === "colors-peinture")).toMatchObject({ active: true, url: "https://colors-git-main.vercel.app" });
    for (const promotion of preview) expect(promotion.url ?? "").not.toMatch(/elsatia\.fr/);
  });
});
