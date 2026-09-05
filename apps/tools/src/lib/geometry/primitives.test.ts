import { describe, expect, it } from "vitest";
import { circleCircleIntersections, distance, divideCircle, lineCircleIntersections, lineIntersection, midpoint, point, projection, rotate, sagitta, tangentPoints } from "./primitives";

describe("primitives géométriques chantier", () => {
  it("calcule milieu, projection, rotation et flèche sans pixels", () => {
    const A = point("A", 0, 0); const B = point("B", 1000, 0);
    expect(midpoint(A, B)).toMatchObject({ x: 500, y: 0 });
    expect(projection(point("P", 400, 300), { id: "AB", start: A, end: B })).toMatchObject({ x: 400, y: 0 });
    expect(rotate(B, A, Math.PI / 2).x).toBeCloseTo(0, 8);
    expect(rotate(B, A, Math.PI / 2).y).toBeCloseTo(1000, 8);
    expect(sagitta(1000, 1600)).toBeCloseTo(400, 8);
  });

  it("gère intersections ligne/ligne, ligne/cercle et tangence", () => {
    const horizontal = { id: "h", start: point("A", -10, 0), end: point("B", 10, 0) };
    const vertical = { id: "v", start: point("C", 0, -10), end: point("D", 0, 10) };
    expect(lineIntersection(horizontal, vertical)).toMatchObject({ x: 0, y: 0 });
    expect(lineCircleIntersections(horizontal, { id: "c", centre: point("O", 0, 0), radius: 5 })).toHaveLength(2);
    expect(lineCircleIntersections({ id: "t", start: point("T1", -10, 5), end: point("T2", 10, 5) }, { id: "c", centre: point("O", 0, 0), radius: 5 })).toHaveLength(1);
    expect(lineCircleIntersections({ id: "n", start: point("N1", -10, 6), end: point("N2", 10, 6) }, { id: "c", centre: point("O", 0, 0), radius: 5 })).toHaveLength(0);
  });

  it("gère intersections cercle/cercle, tangente et absence", () => {
    const first = { id: "c1", centre: point("O1", 0, 0), radius: 5 };
    expect(circleCircleIntersections(first, { id: "c2", centre: point("O2", 8, 0), radius: 5 })).toHaveLength(2);
    expect(circleCircleIntersections(first, { id: "c2", centre: point("O2", 10, 0), radius: 5 })).toHaveLength(1);
    expect(circleCircleIntersections(first, { id: "c2", centre: point("O2", 20, 0), radius: 5 })).toHaveLength(0);
    expect(tangentPoints(point("P", 13, 0), first)).toHaveLength(2);
    expect(tangentPoints(point("P", 2, 0), first)).toHaveLength(0);
  });
});

describe("divideCircle — ENGINE-FOUNDATION-V1", () => {
  const O = point("O", 0, 0, "Centre O", "construction");

  it("count=6 -> 6 points", () => {
    expect(divideCircle(O, 1000, 6)).toHaveLength(6);
  });

  it("rayon=1000 -> chaque point à 1000 mm du centre", () => {
    for (const item of divideCircle(O, 1000, 6)) expect(distance(O, item)).toBeCloseTo(1000, 8);
  });

  it("6 divisions -> 60° entre points consécutifs", () => {
    const [p1, p2] = divideCircle(O, 1000, 6);
    const angle1 = Math.atan2(p1.y - O.y, p1.x - O.x);
    const angle2 = Math.atan2(p2.y - O.y, p2.x - O.x);
    expect(((angle2 - angle1) * 180) / Math.PI).toBeCloseTo(60, 8);
  });

  it("ordre stable : l'indice i est toujours à l'angle startAngle + i * 2π/count", () => {
    const startAngle = Math.PI / 4;
    const points = divideCircle(O, 500, 4, startAngle);
    points.forEach((item, index) => {
      const expectedAngle = startAngle + (index * (2 * Math.PI)) / 4;
      expect(item.x).toBeCloseTo(O.x + 500 * Math.cos(expectedAngle), 8);
      expect(item.y).toBeCloseTo(O.y + 500 * Math.sin(expectedAngle), 8);
    });
  });

  it("count=1 -> un seul point, à startAngle", () => {
    const points = divideCircle(O, 200, 1, 0);
    expect(points).toHaveLength(1);
    expect(points[0]).toMatchObject({ x: 200, y: 0 });
  });

  it("refuse un rayon invalide ou un nombre de divisions invalide", () => {
    expect(() => divideCircle(O, 0, 6)).toThrow();
    expect(() => divideCircle(O, -10, 6)).toThrow();
    expect(() => divideCircle(O, 1000, 0)).toThrow();
    expect(() => divideCircle(O, 1000, 2.5)).toThrow();
    expect(() => divideCircle(O, 1000, 6, Number.NaN)).toThrow();
  });
});
