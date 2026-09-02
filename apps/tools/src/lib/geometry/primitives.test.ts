import { describe, expect, it } from "vitest";
import { circleCircleIntersections, lineCircleIntersections, lineIntersection, midpoint, point, projection, rotate, sagitta, tangentPoints } from "./primitives";

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
