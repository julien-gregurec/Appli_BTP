import { describe, expect, it } from "vitest";
import { filterConseils, hasActiveFilter } from "./filters";
import { CONSEIL_FICHES_PUBLISHED } from "./registry";

const all = CONSEIL_FICHES_PUBLISHED;
const slugs = (filter: Parameters<typeof filterConseils>[1]) =>
  filterConseils(all, filter).map((f) => f.slug).sort();

describe("filtres Conseils", () => {
  it("sans critère, ne retire rien", () => {
    expect(filterConseils(all, {})).toHaveLength(3);
    expect(hasActiveFilter({})).toBe(false);
    expect(hasActiveFilter({ category: null, trade: null, difficulty: null })).toBe(false);
  });

  it("filtre par catégorie", () => {
    expect(slugs({ category: "geometrie-chantier" })).toEqual([
      "verifier-un-angle-droit-au-3-4-5",
    ]);
    expect(slugs({ category: "implantation" })).toEqual([
      "diviser-une-longueur-en-entraxes-reguliers",
      "trouver-le-centre-d-un-rectangle",
    ]);
  });

  it("filtre par difficulté", () => {
    expect(slugs({ difficulty: "intermediaire" })).toEqual([
      "diviser-une-longueur-en-entraxes-reguliers",
    ]);
  });

  it("filtre par métier, en gardant les fiches marquées « tous »", () => {
    // Toutes les fiches démo incluent « tous » → visibles pour n'importe quel métier.
    expect(slugs({ trade: "carreleur" })).toHaveLength(3);
    expect(slugs({ trade: "metallier" })).toHaveLength(3);
  });

  it("combine plusieurs critères", () => {
    expect(slugs({ category: "implantation", difficulty: "facile" })).toEqual([
      "trouver-le-centre-d-un-rectangle",
    ]);
    expect(hasActiveFilter({ category: "implantation", difficulty: "facile" })).toBe(true);
  });
});
