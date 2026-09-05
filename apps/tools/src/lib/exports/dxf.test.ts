import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createToolProject } from "../projects/model";
import { proToolDefaults } from "../pro-engine";
import { buildProjectDocument } from "./document";
import {
  exportProjectDxf,
  geometricShapesToDxf,
  renderDxf,
  shapeGeometryToDxf,
  validateDxfStructure,
  type DxfEntitySet,
} from "./dxf";
import type { ShapeGeometry } from "../geometry/shape-model";

const syntheticModel: ShapeGeometry = {
  id: "synthetic",
  name: "Synthétique",
  bounds: { minX: 0, minY: 0, maxX: 2000, maxY: 1000 },
  referenceFrame: { unit: "mm", origin: { id: "O", x: 0, y: 0 }, xLabel: "X", yLabel: "Y", yOrientation: "up" },
  axes: [],
  points: [{ id: "A", x: 0, y: 0 }],
  segments: [{ id: "s1", start: { id: "A", x: 0, y: 0 }, end: { id: "B", x: 2000, y: 0 } }],
  arcs: [{ id: "arc1", centre: { id: "C", x: 1000, y: 0 }, radius: 500, startAngle: 0, endAngle: Math.PI }],
  circles: [{ id: "c1", centre: { id: "D", x: 1000, y: 500 }, radius: 200, role: "shape" }],
  ellipses: [{ id: "e1", centre: { id: "E", x: 1000, y: 500 }, radiusX: 300, radiusY: 150 }],
  constructionLines: [{ id: "cl1", start: { id: "A", x: 0, y: 0 }, end: { id: "F", x: 0, y: 1000 }, role: "construction" }],
  dimensions: [{ id: "d1", kind: "linear", from: { id: "A", x: 0, y: 0 }, to: { id: "B", x: 2000, y: 0 }, label: "2000 mm", value: 2000, unit: "mm" }],
  controls: [],
  quantities: [],
  steps: [],
};

function groupPairs(text: string): Array<[number, string]> {
  const lines = text.split("\r\n");
  if (lines[lines.length - 1] === "") lines.pop();
  const pairs: Array<[number, string]> = [];
  for (let index = 0; index < lines.length; index += 2) pairs.push([Number(lines[index]), lines[index + 1]]);
  return pairs;
}

describe("export DXF R12 (§20)", () => {
  it("produit un fichier structurellement valide (sections, paires code/valeur, mm)", () => {
    const { entities } = shapeGeometryToDxf(syntheticModel);
    const dxf = renderDxf(entities);
    const check = validateDxfStructure(dxf);
    expect(check.errors).toEqual([]);
    expect(check.ok).toBe(true);
    expect(dxf).toContain("AC1009");
    expect(dxf.endsWith("0\r\nEOF\r\n")).toBe(true);

    const pairs = groupPairs(dxf);
    expect(pairs.every(([code]) => Number.isInteger(code))).toBe(true);
    const insUnitsIndex = pairs.findIndex(([code, value]) => code === 9 && value === "$INSUNITS");
    expect(pairs[insUnitsIndex + 1]).toEqual([70, "4"]); // 4 = millimètres
  });

  it("émet les bonnes entités par calque", () => {
    const { entities, approximations } = shapeGeometryToDxf(syntheticModel);
    const dxf = renderDxf(entities);
    expect((dxf.match(/\r\nLINE\r\n/g) ?? []).length).toBe(3); // segment + construction + cote
    expect((dxf.match(/\r\nCIRCLE\r\n/g) ?? []).length).toBe(1);
    expect((dxf.match(/\r\nARC\r\n/g) ?? []).length).toBe(1);
    expect((dxf.match(/\r\nPOLYLINE\r\n/g) ?? []).length).toBe(1); // ellipse approximée
    expect((dxf.match(/\r\nVERTEX\r\n/g) ?? []).length).toBe(72);
    expect(dxf).toContain("CONSTRUCTION");
    expect(dxf).toContain("COTATIONS");
    expect(approximations[0]).toMatch(/Ellipse e1/);
  });

  it("convertit un arc horaire en bornes CCW normalisées [0, 360[", () => {
    const model: ShapeGeometry = { ...syntheticModel, ellipses: [], arcs: [{ id: "a", centre: { id: "c", x: 0, y: 0 }, radius: 100, startAngle: 0, endAngle: Math.PI / 2, counterClockwise: false }] };
    const dxf = renderDxf(shapeGeometryToDxf(model).entities);
    const pairs = groupPairs(dxf);
    const start = pairs.find(([code]) => code === 50)![1];
    const end = pairs.find(([code]) => code === 51)![1];
    expect(Number(start)).toBeCloseTo(90, 3);
    expect(Number(end)).toBeCloseTo(0, 3);
  });

  it("rejette une coordonnée non finie plutôt que d'écrire un DXF invalide", () => {
    const broken: DxfEntitySet = { lines: [{ layer: "FINAL", start: { x: 0, y: 0 }, end: { x: Number.NaN, y: 0 } }] };
    expect(() => renderDxf(broken)).toThrow(/non finie/);
  });

  it("vectorise des GeometricShape en POLYLINE FINAL", () => {
    const set = geometricShapesToDxf([{ id: "g1", kind: "polygon", vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], closed: true, origin: "calibrated" }]);
    const dxf = renderDxf(set);
    expect(validateDxfStructure(dxf).ok).toBe(true);
    expect((dxf.match(/\r\nVERTEX\r\n/g) ?? []).length).toBe(3);
    expect(dxf).toContain("70\r\n1\r\n"); // polyligne fermée
  });

  it("exporte un document projet réel en DXF valide", () => {
    const project = createToolProject(
      { name: "Plafond / DXF", siteName: "Test", toolId: "fleur-6", inputParameters: proToolDefaults["fleur-6"] },
      new Date("2026-09-05T10:00:00Z"),
      "22345678-1234-1234-1234-123456789012",
    );
    const document = buildProjectDocument(project, new Date("2026-09-05T12:00:00Z"));
    const bytes = exportProjectDxf(document);
    const text = new TextDecoder().decode(bytes);
    expect(validateDxfStructure(text).ok).toBe(true);
    expect(text).toContain("ELSATIA Tools - Plafond / DXF");
    if (process.env.ELSATIA_WRITE_EXPORT_FIXTURES === "1") {
      mkdirSync("../../output/dxf", { recursive: true });
      writeFileSync("../../output/dxf/elsatia-tools-fleur-6.dxf", bytes);
    }
  });
});
