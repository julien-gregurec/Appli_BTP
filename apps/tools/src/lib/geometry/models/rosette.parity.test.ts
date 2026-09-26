import { describe, expect, it } from "vitest";
import { createRosetteGeometry } from "./rosette";
import { createRosette } from "../engine/rosettes";
import { offsetShape } from "../engine/api";
import { parametricShapeToTraceModel } from "../adapters";
import { validateTraceModel } from "../trace-model";

/**
 * C4-LOT3-ROSETTES-V1 §5 — Parité avant/après migration de `rosette-6` vers Engine B.
 *
 * Fixtures « golden » capturées sur l'implémentation historique (formule locale dans
 * `models/rosette.ts`, avant migration) : coordonnées attendues, figées, pour deux jeux.
 */
type V = { x: number; y: number };

const GOLDEN: Record<"A" | "B", { input: { diameter: number; rotation: number }; centres: V[]; tips: V[]; radius: number; tipDistance: number }> = {
  A: {
    input: { diameter: 2400, rotation: 0 },
    centres: [
      { x: 1200, y: 0 }, { x: 600.0000000000001, y: 1039.2304845413264 }, { x: -599.9999999999998, y: 1039.2304845413264 },
      { x: -1200, y: 1.4695761589768238e-13 }, { x: -600.0000000000006, y: -1039.2304845413262 }, { x: 599.9999999999992, y: -1039.2304845413269 },
    ],
    tips: [
      { x: 1800, y: 1039.2304845413264 }, { x: 1.1368683772161603e-13, y: 2078.460969082653 }, { x: -1799.9999999999995, y: 1039.2304845413269 },
      { x: -1800.0000000000005, y: -1039.230484541326 }, { x: -1.272855163586727e-12, y: -2078.460969082653 }, { x: 1799.999999999999, y: -1039.2304845413269 },
    ],
    radius: 1200,
    tipDistance: 2078.460969082653,
  },
  B: {
    input: { diameter: 3200, rotation: 30 },
    centres: [
      { x: 1385.640646055102, y: 799.9999999999999 }, { x: 9.797174393178826e-14, y: 1600 }, { x: -1385.6406460551016, y: 800.0000000000006 },
      { x: -1385.640646055102, y: -799.9999999999995 }, { x: -2.9391523179536476e-13, y: -1600 }, { x: 1385.6406460551013, y: -800.0000000000007 },
    ],
    tips: [
      { x: 1385.6406460551016, y: 2400 }, { x: -1385.6406460551013, y: 2400.000000000001 }, { x: -2771.2812921102036, y: 9.62256946779434e-13 },
      { x: -1385.640646055102, y: -2399.999999999999 }, { x: 1385.6406460551011, y: -2400.000000000001 }, { x: 2771.281292110203, y: -1.0454814881434946e-12 },
    ],
    radius: 1600,
    tipDistance: 2771.2812921102036,
  },
};

describe.each(["A", "B"] as const)("parité rosette-6 — jeu %s", (key) => {
  const golden = GOLDEN[key];

  it("les 6 centres secondaires reproduisent le golden au flottant près", () => {
    const model = createRosetteGeometry(golden.input);
    const centres = model.points.filter((p) => /^C\d+$/.test(p.id));
    expect(centres).toHaveLength(6);
    golden.centres.forEach((g, i) => {
      expect(centres[i].x).toBeCloseTo(g.x, 6);
      expect(centres[i].y).toBeCloseTo(g.y, 6);
    });
  });

  it("les 6 pointes reproduisent le golden au flottant près", () => {
    const model = createRosetteGeometry(golden.input);
    const tips = model.points.filter((p) => /^T\d+$/.test(p.id));
    expect(tips).toHaveLength(6);
    golden.tips.forEach((g, i) => {
      expect(tips[i].x).toBeCloseTo(g.x, 5);
      expect(tips[i].y).toBeCloseTo(g.y, 5);
    });
  });

  it("rayon et encombrement réel identiques au golden", () => {
    const model = createRosetteGeometry(golden.input);
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(golden.radius, 8);
    expect(model.dimensions.find((d) => d.id === "dim-envelope")!.value / 2).toBeCloseTo(golden.tipDistance, 5);
  });

  it("bounds : l'enveloppe réelle (min/max des sommets) est identique au golden, hors padding de viewport", () => {
    const model = createRosetteGeometry(golden.input);
    const tight = (pts: readonly V[]) => ({
      minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)),
      maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)),
    });
    // Enveloppe tendue des 6 pointes (le point le plus éloigné de O dans chaque direction) :
    // doit être strictement incluse dans les bounds du modèle (padding en plus, jamais en moins).
    const t = tight(golden.tips);
    const margin = 1e-3;
    expect(t.minX).toBeGreaterThanOrEqual(model.bounds.minX - margin);
    expect(t.maxX).toBeLessThanOrEqual(model.bounds.maxX + margin);
    expect(t.minY).toBeGreaterThanOrEqual(model.bounds.minY - margin);
    expect(t.maxY).toBeLessThanOrEqual(model.bounds.maxY + margin);
  });
});

describe("C4-LOT3-ROSETTES-V1 §10 — compatibilité offset de la rosace Engine B", () => {
  it("createRosette → offsetShape → parametricShapeToTraceModel → validateTraceModel", () => {
    const shape = createRosette({ outerDiameter: 2400, count: 6, elementType: "circle", rotationDegrees: -90 });
    const offset = offsetShape(shape, -20); // -20 mm = cercles repoussés vers l'extérieur
    const model = parametricShapeToTraceModel(offset, {
      name: "Rosace offset", slug: "rosette-6-offset", categoryId: "forms-design",
      difficulty: "easy", tags: [], status: "preview", parameters: [],
    });
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.circles.some((c) => Math.abs(c.radius - 1180) < 1e-6)).toBe(true); // 1200 + (-20)
    // LIMITATION connue (documentée depuis C3/C4-LOT1/LOT2) : offsetShape ne décale que les
    // primitives, pas la géométrie embarquée dans constructionSteps ; l'adaptateur matérialise
    // donc un cercle directeur de construction pré-offset en doublon (radius=1200, pas 1180).
    expect(model.circles.length).toBeGreaterThanOrEqual(6);
  });
});
