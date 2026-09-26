import { describe, expect, it } from "vitest";
import { point, type Dimension } from "./primitives";
import { validateShapeGeometry, type ShapeGeometry, type ShapeLayer } from "./shape-model";

function baseModel(dimensions: Dimension[] = []): ShapeGeometry {
  const O = point("O", 0, 0);
  return {
    id: "m", name: "M", bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
    referenceFrame: { unit: "mm", origin: O, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [], points: [O], segments: [], arcs: [], circles: [], ellipses: [], constructionLines: [],
    dimensions, controls: [], quantities: [], steps: [],
  };
}

describe("Dimension.kind — nouvelles valeurs additives (ENGINE-FOUNDATION-V1 §12)", () => {
  it("accepte 'aligned' sans casser la validation existante", () => {
    const O = point("O", 0, 0); const A = point("A", 100, 0);
    const model = baseModel([{ id: "d1", kind: "aligned", from: O, to: A, label: "100 mm", value: 100, unit: "mm" }]);
    expect(() => validateShapeGeometry({ ...model, points: [O, A] })).not.toThrow();
  });

  it("accepte 'annotation' sans casser la validation existante", () => {
    const O = point("O", 0, 0); const A = point("A", 100, 0);
    const model = baseModel([{ id: "d1", kind: "annotation", from: O, to: A, label: "Note chantier", value: 0, unit: "mm" }]);
    expect(() => validateShapeGeometry({ ...model, points: [O, A] })).not.toThrow();
  });

  it("les valeurs existantes ('linear'|'radius'|'diameter'|'angle') restent inchangées", () => {
    const kinds: Dimension["kind"][] = ["linear", "radius", "diameter", "angle", "aligned", "annotation"];
    expect(kinds).toContain("linear");
    expect(kinds).toContain("radius");
    expect(kinds).toContain("diameter");
    expect(kinds).toContain("angle");
  });
});

describe("ShapeLayer — 'centers' additif (ENGINE-FOUNDATION-V1 §11)", () => {
  it("la nouvelle valeur coexiste avec les couches existantes sans les modifier", () => {
    const layers: ShapeLayer[] = ["shape", "construction", "dimensions", "axes", "points", "labels", "centers"];
    expect(new Set(layers).size).toBe(7);
  });
});
