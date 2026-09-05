import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createFlower5Geometry } from "./flower5";

describe("createFlower5Geometry — DECORATIVE-FAMILIES-V1 §15", () => {
  it("invariant 1 : 72° exactement entre deux directions consécutives", () => {
    const model = createFlower5Geometry({ diameter: 1200, rotation: 0 });
    const [O] = model.points;
    const directions = model.points.filter((p) => p.id.startsWith("D"));
    expect(directions).toHaveLength(5);
    for (let index = 0; index < directions.length; index++) {
      const current = directions[index];
      const next = directions[(index + 1) % directions.length];
      let delta = ((Math.atan2(next.y - O.y, next.x - O.x) - Math.atan2(current.y - O.y, current.x - O.x)) * 180) / Math.PI;
      if (delta < 0) delta += 360;
      expect(delta).toBeCloseTo(72, 6);
    }
  });

  it("invariant 2 : cinq pétales géométriquement identiques (même rayon, même distance à O)", () => {
    const model = createFlower5Geometry({ diameter: 1200 });
    const [O] = model.points;
    const petals = model.circles.filter((c) => c.id.startsWith("petal-"));
    expect(petals).toHaveLength(5);
    for (const petal of petals) {
      expect(petal.radius).toBeCloseTo(300, 8);
      expect(distance(O, petal.centre)).toBeCloseTo(300, 8);
    }
  });

  it("mise à l'échelle : 1200 / 2400 / 3600 mm", () => {
    for (const diameter of [1200, 2400, 3600]) {
      const model = createFlower5Geometry({ diameter });
      expect(model.quantities.find((q) => q.id === "q-petal-radius")?.value).toBeCloseTo(diameter / 4, 8);
    }
  });

  it("vue tracé final : pétales + centre seulement, indépendants des cercles de construction", () => {
    const model = createFlower5Geometry({ diameter: 1200 });
    const finalEntities = model.circles.filter((c) => c.role !== "construction");
    expect(finalEntities).toHaveLength(6);
  });

  it("aucune valeur NaN ni Infinity", () => {
    const model = createFlower5Geometry({ diameter: 1200 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });

  it("refuse un diamètre invalide", () => {
    expect(() => createFlower5Geometry({ diameter: 0 })).toThrow();
    expect(() => createFlower5Geometry({ diameter: Number.NaN })).toThrow();
  });
});
