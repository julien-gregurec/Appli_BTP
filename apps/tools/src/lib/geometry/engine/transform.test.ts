import { describe, expect, it } from "vitest";
import { applyTransform, compose, mirrorAxis, mirrorHorizontal, mirrorVertical, rotation, rotationAround, scaleAround, scaleUniform, translation } from "./transform";

describe("transformations 2D", () => {
  it("translate un point", () => {
    expect(applyTransform(translation(10, -5), { x: 1, y: 1 })).toEqual({ x: 11, y: -4 });
  });

  it("fait pivoter un point de 90° autour de l'origine", () => {
    const p = applyTransform(rotation(Math.PI / 2), { x: 10, y: 0 });
    expect(p.x).toBeCloseTo(0, 8);
    expect(p.y).toBeCloseTo(10, 8);
  });

  it("fait pivoter un point autour d'un centre arbitraire", () => {
    const p = applyTransform(rotationAround({ x: 5, y: 5 }, Math.PI), { x: 10, y: 5 });
    expect(p.x).toBeCloseTo(0, 8);
    expect(p.y).toBeCloseTo(5, 8);
  });

  it("met à l'échelle autour d'un centre", () => {
    const p = applyTransform(scaleAround({ x: 0, y: 0 }, 2), { x: 3, y: 4 });
    expect(p).toEqual({ x: 6, y: 8 });
  });

  it("symétrie horizontale et verticale", () => {
    expect(applyTransform(mirrorHorizontal(0), { x: 5, y: 5 })).toEqual({ x: 5, y: -5 });
    expect(applyTransform(mirrorVertical(0), { x: 5, y: 5 })).toEqual({ x: -5, y: 5 });
  });

  it("symétrie selon un axe arbitraire à 45°", () => {
    const p = applyTransform(mirrorAxis({ x: 0, y: 0 }, { x: 1, y: 1 }), { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(0, 8);
    expect(p.y).toBeCloseTo(1, 8);
  });

  it("compose deux transformations dans le bon ordre", () => {
    const t = compose(translation(10, 0), rotation(Math.PI / 2));
    const p = applyTransform(t, { x: 1, y: 0 });
    expect(p.x).toBeCloseTo(10, 8);
    expect(p.y).toBeCloseTo(1, 8);
  });

  it("mise à l'échelle uniforme conserve les proportions", () => {
    expect(applyTransform(scaleUniform(3), { x: 2, y: 2 })).toEqual({ x: 6, y: 6 });
  });
});
