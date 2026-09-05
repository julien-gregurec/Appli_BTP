import { describe, expect, it } from "vitest";
import { distance } from "./measure";
import { createCircleDivision } from "./circle-division";

describe("division de cercle", () => {
  it("N points de division à rayon constant, espacés de 360/N", () => {
    const shape = createCircleDivision({ divisions: 8, radius: 500 });
    const marks = Object.entries(shape.primitives.points).filter(([id]) => id !== "O");
    expect(marks).toHaveLength(8);
    for (const [, p] of marks) expect(distance(p, shape.centre)).toBeCloseTo(500, 8);
  });

  it("reste un cercle : aucun segment de contour ni polygone dans les primitives", () => {
    const shape = createCircleDivision({ divisions: 6, radius: 500 });
    // Les 2 axes de repérage sont les seuls segments — jamais un contour reliant les points.
    expect(shape.primitives.segments).toHaveLength(2);
    expect(shape.primitives.segments.every((s) => s.role === "axis")).toBe(true);
    expect(shape.primitives.polygons).toHaveLength(0);
    expect(shape.primitives.circles).toHaveLength(1);
  });

  it("startAngle décale l'ensemble des points sans changer le rayon", () => {
    const shape = createCircleDivision({ divisions: 4, radius: 300, startAngleDegrees: 45 });
    const first = shape.primitives.points.P1;
    const angle = (Math.atan2(first.y - shape.centre.y, first.x - shape.centre.x) * 180) / Math.PI;
    expect(angle).toBeCloseTo(45, 6);
  });

  it("refuse un nombre de divisions invalide", () => {
    expect(() => createCircleDivision({ divisions: 0, radius: 500 })).toThrow();
    expect(() => createCircleDivision({ divisions: 2.5, radius: 500 })).toThrow();
  });

  it("refuse un rayon invalide", () => {
    expect(() => createCircleDivision({ divisions: 6, radius: 0 })).toThrow();
    expect(() => createCircleDivision({ divisions: 6, radius: -10 })).toThrow();
  });

  it("cas limite : une seule division", () => {
    const shape = createCircleDivision({ divisions: 1, radius: 500 });
    expect(Object.keys(shape.primitives.points)).toHaveLength(2); // O + P1
  });
});
