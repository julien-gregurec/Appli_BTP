import { describe, expect, it } from "vitest";
import { createFlower5Geometry } from "./flower5";
import { createRosette } from "../engine/rosettes";
import { offsetShape } from "../engine/api";
import { parametricShapeToTraceModel } from "../adapters";
import { validateTraceModel } from "../trace-model";

/**
 * C4-LOT3-ROSETTES-V1 §5 — Parité avant/après migration de `flower-5` vers Engine B.
 * Fixtures « golden » capturées sur l'implémentation historique, avant migration. Voir
 * flower4.parity.test.ts pour la note sur le schéma d'identifiants.
 */
type V = { x: number; y: number };

const GOLDEN: Record<"A" | "B", { input: { diameter: number; rotation: number }; petalCentres: V[]; petalRadius: number }> = {
  A: {
    input: { diameter: 1200, rotation: -90 },
    petalCentres: [
      { x: 1.8369701987210297e-14, y: -300 }, { x: 285.31695488854604, y: -92.70509831248422 }, { x: 176.33557568774194, y: 242.70509831248424 },
      { x: -176.3355756877419, y: 242.70509831248424 }, { x: -285.3169548885461, y: -92.70509831248418 },
    ],
    petalRadius: 300,
  },
  B: {
    input: { diameter: 2000, rotation: 0 },
    petalCentres: [
      { x: 500, y: 0 }, { x: 154.50849718747372, y: 475.52825814757676 }, { x: -404.50849718747367, y: 293.89262614623664 },
      { x: -404.5084971874737, y: -293.8926261462365 }, { x: 154.5084971874736, y: -475.5282581475768 },
    ],
    petalRadius: 500,
  },
};

describe.each(["A", "B"] as const)("parité flower-5 — jeu %s", (key) => {
  const golden = GOLDEN[key];

  it("les 5 centres de pétales reproduisent le golden au flottant près", () => {
    const model = createFlower5Geometry(golden.input);
    const centres = model.points.filter((p) => /^C\d+$/.test(p.id));
    expect(centres).toHaveLength(5);
    golden.petalCentres.forEach((g, i) => {
      expect(centres[i].x).toBeCloseTo(g.x, 6);
      expect(centres[i].y).toBeCloseTo(g.y, 6);
    });
  });

  it("rayon de pétale identique au golden", () => {
    const model = createFlower5Geometry(golden.input);
    expect(model.dimensions.find((d) => d.id === "dim-radius")?.value).toBeCloseTo(golden.petalRadius, 8);
  });

  it("bounds : les 5 pétales sont entièrement inclus (aucune troncature)", () => {
    const model = createFlower5Geometry(golden.input);
    const margin = 1e-3;
    for (const g of golden.petalCentres) {
      expect(g.x - golden.petalRadius).toBeGreaterThanOrEqual(model.bounds.minX - margin);
      expect(g.x + golden.petalRadius).toBeLessThanOrEqual(model.bounds.maxX + margin);
      expect(g.y - golden.petalRadius).toBeGreaterThanOrEqual(model.bounds.minY - margin);
      expect(g.y + golden.petalRadius).toBeLessThanOrEqual(model.bounds.maxY + margin);
    }
  });
});

describe("C4-LOT3-ROSETTES-V1 §10 — compatibilité offset de la fleur 5 pétales Engine B", () => {
  it("createRosette (classique) → offsetShape → parametricShapeToTraceModel → validateTraceModel", () => {
    const shape = createRosette({ outerDiameter: 600, count: 5, elementType: "circle", rotationDegrees: -90 });
    const offset = offsetShape(shape, -15);
    const model = parametricShapeToTraceModel(offset, {
      name: "Fleur 5 offset", slug: "flower-5-offset", categoryId: "forms-design",
      difficulty: "intermediate", tags: [], status: "preview", parameters: [],
    });
    expect(() => validateTraceModel(model)).not.toThrow();
    expect(model.circles.some((c) => Math.abs(c.radius - 285) < 1e-6)).toBe(true); // 300 + (-15)
  });
});
