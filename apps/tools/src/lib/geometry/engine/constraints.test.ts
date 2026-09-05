import { describe, expect, it } from "vitest";
import { constrainConcentric, constrainEqualRadius, constrainHorizontal, constrainPerpendicular, constrainVertical } from "./constraints";

describe("contraintes légères", () => {
  it("horizontal et vertical conservent la longueur", () => {
    const a = { x: 0, y: 0 };
    const h = constrainHorizontal(a, { x: 10, y: 5 });
    expect(h.y).toBe(0);
    expect(Math.hypot(h.x - a.x, h.y - a.y)).toBeCloseTo(Math.hypot(10, 5), 8);
    const v = constrainVertical(a, { x: 5, y: 10 });
    expect(v.x).toBe(0);
  });

  it("perpendiculaire tourne le segment cible à 90°", () => {
    const reference = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
    const target = constrainPerpendicular(reference, { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } });
    expect(target.end.x).toBeCloseTo(0, 8);
    expect(target.end.y).toBeCloseTo(10, 8);
  });

  it("concentrique et rayon égal", () => {
    const reference = { centre: { x: 5, y: 5 }, radius: 20 };
    const target = { centre: { x: 0, y: 0 }, radius: 8 };
    expect(constrainConcentric(reference, target)).toEqual({ centre: { x: 5, y: 5 }, radius: 8 });
    expect(constrainEqualRadius(reference, target)).toEqual({ centre: { x: 0, y: 0 }, radius: 20 });
  });
});
