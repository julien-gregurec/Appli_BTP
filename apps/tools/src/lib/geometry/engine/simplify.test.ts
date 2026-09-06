import { describe, expect, it } from "vitest";
import { simplifyPolylineDouglasPeucker, simplifyToConstructionElements } from "./simplify";

describe("simplification chantier", () => {
  it("réduit des points quasi-alignés à leurs deux extrémités", () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0.1 }, { x: 20, y: -0.1 }, { x: 30, y: 0 }];
    const simplified = simplifyPolylineDouglasPeucker(points, 1);
    expect(simplified).toEqual([points[0], points[3]]);
  });

  it("conserve les points significatifs d'un vrai virage", () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
    const simplified = simplifyPolylineDouglasPeucker(points, 1);
    expect(simplified).toHaveLength(3);
  });

  it("approxime un quart de cercle échantillonné par un unique arc, avec une erreur mesurée faible", () => {
    const radius = 1000;
    const points = Array.from({ length: 20 }, (_, i) => {
      const angle = (i / 19) * (Math.PI / 2);
      return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
    });
    const result = simplifyToConstructionElements(points, 5, "precise");
    expect(result.elements.some((e) => e.kind === "arc")).toBe(true);
    expect(result.estimatedMaxError).toBeLessThan(5);
    expect(result.quality).toBe("approximated");
  });
});
