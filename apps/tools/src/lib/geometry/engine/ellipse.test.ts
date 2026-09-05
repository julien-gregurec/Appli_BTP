import { describe, expect, it } from "vitest";
import { createEllipse } from "./ellipse";
import { distance } from "./measure";

describe("ellipse générique (createEllipse)", () => {
  it("a, b, c corrects pour width >= height (jeu A)", () => {
    const shape = createEllipse({ width: 2400, height: 1600 });
    expect(shape.metadata.a).toBeCloseTo(1200, 9);
    expect(shape.metadata.b).toBeCloseTo(800, 9);
    expect(shape.metadata.c).toBeCloseTo(Math.sqrt(1200 ** 2 - 800 ** 2), 9);
  });

  it("permutation d'axe : height > width place les foyers sur l'axe vertical", () => {
    const shape = createEllipse({ width: 800, height: 1800 });
    expect(shape.metadata.majorAlongX).toBe(false);
    const F1 = shape.primitives.points.F1;
    const F2 = shape.primitives.points.F2;
    expect(F1.x).toBeCloseTo(0, 9);
    expect(F2.x).toBeCloseTo(0, 9);
    expect(Math.abs(F1.y)).toBeCloseTo(shape.metadata.c as number, 9);
  });

  it("cas cercle (width === height) : c = 0, foyers confondus avec O", () => {
    const shape = createEllipse({ width: 1000, height: 1000 });
    expect(shape.metadata.c).toBeCloseTo(0, 9);
    const O = shape.primitives.points.O;
    const F1 = shape.primitives.points.F1;
    const F2 = shape.primitives.points.F2;
    expect(distance(O, F1)).toBeCloseTo(0, 9);
    expect(distance(O, F2)).toBeCloseTo(0, 9);
  });

  it("invariant : F1/F2 symétriques par rapport à O", () => {
    const shape = createEllipse({ width: 2400, height: 1600 });
    const O = shape.primitives.points.O;
    const F1 = shape.primitives.points.F1;
    const F2 = shape.primitives.points.F2;
    expect(F1.x - O.x).toBeCloseTo(-(F2.x - O.x), 9);
    expect(F1.y - O.y).toBeCloseTo(-(F2.y - O.y), 9);
  });

  it("invariant : c² = a² − b² exactement", () => {
    const shape = createEllipse({ width: 3000, height: 700 });
    const { a, b, c } = shape.metadata as { a: number; b: number; c: number };
    expect(c ** 2).toBeCloseTo(a ** 2 - b ** 2, 6);
  });

  it("invariant : somme des distances aux foyers = 2a pour plusieurs points du contour", () => {
    const shape = createEllipse({ width: 2400, height: 1600 });
    const { a } = shape.metadata as { a: number };
    const ellipse = shape.primitives.ellipses[0];
    const F1 = shape.primitives.points.F1;
    const F2 = shape.primitives.points.F2;
    for (const t of [0, Math.PI / 6, Math.PI / 3, Math.PI / 2, Math.PI, 1.7, 4.2]) {
      const p = { x: ellipse.centre.x + ellipse.radiusX * Math.cos(t), y: ellipse.centre.y + ellipse.radiusY * Math.sin(t) };
      expect(distance(p, F1) + distance(p, F2)).toBeCloseTo(2 * a, 6);
    }
  });

  it("aucune valeur NaN ni Infinity, y compris pour le cas cercle", () => {
    const shape = createEllipse({ width: 900, height: 900 });
    expect(/NaN|Infinity/.test(JSON.stringify(shape))).toBe(false);
  });

  it("rotation optionnelle : tourne l'ellipse et ses foyers ensemble, inutilisée si absente", () => {
    const flat = createEllipse({ width: 2400, height: 1600 });
    const rotated = createEllipse({ width: 2400, height: 1600, rotationDegrees: 30 });
    expect(flat.rotation).toBeCloseTo(0, 9);
    expect(rotated.rotation).toBeCloseTo((30 * Math.PI) / 180, 9);
    const O = rotated.primitives.points.O;
    const F1 = rotated.primitives.points.F1;
    const angle = Math.atan2(F1.y - O.y, F1.x - O.x);
    // Foyer sur le grand axe (horizontal, majorAlongX) tourné de 30° -> attendu à 180° (ou -150°) + 30°.
    const expectedAngle = Math.PI + (30 * Math.PI) / 180;
    const diff = Math.atan2(Math.sin(angle - expectedAngle), Math.cos(angle - expectedAngle));
    expect(Math.abs(diff)).toBeLessThan(1e-9);
  });

  it("bounds exacts quand rotation = 0", () => {
    const shape = createEllipse({ width: 2400, height: 1600 });
    expect(shape.boundingBox).toEqual({ minX: -1200, minY: -800, maxX: 1200, maxY: 800 });
  });

  it("refuse une largeur ou une hauteur invalide", () => {
    expect(() => createEllipse({ width: 0, height: 100 })).toThrow();
    expect(() => createEllipse({ width: 100, height: -1 })).toThrow();
    expect(() => createEllipse({ width: Number.NaN, height: 100 })).toThrow();
  });
});
