import { describe, expect, it } from "vitest";
import { describeDisplayScale, FULL_SIZE_SCALE } from "./print-scale";

describe("échelle d'affichage (§6)", () => {
  it("n'annonce 1:1 que pour un facteur exactement égal à 1", () => {
    expect(describeDisplayScale(1).label).toBe("1:1");
    expect(describeDisplayScale(1).kind).toBe("full-size");
    expect(FULL_SIZE_SCALE.label).toBe("1:1");
  });

  it("un facteur très proche de 1 n'est jamais présenté comme 1:1", () => {
    const almost = describeDisplayScale(0.999);
    expect(almost.label).not.toBe("1:1");
    expect(almost.kind).not.toBe("full-size");
  });

  it("reconnaît les échelles normalisées", () => {
    expect(describeDisplayScale(1 / 20).label).toBe("1:20");
    expect(describeDisplayScale(1 / 20).kind).toBe("standard");
    expect(describeDisplayScale(1 / 50).label).toBe("1:50");
  });

  it("annonce une échelle ajustée sans l'arrondir vers une échelle normalisée voisine", () => {
    const fitted = describeDisplayScale(1 / 23.4);
    expect(fitted.kind).toBe("fitted");
    expect(fitted.label).toBe("1:23,4");
    expect(fitted.caption).toMatch(/ajustée/i);
  });

  it("toute légende non 1:1 interdit explicitement de mesurer sur le papier", () => {
    for (const factor of [1 / 20, 1 / 23.4, 1 / 100]) {
      expect(describeDisplayScale(factor).caption).toMatch(/ne pas mesurer/i);
    }
  });

  it("refuse un facteur invalide", () => {
    expect(() => describeDisplayScale(0)).toThrow();
    expect(() => describeDisplayScale(-1)).toThrow();
    expect(() => describeDisplayScale(Number.NaN)).toThrow();
    expect(() => describeDisplayScale(Number.POSITIVE_INFINITY)).toThrow();
  });
});
