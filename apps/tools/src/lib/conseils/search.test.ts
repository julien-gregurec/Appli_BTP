import { describe, expect, it } from "vitest";
import { CONSEIL_FICHES_PUBLISHED } from "./registry";
import { createConseilSearchIndex, searchConseils } from "./search";
import { normalizeText } from "./text";

const index = createConseilSearchIndex(CONSEIL_FICHES_PUBLISHED);
const slugs = (query: string) => searchConseils(index, query).map((f) => f.slug);

describe("normalizeText", () => {
  it("retire accents, casse et apostrophes", () => {
    expect(normalizeText("ÉQUERRAGE")).toBe("equerrage");
    expect(normalizeText("d’un   rectangle")).toBe("d un rectangle");
    expect(normalizeText("  Entraxe\tRégulier ")).toBe("entraxe regulier");
  });
});

describe("recherche locale Conseils", () => {
  it("retourne toutes les fiches pour une requête vide", () => {
    expect(searchConseils(index, "   ")).toHaveLength(3);
  });

  it("est insensible à la casse et aux accents", () => {
    expect(slugs("EQUERRAGE")).toContain("verifier-un-angle-droit-au-3-4-5");
    expect(slugs("équerrage")).toContain("verifier-un-angle-droit-au-3-4-5");
  });

  it("cherche dans les tags", () => {
    expect(slugs("suspentes")).toEqual(["diviser-une-longueur-en-entraxes-reguliers"]);
  });

  it("cherche par catégorie et par métier", () => {
    expect(slugs("implantation").length).toBeGreaterThanOrEqual(2);
    expect(slugs("metallier")).toEqual(["diviser-une-longueur-en-entraxes-reguliers"]);
  });

  it("exige que tous les jetons correspondent", () => {
    expect(slugs("angle droit")).toEqual(["verifier-un-angle-droit-au-3-4-5"]);
    expect(slugs("angle carreleur")).toEqual([]);
  });

  it("classe la correspondance de titre avant la correspondance de tag", () => {
    const result = slugs("centre");
    expect(result[0]).toBe("trouver-le-centre-d-un-rectangle");
  });
});
