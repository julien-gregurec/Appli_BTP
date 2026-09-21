import { describe, expect, it } from "vitest";
import { point } from "./primitives";
import { createPlanTransform, createPolygonPath, createPolylinePath } from "./plan-model";
import type { ShapeGeometry } from "./shape-model";

function minimalModel(points = [point("A", 0, 0), point("B", 100, 0), point("C", 100, 100)]): ShapeGeometry {
  return {
    id: "m", name: "M", bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100 },
    referenceFrame: { unit: "mm", origin: point("O", 0, 0), xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [], points, segments: [], arcs: [], circles: [], ellipses: [], constructionLines: [],
    dimensions: [], controls: [], quantities: [], steps: [],
  };
}

describe("createPolylinePath — FIRST-FUNCTIONAL-LOT-V1 §7", () => {
  it("produit un chemin ouvert (pas de Z)", () => {
    const model = minimalModel();
    const transform = createPlanTransform(model);
    const path = createPolylinePath({ id: "pl", points: model.points }, transform);
    expect(path.startsWith("M ")).toBe(true);
    expect(path).not.toContain("Z");
    expect((path.match(/L /g) ?? []).length).toBe(2);
  });

  it("chemin vide pour une polyligne sans point", () => {
    const model = minimalModel();
    const transform = createPlanTransform(model);
    expect(createPolylinePath({ id: "pl", points: [] }, transform)).toBe("");
  });
});

describe("createPolygonPath — FIRST-FUNCTIONAL-LOT-V1 §7", () => {
  it("produit un contour fermé (se termine par Z)", () => {
    const model = minimalModel();
    const transform = createPlanTransform(model);
    const path = createPolygonPath({ id: "pg", points: model.points }, transform);
    expect(path.trim().endsWith("Z")).toBe(true);
    expect(path.startsWith("M ")).toBe(true);
  });

  it("chemin vide pour un polygone sans point", () => {
    const model = minimalModel();
    const transform = createPlanTransform(model);
    expect(createPolygonPath({ id: "pg", points: [] }, transform)).toBe("");
  });
});
