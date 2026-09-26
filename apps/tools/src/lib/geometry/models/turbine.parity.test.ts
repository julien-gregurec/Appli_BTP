import { describe, expect, it } from "vitest";
import { createTurbineGeometry } from "./turbine";
import { createStar } from "../engine/stars";
import { offsetShape } from "../engine/api";
import { parametricShapeToTraceModel } from "../adapters";
import { validateTraceModel } from "../trace-model";

/**
 * C4-LOT1-V1 §5 — Parité avant/après migration de `turbine` vers Engine B.
 *
 * Fixtures « golden » capturées sur l'implémentation historique (formule locale dans
 * `models/turbine.ts`, avant migration) : coordonnées attendues, figées, du contour final
 * (sommets extérieurs/intérieurs alternés) pour deux jeux de paramètres.
 */
type V = { x: number; y: number };

const GOLDEN: Record<"A" | "B", { input: { diameter: number; branches: number; twist: number; rotation: number }; poly: V[] }> = {
  A: {
    input: { diameter: 1800, branches: 6, twist: 25, rotation: 0 },
    poly: [
      { x: 900, y: 0 },
      { x: 326.27080333319395, y: 152.1425742266518 },
      { x: 450.0000000000001, y: 779.4228634059947 },
      { x: 31.376067389157008, y: 358.6300913130284 },
      { x: -449.9999999999998, y: 779.4228634059948 },
      { x: -294.894735944037, y: 206.4875170863767 },
      { x: -900, y: 1.1021821192326178e-13 },
      { x: -326.270803333194, y: -152.14257422665173 },
      { x: -450.0000000000004, y: -779.4228634059947 },
      { x: -31.37606738915697, y: -358.6300913130284 },
      { x: 449.9999999999994, y: -779.4228634059951 },
      { x: 294.894735944037, y: -206.48751708637673 },
    ],
  },
  B: {
    input: { diameter: 3000, branches: 8, twist: 20, rotation: 15 },
    poly: [
      { x: 1448.8887394336025, y: 388.2285676537811 },
      { x: 491.49122657339507, y: 344.14586181062765 },
      { x: 750.0000000000001, y: 1299.038105676658 },
      { x: 104.18890660015825, y: 590.8846518073248 },
      { x: -388.22856765378094, y: 1448.8887394336025 },
      { x: -344.1458618106277, y: 491.491226573395 },
      { x: -1299.038105676658, y: 749.9999999999999 },
      { x: -590.8846518073248, y: 104.18890660015816 },
      { x: -1448.8887394336025, y: -388.22856765378117 },
      { x: -491.49122657339507, y: -344.1458618106277 },
      { x: -750.0000000000007, y: -1299.0381056766578 },
      { x: -104.1889066001582, y: -590.8846518073248 },
      { x: 388.22856765378043, y: -1448.8887394336027 },
      { x: 344.14586181062765, y: -491.49122657339507 },
      { x: 1299.0381056766576, y: -750.0000000000007 },
      { x: 590.8846518073248, y: -104.18890660015823 },
    ],
  },
};

describe.each(["A", "B"] as const)("parité turbine — jeu %s", (key) => {
  const { input, poly: golden } = GOLDEN[key];

  it("le contour final Engine B reproduit le golden (tolérance flottante liée à l'ordre d'addition)", () => {
    const model = createTurbineGeometry(input);
    const pts = model.polygons![0].points;
    expect(pts).toHaveLength(golden.length);
    golden.forEach((g, i) => {
      expect(pts[i].x).toBeCloseTo(g.x, 6);
      expect(pts[i].y).toBeCloseTo(g.y, 6);
    });
  });

  it("bounds : l'étendue réelle (min/max des sommets) est identique au golden", () => {
    const model = createTurbineGeometry(input);
    const tight = (pts: readonly V[]) => ({
      minX: Math.min(...pts.map((p) => p.x)), minY: Math.min(...pts.map((p) => p.y)),
      maxX: Math.max(...pts.map((p) => p.x)), maxY: Math.max(...pts.map((p) => p.y)),
    });
    const now = tight(model.polygons![0].points);
    const then = tight(golden);
    expect(now.minX).toBeCloseTo(then.minX, 6);
    expect(now.minY).toBeCloseTo(then.minY, 6);
    expect(now.maxX).toBeCloseTo(then.maxX, 6);
    expect(now.maxY).toBeCloseTo(then.maxY, 6);
  });

  it("premier sommet identique au golden", () => {
    const model = createTurbineGeometry(input);
    expect(model.polygons![0].points[0].x).toBeCloseTo(golden[0].x, 6);
    expect(model.polygons![0].points[0].y).toBeCloseTo(golden[0].y, 6);
  });
});

describe("C4-LOT1-V1 §9 — compatibilité offset de la turbine Engine B", () => {
  it("createStar(twist) → offsetShape → parametricShapeToTraceModel → validateTraceModel", () => {
    const shape = createStar({ points: 6, outerRadius: 900, innerRadius: 360, rotationDegrees: 0, innerAngleOffsetDegrees: 25 });
    const offset = offsetShape(shape, -15);
    const model = parametricShapeToTraceModel(offset, {
      name: "Turbine offset", slug: "turbine-offset", categoryId: "forms-design",
      difficulty: "advanced", tags: [], status: "preview", parameters: [],
    });
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.polygons![0].points).toHaveLength(12);
  });
});
