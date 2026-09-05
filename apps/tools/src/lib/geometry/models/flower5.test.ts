import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createFlower5Geometry } from "./flower5";

// C4-LOT3-ROSETTES-V1 : mêmes invariants qu'en DECORATIVE-FAMILIES-V1 §15, mêmes conventions que
// flower4.test.ts (voir ce fichier pour le détail du changement d'id "D" -> "C").
describe("createFlower5Geometry — C4-LOT3 (Engine B)", () => {
  it("invariant 1 : 72° exactement entre deux centres de pétales consécutifs", () => {
    const model = createFlower5Geometry({ diameter: 1200, rotation: 0 });
    const O = model.points.find((p) => p.id === "O")!;
    const centres = model.points.filter((p) => /^C\d+$/.test(p.id));
    expect(centres).toHaveLength(5);
    for (let index = 0; index < centres.length; index++) {
      const current = centres[index];
      const next = centres[(index + 1) % centres.length];
      let delta = ((Math.atan2(next.y - O.y, next.x - O.x) - Math.atan2(current.y - O.y, current.x - O.x)) * 180) / Math.PI;
      if (delta < 0) delta += 360;
      expect(delta).toBeCloseTo(72, 6);
    }
  });

  it("invariant 2 : cinq pétales géométriquement identiques (même rayon, même distance à O)", () => {
    const model = createFlower5Geometry({ diameter: 1200 });
    const O = model.points.find((p) => p.id === "O")!;
    const petals = model.circles.filter((c) => c.role !== "construction" && Math.abs(c.radius - 300) < 1e-6);
    expect(petals).toHaveLength(5);
    for (const petal of petals) expect(distance(O, petal.centre)).toBeCloseTo(300, 8);
  });

  it("mise à l'échelle : 1200 / 2400 / 3600 mm", () => {
    for (const diameter of [1200, 2400, 3600]) {
      const model = createFlower5Geometry({ diameter });
      expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(diameter / 4, 8);
    }
  });

  it("vue tracé final : pétales + centre seulement, indépendants des cercles de construction", () => {
    const model = createFlower5Geometry({ diameter: 1200 });
    const finalEntities = model.circles.filter((c) => c.role !== "construction");
    expect(finalEntities).toHaveLength(6);
  });

  it("encombrement réel = diamètre saisi exactement (pétales inscrits, aucun dépassement)", () => {
    const model = createFlower5Geometry({ diameter: 1200 });
    const O = model.points.find((p) => p.id === "O")!;
    const petals = model.circles.filter((c) => c.role !== "construction" && Math.abs(c.radius - 300) < 1e-6);
    for (const petal of petals) expect(distance(O, petal.centre) + petal.radius).toBeCloseTo(600, 6);
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
