import { describe, expect, it } from "vitest";
import { FREE_ACCESS, resolveAccess } from "./access";
import { getPromotion, getPromotionForAccess, promotions } from "./promotions";

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
});
