import { describe, expect, it } from "vitest";
import {
  chantierExportCapabilities,
  ChantierExportBlockedError,
  ChantierExportError,
  exportChantier,
  type ChantierExportFormat,
} from "./chantier-export-bus";
import { validateDxfStructure } from "./dxf";
import type { ChantierExportDocument } from "./chantier-document";
import type { ShapeGeometry } from "../geometry/shape-model";
import { planMosaic } from "../chantier/mosaic";
import { runPreExportChecks } from "../chantier/pre-export-check";

const model: ShapeGeometry = {
  id: "m", name: "m",
  bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 1000 },
  referenceFrame: { unit: "mm", origin: { id: "O", x: 0, y: 0 }, xLabel: "X", yLabel: "Y", yOrientation: "up" },
  axes: [], points: [], segments: [{ id: "s1", start: { id: "A", x: 0, y: 0 }, end: { id: "B", x: 1000, y: 0 } }],
  arcs: [], circles: [], ellipses: [], constructionLines: [], dimensions: [], controls: [], quantities: [], steps: [],
};

const baseProject: ChantierExportDocument["project"] = { id: "trace-1", name: "Test bus", units: "mm", generatedAt: "2026-09-05T12:00:00.000Z" };

describe("capacités d'export (§3)", () => {
  it("PDF toujours disponible ; svg/dxf/png nécessitent une géométrie", () => {
    const capabilities = chantierExportCapabilities({ project: baseProject });
    expect(capabilities.find((c) => c.format === "pdf")?.ready).toBe(true);
    for (const format of ["svg", "dxf", "png", "pdf-mosaic", "print-1to1"] as ChantierExportFormat[]) {
      const capability = capabilities.find((c) => c.format === format)!;
      expect(capability.ready).toBe(false);
      expect(capability.reason).toBeTruthy();
    }
  });

  it("pdf-mosaic/print-1to1 nécessitent en plus un plan de mosaïque", () => {
    const mosaic = planMosaic({ contentWidthMm: 150, contentHeightMm: 150, format: "A4" });
    const capabilities = chantierExportCapabilities({ project: baseProject, geometry: model, mosaic });
    expect(capabilities.find((c) => c.format === "pdf-mosaic")?.ready).toBe(true);
    expect(capabilities.find((c) => c.format === "print-1to1")?.ready).toBe(true);
    expect(capabilities.find((c) => c.format === "svg")?.ready).toBe(true);
  });
});

describe("routage du bus (§18)", () => {
  it("route vers le PDF sans géométrie (couverture seule)", async () => {
    const result = await exportChantier({ project: baseProject }, "pdf");
    expect(result.mimeType).toBe("application/pdf");
    expect(result.fileName.endsWith(".pdf")).toBe(true);
  });

  it("route vers SVG et DXF quand une géométrie est fournie", async () => {
    const svg = await exportChantier({ project: baseProject, geometry: model }, "svg");
    const text = await svg.blob.text();
    expect(text).toContain("<svg");

    const dxf = await exportChantier({ project: baseProject, geometry: model }, "dxf");
    const dxfText = await dxf.blob.text();
    expect(validateDxfStructure(dxfText).ok).toBe(true);
  });

  it("refuse SVG/DXF/PNG sans géométrie avec un message clair", async () => {
    await expect(exportChantier({ project: baseProject }, "svg")).rejects.toThrow(ChantierExportError);
    await expect(exportChantier({ project: baseProject }, "dxf")).rejects.toThrow(/géométrie/i);
  });

  it("PNG échoue proprement côté serveur (aucun DOM/canvas dans les tests)", async () => {
    await expect(exportChantier({ project: baseProject, geometry: model }, "png")).rejects.toThrow(/navigateur/i);
  });

  it("mosaïque/1:1 exigent un plan de mosaïque déjà calculé", async () => {
    await expect(exportChantier({ project: baseProject, geometry: model }, "pdf-mosaic")).rejects.toThrow(/mosaïque/i);
    const mosaic = planMosaic({ contentWidthMm: 150, contentHeightMm: 150, format: "A4" });
    const result = await exportChantier({ project: baseProject, geometry: model, mosaic }, "print-1to1");
    expect(result.fileName).toContain("1-1");
    const other = await exportChantier({ project: baseProject, geometry: model, mosaic }, "pdf-mosaic");
    expect(other.fileName).toContain("mosaique");
  });

  it("format inconnu : erreur propre, jamais un plantage silencieux", async () => {
    await expect(exportChantier({ project: baseProject }, "xyz" as ChantierExportFormat)).rejects.toThrow(ChantierExportError);
  });
});

describe("verrou pré-export (§6)", () => {
  it("bloque tout export si le contrôle pré-export contient une erreur", async () => {
    const preExport = runPreExportChecks({ scaleDefined: false, usesReferenceImage: false, imageCalibrated: false, shapes: [] });
    expect(preExport.canExport).toBe(false);
    await expect(exportChantier({ project: baseProject, geometry: model, preExport }, "pdf")).rejects.toBeInstanceOf(ChantierExportBlockedError);
  });

  it("autorise l'export quand il ne reste que des avertissements", async () => {
    const preExport = runPreExportChecks({
      roomWidthMm: 3000, roomHeightMm: 3000, scaleDefined: true, usesReferenceImage: false, imageCalibrated: false,
      shapes: [{ id: "s", vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], closed: true, origin: "manual" }],
      dimensionsCount: 0,
    });
    expect(preExport.canExport).toBe(true);
    expect(preExport.warnings).toBeGreaterThan(0);
    const result = await exportChantier({ project: baseProject, geometry: model, preExport }, "pdf");
    expect(result.mimeType).toBe("application/pdf");
  });
});
