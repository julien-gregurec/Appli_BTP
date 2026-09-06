import { describe, expect, it } from "vitest";
import "./basic-shapes";
import "./polygons";
import { buildParametricShape, deserializeShape, serializeShape } from "./model";

describe("modèle paramétrique et registre", () => {
  it("reconstruit une géométrie à partir du type et des paramètres", () => {
    const shape = buildParametricShape("circle", { radius: 250 });
    expect(shape.primitives.circles[0].radius).toBe(250);
  });

  it("un changement de paramètre reconstruit intégralement la géométrie", () => {
    const small = buildParametricShape("regularPolygon", { sides: 6, radius: 100 });
    const big = buildParametricShape("regularPolygon", { sides: 6, radius: 200 });
    expect(big.primitives.polygons[0].points[0].x).toBeCloseTo(small.primitives.polygons[0].points[0].x * 2, 6);
  });

  it("refuse un type de forme inconnu", () => {
    expect(() => buildParametricShape("does-not-exist", {})).toThrow();
  });

  it("sérialise et recharge une forme sans perte de fidélité géométrique", () => {
    const original = buildParametricShape("circle", { radius: 123 });
    const reloaded = deserializeShape(serializeShape(original));
    expect(reloaded.primitives.circles[0].radius).toBe(123);
  });
});
