import { describe, expect, it } from "vitest";
import { offsetArc, offsetCircle, offsetPolyline, offsetSegment } from "./offset";

describe("offset / décalage", () => {
  it("décale un cercle et refuse un rayon résultant négatif ou nul", () => {
    expect(offsetCircle({ centre: { x: 0, y: 0 }, radius: 100 }, 20).radius).toBe(120);
    expect(offsetCircle({ centre: { x: 0, y: 0 }, radius: 100 }, -20).radius).toBe(80);
    expect(() => offsetCircle({ centre: { x: 0, y: 0 }, radius: 100 }, -150)).toThrow();
  });

  it("décale un arc en conservant son centre et ses angles", () => {
    const arc = offsetArc({ centre: { x: 0, y: 0 }, radius: 500, startAngle: 0, endAngle: Math.PI / 2 }, -50);
    expect(arc.radius).toBe(450);
    expect(arc.startAngle).toBe(0);
  });

  it("décale un segment perpendiculairement à sa direction", () => {
    const offset = offsetSegment({ start: { x: 0, y: 0 }, end: { x: 100, y: 0 } }, 10);
    expect(offset.start).toEqual({ x: 0, y: 10 });
    expect(offset.end).toEqual({ x: 100, y: 10 });
  });

  it("décale un carré fermé vers l'intérieur avec jonction d'onglet exacte", () => {
    const square = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], closed: true };
    const inset = offsetPolyline(square, 10);
    expect(inset.points).toEqual([{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 90 }, { x: 10, y: 90 }]);
  });

  it("lève une erreur explicite quand l'offset auto-intersecte le contour", () => {
    const square = { points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], closed: true };
    expect(() => offsetPolyline(square, 60)).toThrow();
  });
});
