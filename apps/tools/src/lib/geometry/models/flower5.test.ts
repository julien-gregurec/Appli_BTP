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

  it("C5-CLEANUP-V1 §2 : toutes les étapes viennent d'Engine B — ids et ordre du générateur `createRosette`, aucun SiteStep recomposé localement", () => {
    const model = createFlower5Geometry({ diameter: 1200 });
    expect(model.steps.map((s) => s.id)).toEqual(["step-centre", "step-director-circle", "step-divide", "step-elements", "step-centre-circle", "step-check"]);
    // L'étape du cercle central référence l'entité "shape" réellement produite par Engine B
    // (résolue par valeur), jamais une géométrie matérialisée une seconde fois.
    const step = model.steps.find((s) => s.id === "step-centre-circle")!;
    const central = model.circles.find((c) => Math.abs(c.radius - 105) < 1e-6)!;
    expect(central.role).toBe("shape");
    expect(step.visibleEntityIds).toEqual([central.id]);
    expect(step.pointIds).toEqual(["O"]);
    expect(model.steps.map((s) => s.title)).toContain("Tracer le cercle central");
  });

  it("aucune valeur NaN ni Infinity", () => {
    const model = createFlower5Geometry({ diameter: 1200 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });

  it("refuse un diamètre invalide", () => {
    expect(() => createFlower5Geometry({ diameter: 0 })).toThrow();
    expect(() => createFlower5Geometry({ diameter: Number.NaN })).toThrow();
  });

  it("ENGINE-B-STEP-MEASUREMENTS-V1 §4 : le cercle central publie sa mesure chantier, dérivée du diamètre saisi", () => {
    const model = createFlower5Geometry({ diameter: 1200 });
    // R pétale = 1200/4 = 300 ; cercle central = 300 × 0,35 = 105 mm — la mesure historique.
    expect(model.steps.find((s) => s.id === "step-centre-circle")?.measurements).toEqual(["105.0 mm"]);
    expect(createFlower5Geometry({ diameter: 2400 }).steps.find((s) => s.id === "step-centre-circle")?.measurements).toEqual(["210.0 mm"]);
  });

  it("les mesures chantier restent celles d'Engine B : une par étape mesurable, aucune duplication, aucune sur les étapes non mesurables", () => {
    const model = createFlower5Geometry({ diameter: 1200 });
    expect(model.steps.map((s) => [s.id, s.measurements])).toEqual([
      ["step-centre", []],
      ["step-director-circle", ["300.0 mm"]],
      ["step-divide", ["72.00°"]],
      ["step-elements", ["300.0 mm"]],
      ["step-centre-circle", ["105.0 mm"]],
      ["step-check", []],
    ]);
  });
});
