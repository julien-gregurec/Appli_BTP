import { describe, expect, it } from "vitest";
import { arcThroughChordAndSagitta, cardinalPoints, circleFromThreePoints, divideCircle, divideSegment, tangentPointsFromExternal } from "./circle-tools";

describe("outils de cercle", () => {
  it("retrouve le cercle unité à partir de trois points connus", () => {
    const circle = circleFromThreePoints({ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 });
    expect(circle.centre.x).toBeCloseTo(0, 8);
    expect(circle.centre.y).toBeCloseTo(0, 8);
    expect(circle.radius).toBeCloseTo(1, 8);
  });

  it("refuse trois points alignés", () => {
    expect(() => circleFromThreePoints({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 })).toThrow();
  });

  it("calcule les points de tangence depuis un point externe (triangle 3-4-5)", () => {
    const points = tangentPointsFromExternal({ x: 0, y: 5 }, { centre: { x: 4, y: 5 }, radius: 3 });
    expect(points).toHaveLength(2);
    for (const p of points) expect(Math.hypot(p.x - 4, p.y - 5)).toBeCloseTo(3, 8);
  });

  it("points cardinaux d'un cercle", () => {
    const cardinal = cardinalPoints({ centre: { x: 0, y: 0 }, radius: 10 });
    expect(cardinal.north).toEqual({ x: 0, y: 10 });
    expect(cardinal.east).toEqual({ x: 10, y: 0 });
    expect(cardinal.south).toEqual({ x: 0, y: -10 });
    expect(cardinal.west).toEqual({ x: -10, y: 0 });
  });

  it("divise un cercle en 4 parties", () => {
    const points = divideCircle({ centre: { x: 0, y: 0 }, radius: 10 }, 4, 0);
    expect(points).toHaveLength(4);
    expect(points[0]).toEqual({ x: 10, y: 0 });
    expect(points[2].x).toBeCloseTo(-10, 8);
  });

  it("divise un segment en 5 parties égales", () => {
    const points = divideSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 5);
    expect(points).toHaveLength(6);
    expect(points[1]).toEqual({ x: 20, y: 0 });
  });

  it("arc par corde et flèche connues (rayon attendu 1000 pour corde 1600 / flèche 400)", () => {
    const arc = arcThroughChordAndSagitta({ x: -800, y: 0 }, { x: 800, y: 0 }, 400);
    expect(arc.radius).toBeCloseTo(1000, 6);
    expect(arc.apex.x).toBeCloseTo(0, 6);
    expect(arc.apex.y).toBeCloseTo(400, 6);
  });
});
