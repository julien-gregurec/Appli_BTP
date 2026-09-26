import { describe, expect, it } from "vitest";
import { filterConseils, hasActiveFilter } from "./filters";
import { CONSEIL_FICHES_PUBLISHED } from "./registry";

const all = CONSEIL_FICHES_PUBLISHED;
const slugs = (filter: Parameters<typeof filterConseils>[1]) =>
  filterConseils(all, filter).map((f) => f.slug).sort();

describe("filtres Conseils", () => {
  it("sans critère, ne retire rien", () => {
    expect(filterConseils(all, {})).toHaveLength(all.length);
    expect(hasActiveFilter({})).toBe(false);
    expect(hasActiveFilter({ category: null, trade: null, difficulty: null })).toBe(false);
  });

  it("filtre par catégorie", () => {
    expect(slugs({ category: "geometrie-chantier" })).toEqual([
      "verifier-un-angle-droit-au-3-4-5",
    ]);
    expect(slugs({ category: "diagnostic" })).toEqual([
      "diagnostiquer-une-fissure-sur-bande-de-joint",
      "diagnostiquer-une-porte-qui-frotte",
    ]);
    expect(slugs({ category: "tracage" }).length).toBeGreaterThanOrEqual(5);
  });

  it("filtre par difficulté", () => {
    const facile = filterConseils(all, { difficulty: "facile" });
    expect(facile.length).toBeGreaterThan(0);
    expect(facile.every((fiche) => fiche.difficulty === "facile")).toBe(true);

    const avance = filterConseils(all, { difficulty: "avance" });
    expect(avance.length).toBeGreaterThan(0);
    expect(avance.every((fiche) => fiche.difficulty === "avance")).toBe(true);
  });

  it("filtre par métier, en gardant les fiches marquées « tous »", () => {
    // Toutes les fiches incluent « tous » → visibles quel que soit le métier demandé.
    expect(slugs({ trade: "carreleur" })).toHaveLength(all.length);
    expect(slugs({ trade: "vitrier" })).toHaveLength(all.length);
  });

  it("écarte une fiche qui ne cite ni le métier demandé ni « tous »", () => {
    const specialisee = { ...all[0]!, slug: "fiche-specialisee", trades: ["peintre"] as const };
    expect(filterConseils([specialisee], { trade: "peintre" })).toHaveLength(1);
    expect(filterConseils([specialisee], { trade: "metallier" })).toHaveLength(0);
  });

  it("combine plusieurs critères", () => {
    expect(slugs({ category: "implantation", difficulty: "facile" })).toEqual([
      "trouver-le-centre-d-un-rectangle",
    ]);
    expect(hasActiveFilter({ category: "implantation", difficulty: "facile" })).toBe(true);
  });

  it("laisse une combinaison sans résultat retourner une liste vide", () => {
    expect(filterConseils(all, { category: "securite", difficulty: "avance" })).toEqual([]);
  });
});
