import { describe, expect, it } from "vitest";
import { angleAtVertex, arcLength, boundsFromPoints, chordLength, distance, midpoint, perpendicularBisector, polylineLength, projectOntoLine, sagitta, segmentLength } from "./measure";

describe("mesures géométriques", () => {
  it("calcule distance et milieu", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });

  it("calcule l'angle au sommet d'un triangle rectangle", () => {
    const angle = angleAtVertex({ x: 10, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 10 });
    expect(angle.degrees).toBeCloseTo(90, 8);
  });

  it("projette un point sur une droite", () => {
    const p = projectOntoLine({ x: 5, y: 5 }, { point: { x: 0, y: 0 }, direction: { x: 1, y: 0 } });
    expect(p).toEqual({ x: 5, y: 0 });
  });

  it("calcule la médiatrice d'un segment", () => {
    const bisector = perpendicularBisector({ x: 0, y: 0 }, { x: 10, y: 0 });
    expect(bisector.point).toEqual({ x: 5, y: 0 });
    expect(bisector.direction.x).toBeCloseTo(0, 8);
  });

  it("longueur de segment et de polyligne", () => {
    expect(segmentLength({ start: { x: 0, y: 0 }, end: { x: 3, y: 4 } })).toBe(5);
    expect(polylineLength({ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }] })).toBe(20);
    expect(polylineLength({ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], closed: true })).toBeCloseTo(20 + Math.hypot(10, 10), 8);
  });

  it("longueur d'arc pour un quart de cercle de rayon 1000", () => {
    const length = arcLength({ centre: { x: 0, y: 0 }, radius: 1000, startAngle: 0, endAngle: Math.PI / 2, counterClockwise: true });
    expect(length).toBeCloseTo((Math.PI / 2) * 1000, 8);
  });

  it("corde et flèche connues (rayon 1000, corde 1600 → flèche 400)", () => {
    expect(sagitta(1000, 1600)).toBeCloseTo(400, 8);
    expect(chordLength(1000, 2 * Math.acos(0.6))).toBeCloseTo(1600, 6);
  });

  it("bounding box avec marge", () => {
    const bounds = boundsFromPoints([{ x: -5, y: 2 }, { x: 10, y: -3 }], 1);
    expect(bounds).toEqual({ minX: -6, minY: -4, maxX: 11, maxY: 3 });
  });
});
