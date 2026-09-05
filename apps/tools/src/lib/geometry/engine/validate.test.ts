import { describe, expect, it } from "vitest";
import { createCircle } from "./basic-shapes";
import { emptyPrimitives, type ParametricShape } from "./model";
import { hasSelfIntersection, validateGeometry } from "./validate";

function baseShape(overrides: Partial<ParametricShape> = {}): ParametricShape {
  return {
    id: "test",
    type: "test",
    parameters: {},
    primitives: emptyPrimitives(),
    boundingBox: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
    centre: { x: 0, y: 0 },
    width: 200,
    height: 200,
    rotation: 0,
    metadata: {},
    constructionSteps: [],
    quality: "exact",
    ...overrides,
  };
}

describe("validation géométrique", () => {
  it("une forme valide ne remonte aucune erreur", () => {
    expect(validateGeometry(createCircle({ radius: 100 }))).toHaveLength(0);
  });

  it("détecte un rayon négatif ou nul", () => {
    const shape = baseShape();
    shape.primitives.circles.push({ centre: { x: 0, y: 0 }, radius: -10 });
    const errors = validateGeometry(shape);
    expect(errors.some((e) => e.code === "invalid-radius")).toBe(true);
  });

  it("détecte des points confondus", () => {
    const shape = baseShape();
    shape.primitives.points = { A: { x: 0, y: 0 }, B: { x: 0, y: 0 } };
    const errors = validateGeometry(shape);
    expect(errors.some((e) => e.code === "duplicate-points")).toBe(true);
  });

  it("détecte une auto-intersection (quadrilatère papillon)", () => {
    const bowtie = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }];
    expect(hasSelfIntersection(bowtie, true)).toBe(true);
    expect(hasSelfIntersection([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], true)).toBe(false);
  });

  it("détecte un arc incohérent (balayage nul)", () => {
    const shape = baseShape();
    shape.primitives.arcs.push({ centre: { x: 0, y: 0 }, radius: 50, startAngle: 1, endAngle: 1 });
    const errors = validateGeometry(shape);
    expect(errors.some((e) => e.code === "incoherent-arc")).toBe(true);
  });

  it("détecte une valeur non finie", () => {
    const shape = baseShape();
    shape.primitives.points = { A: { x: Number.NaN, y: 0 } };
    const errors = validateGeometry(shape);
    expect(errors.some((e) => e.code === "non-finite-value")).toBe(true);
  });
});
