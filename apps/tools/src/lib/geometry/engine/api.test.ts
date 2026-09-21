import { describe, expect, it } from "vitest";
import { calculateArea, calculateLength, generateConstructionSteps, offsetShape, rotateShape, scaleShape } from "./api";
import { createArc, createCircle } from "./basic-shapes";
import { validateGeometry } from "./validate";
import { getReportPoints } from "./report";

describe("API publique du moteur", () => {
  it("calculateLength et calculateArea sur un cercle", () => {
    const circle = createCircle({ radius: 100 });
    expect(calculateLength(circle)).toBeCloseTo(2 * Math.PI * 100, 8);
    expect(calculateArea(circle)).toBeCloseTo(Math.PI * 100 ** 2, 8);
  });

  it("scaleShape et rotateShape préservent la cohérence géométrique", () => {
    const circle = createCircle({ centre: { x: 10, y: 0 }, radius: 50 });
    const scaled = scaleShape(circle, 2, { x: 0, y: 0 });
    expect(scaled.primitives.circles[0].radius).toBeCloseTo(100, 8);
    expect(scaled.centre.x).toBeCloseTo(20, 8);
    const rotated = rotateShape(circle, 90, { x: 0, y: 0 });
    expect(rotated.centre.x).toBeCloseTo(0, 6);
    expect(rotated.centre.y).toBeCloseTo(10, 6);
  });

  it("offsetShape agrandit un cercle du montant demandé", () => {
    const circle = createCircle({ radius: 100 });
    const offset = offsetShape(circle, 25);
    expect(offset.primitives.circles[0].radius).toBe(125);
  });

  it("generateConstructionSteps et getReportPoints exposent des données exploitables", () => {
    const arc = createArc({ radius: 500, startAngleDegrees: 0, endAngleDegrees: 90 });
    expect(generateConstructionSteps(arc).length).toBeGreaterThan(0);
    const rows = getReportPoints(arc, { x: 0, y: 0 });
    expect(rows.find((r) => r.id === "start")?.distanceFromOrigin).toBeCloseTo(500, 6);
    expect(validateGeometry(arc)).toHaveLength(0);
  });
});
