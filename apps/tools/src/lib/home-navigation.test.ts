import { describe, expect, it, vi } from "vitest";
import { revealFilteredTools, toggleCategoryFilter } from "./home-navigation";

describe("navigation des catégories depuis l’accueil", () => {
  it("active une catégorie et la désactive au second appui", () => {
    expect(toggleCategoryFilter(null, "squaring")).toBe("squaring");
    expect(toggleCategoryFilter("squaring", "squaring")).toBeNull();
    expect(toggleCategoryFilter("squaring", "geometry")).toBe("geometry");
  });

  it("révèle explicitement les résultats filtrés", () => {
    const scrollIntoView = vi.fn();
    expect(revealFilteredTools({ scrollIntoView })).toBe(true);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    expect(revealFilteredTools(null)).toBe(false);
  });
});
