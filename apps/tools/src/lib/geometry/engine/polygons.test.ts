import { describe, expect, it } from "vitest";
import { distance } from "./measure";
import { createHexagon, createRegularPolygon, createSquare } from "./polygons";

describe("polygones réguliers", () => {
  it("carré de rayon 100 a des côtés de longueur R√2", () => {
    const square = createSquare({ radius: 100 });
    expect(square.primitives.polygons[0].points).toHaveLength(4);
    expect(distance(square.primitives.polygons[0].points[0], square.primitives.polygons[0].points[1])).toBeCloseTo(100 * Math.sqrt(2), 6);
    expect(square.metadata.interiorAngleDegrees).toBe(90);
  });

  it("hexagone construit depuis une longueur de côté redonne exactement ce côté", () => {
    const hexagon = createHexagon({ sideLength: 250 });
    expect(distance(hexagon.primitives.polygons[0].points[0], hexagon.primitives.polygons[0].points[1])).toBeCloseTo(250, 6);
    expect(hexagon.metadata.interiorAngleDegrees).toBe(120);
  });

  it("refuse moins de 3 côtés", () => {
    expect(() => createRegularPolygon({ sides: 2, radius: 10 })).toThrow();
  });

  it("refuse l'absence de dimension", () => {
    expect(() => createRegularPolygon({ sides: 5 })).toThrow();
  });
});
