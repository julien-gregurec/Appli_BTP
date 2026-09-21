import { describe, expect, it } from "vitest";
import { createFlower4Geometry } from "./flower4";
import { createRosette } from "../engine/rosettes";
import { offsetShape } from "../engine/api";
import { parametricShapeToTraceModel } from "../adapters";
import { validateTraceModel } from "../trace-model";

/**
 * C4-LOT3-ROSETTES-V1 §5 — Parité avant/après migration de `flower-4` vers Engine B.
 *
 * Fixtures « golden » capturées sur l'implémentation historique (formule locale dans
 * `models/flower4.ts`, avant migration). Le schéma d'identifiants "C1..C4" (centres de pétales)
 * est inchangé ; les anciens points "D1..D4" (sur le cercle directeur, jamais utilisés que pour
 * le tracé de l'axe) n'ont pas d'équivalent nommé — comparés ici par angle uniquement.
 */
type V = { x: number; y: number };

const GOLDEN: Record<"A" | "B", { input: { diameter: number; rotation: number }; petalCentres: V[]; petalRadius: number }> = {
  A: {
    input: { diameter: 1200, rotation: 0 },
    petalCentres: [{ x: 300, y: 0 }, { x: 1.8369701987210297e-14, y: 300 }, { x: -300, y: 3.6739403974420595e-14 }, { x: -5.510910596163089e-14, y: -300 }],
    petalRadius: 300,
  },
  B: {
    input: { diameter: 2400, rotation: 45 },
    petalCentres: [
      { x: 424.26406871192853, y: 424.2640687119285 }, { x: -424.2640687119285, y: 424.26406871192853 },
      { x: -424.2640687119286, y: -424.2640687119285 }, { x: 424.2640687119284, y: -424.2640687119286 },
    ],
    petalRadius: 600,
  },
};

describe.each(["A", "B"] as const)("parité flower-4 — jeu %s", (key) => {
  const golden = GOLDEN[key];

  it("les 4 centres de pétales reproduisent le golden au flottant près", () => {
    const model = createFlower4Geometry(golden.input);
    const centres = model.points.filter((p) => /^C\d+$/.test(p.id));
    expect(centres).toHaveLength(4);
    golden.petalCentres.forEach((g, i) => {
      expect(centres[i].x).toBeCloseTo(g.x, 6);
      expect(centres[i].y).toBeCloseTo(g.y, 6);
    });
  });

  it("rayon de pétale identique au golden", () => {
    const model = createFlower4Geometry(golden.input);
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(golden.petalRadius, 8);
  });

  it("bounds : les 4 pétales sont entièrement inclus (aucune troncature)", () => {
    const model = createFlower4Geometry(golden.input);
    const margin = 1e-3;
    for (const g of golden.petalCentres) {
      expect(g.x - golden.petalRadius).toBeGreaterThanOrEqual(model.bounds.minX - margin);
      expect(g.x + golden.petalRadius).toBeLessThanOrEqual(model.bounds.maxX + margin);
      expect(g.y - golden.petalRadius).toBeGreaterThanOrEqual(model.bounds.minY - margin);
      expect(g.y + golden.petalRadius).toBeLessThanOrEqual(model.bounds.maxY + margin);
    }
  });
});

describe("C4-LOT3-ROSETTES-V1 §10 — compatibilité offset de la fleur 4 pétales Engine B", () => {
  it("createRosette (classique) → offsetShape → parametricShapeToTraceModel → validateTraceModel", () => {
    const shape = createRosette({ outerDiameter: 600, count: 4, elementType: "circle", rotationDegrees: 0 });
    const offset = offsetShape(shape, -15);
    const model = parametricShapeToTraceModel(offset, {
      name: "Fleur 4 offset", slug: "flower-4-offset", categoryId: "forms-design",
      difficulty: "easy", tags: [], status: "preview", parameters: [],
    });
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.circles.some((c) => Math.abs(c.radius - 285) < 1e-6)).toBe(true); // 300 + (-15)
  });
});
