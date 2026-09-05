import { describe, expect, it } from "vitest";
import { distance, point, type Line } from "./primitives";
import { reflect, repeatRadial, scale } from "./transforms";

describe("scale — ENGINE-FOUNDATION-V1", () => {
  it("×2 double toutes les distances au centre", () => {
    const O = point("O", 0, 0);
    const A = point("A", 100, 50);
    const scaled = scale(A, O, 2);
    expect(distance(O, scaled)).toBeCloseTo(distance(O, A) * 2, 8);
    expect(scaled).toMatchObject({ x: 200, y: 100 });
  });

  it("×1 laisse le point inchangé, ×-1 produit une symétrie centrale", () => {
    const O = point("O", 10, 10);
    const A = point("A", 30, 10);
    expect(scale(A, O, 1)).toMatchObject({ x: 30, y: 10 });
    expect(scale(A, O, -1)).toMatchObject({ x: -10, y: 10 });
  });

  it("refuse un facteur non fini", () => {
    expect(() => scale(point("A", 1, 1), point("O", 0, 0), Number.NaN)).toThrow();
  });
});

describe("reflect — ENGINE-FOUNDATION-V1", () => {
  it("réfléchit un point par rapport à l'axe des X (droite y=0)", () => {
    const axisX: Line = { id: "axis-x", point: point("O", 0, 0), direction: { x: 1, y: 0 } };
    const reflected = reflect(point("A", 30, 40), axisX);
    expect(reflected).toMatchObject({ x: 30, y: -40 });
  });

  it("réfléchit un point par rapport à l'axe des Y (droite x=0)", () => {
    const axisY: Line = { id: "axis-y", point: point("O", 0, 0), direction: { x: 0, y: 1 } };
    const reflected = reflect(point("A", 30, 40), axisY);
    expect(reflected).toMatchObject({ x: -30, y: 40 });
  });

  it("un point déjà sur l'axe reste inchangé", () => {
    const axisX: Line = { id: "axis-x", point: point("O", 0, 0), direction: { x: 1, y: 0 } };
    const onAxis = point("A", 15, 0);
    const reflected = reflect(onAxis, axisX);
    expect(reflected.x).toBeCloseTo(15, 8);
    expect(reflected.y).toBeCloseTo(0, 8);
  });

  it("réfléchir deux fois redonne le point de départ", () => {
    const axis: Line = { id: "axis", point: point("O", 5, 5), direction: { x: 1, y: 1 } };
    const A = point("A", 20, -3);
    const twice = reflect(reflect(A, axis, "A1"), axis, "A2");
    expect(twice.x).toBeCloseTo(A.x, 6);
    expect(twice.y).toBeCloseTo(A.y, 6);
  });
});

describe("repeatRadial — ENGINE-FOUNDATION-V1", () => {
  it("génère des angles réguliers autour du centre", () => {
    const O = point("O", 0, 0);
    const source = point("S", 100, 0);
    const copies = repeatRadial(source, O, 6);
    expect(copies).toHaveLength(6);
    for (const item of copies) expect(distance(O, item)).toBeCloseTo(100, 8);
    const angle0 = Math.atan2(copies[0].y, copies[0].x);
    const angle1 = Math.atan2(copies[1].y, copies[1].x);
    expect(((angle1 - angle0) * 180) / Math.PI).toBeCloseTo(60, 8);
  });

  it("refuse un nombre de répétitions invalide", () => {
    const O = point("O", 0, 0);
    const S = point("S", 10, 0);
    expect(() => repeatRadial(S, O, 0)).toThrow();
    expect(() => repeatRadial(S, O, 2.5)).toThrow();
  });
});
