import { describe, expect, it } from "vitest";
import { ACCESS_TIERS } from "./access";
import { CATEGORY_IDS } from "./categories";
import { activeTools, TOOL_IDS, tools } from "./catalog";

describe("catalogue canonique", () => {
  it("déclare seize outils actifs avec ids et slugs uniques", () => {
    expect(activeTools).toHaveLength(16);
    expect(tools.map((tool) => tool.id)).toEqual([...TOOL_IDS]);
    expect(new Set(tools.map((tool) => tool.id)).size).toBe(tools.length);
    expect(new Set(tools.map((tool) => tool.slug)).size).toBe(tools.length);
  });

  it("déclare des routes, moteurs, catégories, accès et SEO valides", () => {
    for (const tool of tools) {
      expect(tool.slug).toMatch(/^[a-z0-9-]+$/);
      expect(tool.engine.length).toBeGreaterThan(0);
      expect(CATEGORY_IDS).toContain(tool.categoryId);
      expect(ACCESS_TIERS).toContain(tool.access);
      expect(tool.seo.title.length).toBeGreaterThan(10);
      expect(tool.seo.description.length).toBeGreaterThan(20);
      expect(`/outils/${tool.slug}`).not.toContain("undefined");
    }
  });

  it("préserve gratuitement tout le catalogue chantier R3", () => {
    expect(tools.every((tool) => tool.access === "free")).toBe(true);
  });

  it("active les schémas seulement pour les outils qui possèdent un modèle", () => {
    const withSvg = activeTools.filter((tool) => tool.hasSvg).map((tool) => tool.id);
    expect(withSvg).toEqual(expect.arrayContaining(["angle-droit-345", "pente", "arc-corde-fleche", "entraxes", "repartition-vitrages", "fixations"]));
    expect(withSvg).not.toContain("poids-vitrage");
    expect(withSvg).not.toContain("quantite-peinture");
  });
});
