import { describe, expect, it } from "vitest";
import { distance } from "../primitives";
import { createFlower4Geometry } from "./flower4";

// C4-LOT3-ROSETTES-V1 : mêmes invariants qu'en DECORATIVE-FAMILIES-V1 §15, contrôlés sur la
// sortie désormais produite via Engine B (`createRosette`, mode classique) puis le pont
// `parametricShapeToTraceModel`. Schéma d'identifiants : centre "O", centres de pétales "C1..C4"
// (remplace les anciens points "D" — mêmes positions angulaires, seul le rayon diffère : les "D"
// historiques étaient sur le cercle directeur, les pétales sont centrés à mi-rayon).
describe("createFlower4Geometry — C4-LOT3 (Engine B)", () => {
  it("invariant 1 : 90° exactement entre deux centres de pétales consécutifs", () => {
    const model = createFlower4Geometry({ diameter: 1200, rotation: 0 });
    const O = model.points.find((p) => p.id === "O")!;
    const centres = model.points.filter((p) => /^C\d+$/.test(p.id));
    expect(centres).toHaveLength(4);
    for (let index = 0; index < centres.length; index++) {
      const current = centres[index];
      const next = centres[(index + 1) % centres.length];
      let delta = ((Math.atan2(next.y - O.y, next.x - O.x) - Math.atan2(current.y - O.y, current.x - O.x)) * 180) / Math.PI;
      if (delta < 0) delta += 360;
      expect(delta).toBeCloseTo(90, 6);
    }
  });

  it("invariant 2 : distance centre -> chaque centre secondaire est constante", () => {
    const model = createFlower4Geometry({ diameter: 1200, rotation: 0 });
    const O = model.points.find((p) => p.id === "O")!;
    const centres = model.points.filter((p) => /^C\d+$/.test(p.id));
    const distances = centres.map((c) => distance(O, c));
    for (const value of distances) expect(value).toBeCloseTo(distances[0], 6);
  });

  it("4 pétales de même rayon (R/2)", () => {
    const model = createFlower4Geometry({ diameter: 1200 });
    // Un cercle directeur intermédiaire (rayon 300 lui aussi, centré en O) est matérialisé en
    // construction depuis l'étape Engine B correspondante — exclu ici par rôle, distinct des 4
    // pétales (centrés hors de O).
    const petals = model.circles.filter((c) => c.role !== "construction" && Math.abs(c.radius - 300) < 1e-6);
    expect(petals).toHaveLength(4);
  });

  it("mise à l'échelle : 1200 / 2400 / 3600 mm", () => {
    for (const diameter of [1200, 2400, 3600]) {
      const model = createFlower4Geometry({ diameter });
      expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(diameter / 4, 8);
      expect(model.dimensions.find((d) => d.id === "dim-diameter")?.value).toBeCloseTo(diameter, 8);
    }
  });

  it("encombrement réel = diamètre saisi exactement (pétales inscrits, aucun dépassement)", () => {
    const model = createFlower4Geometry({ diameter: 1200 });
    const O = model.points.find((p) => p.id === "O")!;
    // Chaque pétale est tangent intérieurement au cercle directeur : centre + rayon = outerRadius.
    const petals = model.circles.filter((c) => c.role !== "construction" && Math.abs(c.radius - 300) < 1e-6);
    for (const petal of petals) expect(distance(O, petal.centre) + petal.radius).toBeCloseTo(600, 6);
  });

  it("vue tracé final uniquement : les pétales + centre restent complets sans les auxiliaires de construction", () => {
    const model = createFlower4Geometry({ diameter: 1200 });
    const finalEntities = model.circles.filter((c) => c.role !== "construction");
    // 4 pétales + le petit cercle central = 5 entités "shape", indépendantes du cercle directeur
    // de construction (masqué par défaut).
    expect(finalEntities).toHaveLength(5);
    expect(finalEntities.every((c) => c.role === "shape")).toBe(true);
    expect(model.circles.some((c) => c.role === "construction" && Math.abs(c.radius - 600) < 1e-6)).toBe(true);
  });

  it("aucune valeur NaN ni Infinity", () => {
    const model = createFlower4Geometry({ diameter: 1200 });
    expect(/NaN|Infinity/.test(JSON.stringify(model))).toBe(false);
  });

  it("C5-CLEANUP-V1 §2 : toutes les étapes viennent d'Engine B — ids et ordre du générateur `createRosette`, aucun SiteStep recomposé localement", () => {
    const model = createFlower4Geometry({ diameter: 1200 });
    expect(model.steps.map((s) => s.id)).toEqual(["step-centre", "step-director-circle", "step-divide", "step-elements", "step-centre-circle", "step-check"]);
    // L'étape du cercle central référence l'entité "shape" réellement produite par Engine B
    // (résolue par valeur), jamais une géométrie matérialisée une seconde fois.
    const step = model.steps.find((s) => s.id === "step-centre-circle")!;
    const central = model.circles.find((c) => Math.abs(c.radius - 105) < 1e-6)!;
    expect(central.role).toBe("shape");
    expect(step.visibleEntityIds).toEqual([central.id]);
    expect(step.pointIds).toEqual(["O"]);
  });

  it("pas-à-pas : une étape dédiée au cercle central, avant le contrôle final", () => {
    const model = createFlower4Geometry({ diameter: 1200 });
    const titles = model.steps.map((s) => s.title);
    expect(titles).toContain("Tracer le cercle central");
    expect(titles.at(-1)?.toLowerCase()).toContain("contrôl");
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
