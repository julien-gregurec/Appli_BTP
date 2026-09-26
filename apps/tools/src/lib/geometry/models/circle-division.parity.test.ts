import { describe, expect, it } from "vitest";
import { createCircleDivisionGeometry } from "./circle-division";

/**
 * C4-LOT1-V1 §5 — Parité avant/après migration de `circle-division` vers Engine B.
 *
 * Fixtures « golden » capturées sur l'implémentation historique (formule locale dans
 * `models/circle-division.ts`, avant migration) : coordonnées attendues, figées, pour deux jeux
 * de paramètres. Aucune seconde formule active — uniquement des valeurs de référence.
 */
type V = { x: number; y: number };

const GOLDEN: Record<"A" | "B", { input: { diameter: number; divisions: number; startAngle: number }; pts: V[] }> = {
  A: {
    input: { diameter: 2000, divisions: 6, startAngle: 0 },
    pts: [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 500.0000000000001, y: 866.0254037844386 },
      { x: -499.9999999999998, y: 866.0254037844387 },
      { x: -1000, y: 1.2246467991473532e-13 },
      { x: -500.00000000000045, y: -866.0254037844385 },
      { x: 499.9999999999993, y: -866.025403784439 },
    ],
  },
  B: {
    input: { diameter: 2400, divisions: 12, startAngle: 30 },
    pts: [
      { x: 0, y: 0 },
      { x: 1039.2304845413264, y: 599.9999999999999 },
      { x: 600.0000000000001, y: 1039.2304845413264 },
      { x: 7.347880794884119e-14, y: 1200 },
      { x: -599.9999999999998, y: 1039.2304845413264 },
      { x: -1039.2304845413262, y: 600.0000000000005 },
      { x: -1200, y: 6.798646677177575e-13 },
      { x: -1039.2304845413266, y: -599.9999999999997 },
      { x: -600.0000000000006, y: -1039.2304845413262 },
      { x: -2.2043642384652357e-13, y: -1200 },
      { x: 600.0000000000001, y: -1039.2304845413264 },
      { x: 1039.230484541326, y: -600.0000000000006 },
      { x: 1200, y: -2.9391523179536476e-13 },
    ],
  },
};

describe.each(["A", "B"] as const)("parité circle-division — jeu %s", (key) => {
  const { input, pts: golden } = GOLDEN[key];

  it("les points (centre + divisions) reproduisent le golden au flottant près", () => {
    const model = createCircleDivisionGeometry(input);
    expect(model.points).toHaveLength(golden.length);
    golden.forEach((g, i) => {
      expect(model.points[i].x).toBeCloseTo(g.x, 9);
      expect(model.points[i].y).toBeCloseTo(g.y, 9);
    });
  });

  it("rayon constant conforme au golden", () => {
    const model = createCircleDivisionGeometry(input);
    const O = model.points[0];
    const expectedRadius = input.diameter / 2;
    for (const p of model.points.slice(1)) {
      expect(Math.hypot(p.x - O.x, p.y - O.y)).toBeCloseTo(expectedRadius, 6);
    }
  });
});
