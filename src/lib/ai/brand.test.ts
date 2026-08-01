import { describe, expect, it } from "vitest";
import { BRAND_NAME, PRODUCT_NAME } from "@/lib/brand";
import { OUTILS_COPILOTE } from "@/lib/ai/copilote";

const ANCIENNES_MENTIONS = /Liria(?: Gestion Pro| Concept)?|LIRIA(?: CONCEPT)?/i;

describe("identite de l'assistant IA", () => {
  it("utilise la nouvelle identite dans les descriptions transmises au modele", () => {
    const descriptions = JSON.stringify(OUTILS_COPILOTE);

    expect(descriptions).toContain(BRAND_NAME);
    expect(descriptions).toContain(PRODUCT_NAME);
    expect(descriptions).not.toMatch(ANCIENNES_MENTIONS);
  });
});
