import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createFlower4Geometry } from "./flower4";

describe("createFlower4Geometry — DECORATIVE-FAMILIES-V1 §15", () => {
  it("invariant 1 : 90° exactement entre deux directions consécutives", () => {
    const model = createFlower4Geometry({ diameter: 1200, rotation: 0 });
    const [O] = model.points;
    const directions = model.points.filter((p) => p.id.startsWith("D"));
    for (let index = 0; index < directions.length; index++) {
      const current = directions[index];
      const next = directions[(index + 1) % directions.length];
      let delta = ((Math.atan2(next.y - O.y, next.x - O.x) - Math.atan2(current.y - O.y, current.x - O.x)) * 180) / Math.PI;
      if (delta < 0) delta += 360;
      expect(delta).toBeCloseTo(90, 6);
    }
  });

  it("invariant 2 : distance centre -> chaque centre secondaire est constante", () => {
    const model = createFlower4Geometry({ diameter: 1200, rotation: 0 });
    const [O] = model.points;
    const centres = model.points.filter((p) => p.id.startsWith("C"));
    expect(centres).toHaveLength(4);
    const distances = centres.map((c) => distance(O, c));
    for (const value of distances) expect(value).toBeCloseTo(distances[0], 6);
  });

  it("4 pétales de même rayon", () => {
    const model = createFlower4Geometry({ diameter: 1200 });
    const petals = model.circles.filter((c) => c.id.startsWith("petal-"));
    expect(petals).toHaveLength(4);
    for (const petal of petals) expect(petal.radius).toBeCloseTo(300, 8);
  });

  it("mise à l'échelle : 1200 / 2400 / 3600 mm", () => {
    for (const diameter of [1200, 2400, 3600]) {
      const model = createFlower4Geometry({ diameter });
      expect(model.quantities.find((q) => q.id === "q-petal-radius")?.value).toBeCloseTo(diameter / 4, 8);
    }
  });

  it("vue tracé final uniquement : les pétales + centre restent complets sans les auxiliaires de construction", () => {
    const model = createFlower4Geometry({ diameter: 1200 });
    const finalEntities = model.circles.filter((c) => c.role !== "construction");
    // 4 pétales + le petit cercle central = 5 entités "shape", indépendantes des cercles de
    // construction (directeur + orbite des centres), qui peuvent être masqués sans rien perdre
    // de la silhouette finale.
    expect(finalEntities).toHaveLength(5);
    expect(finalEntities.every((c) => c.role === "shape")).toBe(true);
  });

  it("aucune valeur NaN ni Infinity", () => {
    const model = createFlower4Geometry({ diameter: 1200 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });

  it("explication réellement renseignée", () => {
    const model = createFlower4Geometry();
    expect(model.explanation?.objective).toBeTruthy();
    expect(model.explanation?.steps?.length).toBeGreaterThan(0);
  });

  it("refuse un diamètre invalide", () => {
    expect(() => createFlower4Geometry({ diameter: 0 })).toThrow();
    expect(() => createFlower4Geometry({ diameter: -10 })).toThrow();
  });
});
