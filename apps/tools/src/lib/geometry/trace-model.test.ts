import { describe, expect, it } from "vitest";
import { point } from "./primitives";
import { validateTraceModel, type TraceModel } from "./trace-model";

function baseModel(overrides: Partial<TraceModel> = {}): TraceModel {
  const O = point("O", 0, 0, "Centre O", "construction");
  return {
    id: "base", name: "Base", slug: "base", categoryId: "geometry", difficulty: "easy", tags: [], status: "preview",
    parameters: [{ id: "diameter", label: "Diamètre", unit: "mm", min: 10, defaultValue: 2000 }],
    bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
    referenceFrame: { unit: "mm", origin: O, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [], points: [O], segments: [], arcs: [], circles: [], ellipses: [], constructionLines: [],
    dimensions: [], controls: [], quantities: [], steps: [],
    ...overrides,
  };
}

describe("validateTraceModel — ENGINE-FOUNDATION-V1 §17", () => {
  it("accepte un modèle valide (réutilise validateShapeGeometry sans le dupliquer)", () => {
    expect(() => validateTraceModel(baseModel())).not.toThrow();
  });

  it("refuse un slug vide", () => {
    expect(() => validateTraceModel(baseModel({ slug: "" }))).toThrow();
  });

  it("refuse des paramètres dupliqués", () => {
    const parameters = [
      { id: "diameter", label: "A", defaultValue: 1 },
      { id: "diameter", label: "B", defaultValue: 2 },
    ];
    expect(() => validateTraceModel(baseModel({ parameters }))).toThrow();
  });

  it("refuse une valeur par défaut non finie", () => {
    expect(() => validateTraceModel(baseModel({ parameters: [{ id: "x", label: "X", defaultValue: Number.NaN }] }))).toThrow();
  });

  it("refuse min > max", () => {
    expect(() => validateTraceModel(baseModel({ parameters: [{ id: "x", label: "X", min: 100, max: 10, defaultValue: 50 }] }))).toThrow();
  });

  it("refuse une valeur par défaut hors bornes", () => {
    expect(() => validateTraceModel(baseModel({ parameters: [{ id: "x", label: "X", min: 10, max: 20, defaultValue: 5 }] }))).toThrow();
    expect(() => validateTraceModel(baseModel({ parameters: [{ id: "x", label: "X", min: 10, max: 20, defaultValue: 25 }] }))).toThrow();
  });

  it("refuse un pas invalide", () => {
    expect(() => validateTraceModel(baseModel({ parameters: [{ id: "x", label: "X", step: -1, defaultValue: 5 }] }))).toThrow();
  });

  it("hérite toujours des contrôles de validateShapeGeometry (ex. id de point dupliqué)", () => {
    const O = point("O", 0, 0);
    expect(() => validateTraceModel(baseModel({ points: [O, O] }))).toThrow();
  });
});
