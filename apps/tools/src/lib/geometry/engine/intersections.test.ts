import { describe, expect, it } from "vitest";
import { arcArcIntersection, circleCircleIntersection, lineCircleIntersection, lineLineIntersection, segmentSegmentIntersection } from "./intersections";

describe("intersections géométriques", () => {
  it("intersection de deux droites perpendiculaires", () => {
    const result = lineLineIntersection({ point: { x: -10, y: 0 }, direction: { x: 1, y: 0 } }, { point: { x: 0, y: -10 }, direction: { x: 0, y: 1 } });
    expect(result.kind).toBe("one");
    expect(result.points[0]).toEqual({ x: 0, y: 0 });
  });

  it("droites parallèles distinctes : aucune intersection", () => {
    const result = lineLineIntersection({ point: { x: 0, y: 0 }, direction: { x: 1, y: 0 } }, { point: { x: 0, y: 5 }, direction: { x: 1, y: 0 } });
    expect(result.kind).toBe("none");
  });

  it("droites confondues", () => {
    const result = lineLineIntersection({ point: { x: 0, y: 0 }, direction: { x: 1, y: 0 } }, { point: { x: 5, y: 0 }, direction: { x: 2, y: 0 } });
    expect(result.kind).toBe("coincident");
  });

  it("segments qui ne se croisent pas car hors des bornes", () => {
    const result = segmentSegmentIntersection({ start: { x: 0, y: 0 }, end: { x: 1, y: 0 } }, { start: { x: 5, y: -1 }, end: { x: 5, y: 1 } });
    expect(result.kind).toBe("none");
  });

  it("segments sécants", () => {
    const result = segmentSegmentIntersection({ start: { x: -1, y: 0 }, end: { x: 1, y: 0 } }, { start: { x: 0, y: -1 }, end: { x: 0, y: 1 } });
    expect(result.kind).toBe("one");
    expect(result.points[0]).toEqual({ x: 0, y: 0 });
  });

  it("droite/cercle : deux points, tangence, aucun point", () => {
    const circle = { centre: { x: 0, y: 0 }, radius: 5 };
    expect(lineCircleIntersection({ point: { x: -10, y: 0 }, direction: { x: 1, y: 0 } }, circle).kind).toBe("two");
    expect(lineCircleIntersection({ point: { x: -10, y: 5 }, direction: { x: 1, y: 0 } }, circle).kind).toBe("tangent");
    expect(lineCircleIntersection({ point: { x: -10, y: 6 }, direction: { x: 1, y: 0 } }, circle).kind).toBe("none");
  });

  it("cercle/cercle : sécants, tangents, disjoints, confondus", () => {
    const c1 = { centre: { x: 0, y: 0 }, radius: 5 };
    expect(circleCircleIntersection(c1, { centre: { x: 8, y: 0 }, radius: 5 }).kind).toBe("two");
    expect(circleCircleIntersection(c1, { centre: { x: 10, y: 0 }, radius: 5 }).kind).toBe("tangent");
    expect(circleCircleIntersection(c1, { centre: { x: 20, y: 0 }, radius: 5 }).kind).toBe("none");
    expect(circleCircleIntersection(c1, { centre: { x: 0, y: 0 }, radius: 5 }).kind).toBe("coincident");
  });

  it("arc/arc : intersection restreinte au balayage angulaire", () => {
    // Cercles (0,0)/r5 et (6,0)/r5 : intersections des cercles complets en (3,4) et (3,-4).
    const arc1 = { centre: { x: 0, y: 0 }, radius: 5, startAngle: Math.PI / 6, endAngle: Math.PI / 2, counterClockwise: true };
    const arc2 = { centre: { x: 6, y: 0 }, radius: 5, startAngle: Math.PI / 2, endAngle: (5 * Math.PI) / 6, counterClockwise: true };
    const result = arcArcIntersection(arc1, arc2);
    expect(result.kind).toBe("one");
    expect(result.points[0].x).toBeCloseTo(3, 6);
    expect(result.points[0].y).toBeCloseTo(4, 6);
  });
});
