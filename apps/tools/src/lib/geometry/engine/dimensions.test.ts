import { describe, expect, it } from "vitest";
import { createAlignedDimension, createAngleDimension, createDiameterDimension, createRadiusDimension } from "./dimensions";

describe("cotations", () => {
  it("cote alignée mesure la distance réelle quelle que soit l'orientation", () => {
    const dim = createAlignedDimension({ x: 0, y: 0 }, { x: 30, y: 40 });
    expect(dim.value).toBe(50);
  });

  it("cotes de rayon et de diamètre d'un cercle", () => {
    const circle = { centre: { x: 0, y: 0 }, radius: 250 };
    expect(createRadiusDimension(circle).value).toBe(250);
    expect(createDiameterDimension(circle).value).toBe(500);
  });

  it("cote angulaire d'un angle droit", () => {
    const dim = createAngleDimension({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 });
    expect(dim.value).toBeCloseTo(90, 8);
  });
});
