import { describe, expect, it } from "vitest";
import { createRadialPattern } from "./radial-pattern";

describe("répétition circulaire générique", () => {
  it("répartit un point source en 4 positions à 90°", () => {
    const pattern = createRadialPattern({ source: { x: 10, y: 0 }, count: 4 });
    const points = Object.entries(pattern.primitives.points).filter(([id]) => id !== "O").map(([, p]) => p);
    expect(points).toHaveLength(4);
    const rounded = points.map((p) => ({ x: Math.round(p.x) || 0, y: Math.round(p.y) || 0 }));
    expect(rounded).toContainEqual({ x: 10, y: 0 });
    expect(rounded).toContainEqual({ x: 0, y: 10 });
    expect(rounded).toContainEqual({ x: -10, y: 0 });
    expect(rounded).toContainEqual({ x: 0, y: -10 });
  });

  it("répartit un cercle source en 3 exemplaires", () => {
    const pattern = createRadialPattern({ source: { centre: { x: 50, y: 0 }, radius: 5 }, count: 3 });
    expect(pattern.primitives.circles).toHaveLength(3);
    for (const circle of pattern.primitives.circles) expect(Math.hypot(circle.centre.x, circle.centre.y)).toBeCloseTo(50, 6);
  });

  it("angle partiel avec les deux extrémités incluses", () => {
    const pattern = createRadialPattern({ source: { x: 10, y: 0 }, count: 3, totalAngleDegrees: 180, startAngleDegrees: 0 });
    const points = Object.entries(pattern.primitives.points).filter(([id]) => id !== "O").map(([, p]) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    expect(points).toContainEqual({ x: 10, y: 0 });
    expect(points).toContainEqual({ x: -10, y: 0 });
  });

  it("refuse un nombre d'instances non entier ou nul", () => {
    expect(() => createRadialPattern({ source: { x: 10, y: 0 }, count: 0 })).toThrow();
  });
});
