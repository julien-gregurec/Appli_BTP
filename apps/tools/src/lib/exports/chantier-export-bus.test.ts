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

describe("approximations remontées par le bus (§18)", () => {
  const ellipseModel: ShapeGeometry = {
    ...model,
    ellipses: [{ id: "e1", centre: { id: "C", x: 500, y: 500 }, radiusX: 400, radiusY: 200 }],
  };

  it("un DXF sans courbe approchée n'annonce aucune approximation", async () => {
    const result = await exportChantier({ project: baseProject, geometry: model }, "dxf");
    expect(result.approximations).toEqual([]);
  });

  it("une ellipse convertie en polyligne est signalée, jamais masquée", async () => {
    // Le lot P0 faisait `const { entities } = shapeGeometryToDxf(...)` : la liste
    // d'approximations était calculée puis jetée, et le DXF livré comme exact.
    const result = await exportChantier({ project: baseProject, geometry: ellipseModel }, "dxf");
    expect(result.approximations.length).toBeGreaterThan(0);
    expect(result.approximations.join(" ")).toMatch(/ellipse/i);
  });

  it("le PNG reste indisponible hors navigateur, sans produire de fichier vide", async () => {
    // Le rendu PNG passe par un canvas : sous Node il doit échouer explicitement plutôt
    // que de retourner un blob vide (§34). Sa mention « non dimensionnel » n'est donc
    // vérifiable qu'en environnement navigateur.
    await expect(exportChantier({ project: baseProject, geometry: model }, "png")).rejects.toThrow(/navigateur/i);
  });

  it("chaque format renseigne le champ approximations", async () => {
    const mosaic = planMosaic({ contentWidthMm: 150, contentHeightMm: 150, format: "A4" });
    const document: ChantierExportDocument = { project: baseProject, geometry: ellipseModel, mosaic };
    // PNG exclu : il exige un canvas navigateur, indisponible sous Node (cf. test dédié).
    for (const format of ["pdf", "svg", "svg-1to1", "dxf", "pdf-mosaic", "print-1to1"] as ChantierExportFormat[]) {
      const result = await exportChantier(document, format);
      expect(Array.isArray(result.approximations)).toBe(true);
    }
  });
});

describe("gabarit SVG 1:1 via le bus (§14)", () => {
  it("produit un SVG en millimètres réels", async () => {
    const result = await exportChantier({ project: baseProject, geometry: model }, "svg-1to1");
    const svg = await result.blob.text();
    expect(result.fileName).toContain("1-1");
    expect(svg).toMatch(/width="[\d.]+mm"/);
    expect(svg).toContain('data-elsatia-full-scale="true"');
  });

  it("nécessite une géométrie", () => {
    const capability = chantierExportCapabilities({ project: baseProject }).find((c) => c.format === "svg-1to1")!;
    expect(capability.ready).toBe(false);
  });
});

describe("plafond de feuilles côté capacités (§39)", () => {
  it("un plan de mosaïque démesuré n'est pas annoncé comme prêt", () => {
    const mosaic = planMosaic({ contentWidthMm: 40_000, contentHeightMm: 40_000, format: "A4" });
    const capabilities = chantierExportCapabilities({ project: baseProject, geometry: model, mosaic });
    const mosaicCapability = capabilities.find((c) => c.format === "pdf-mosaic")!;
    expect(mosaicCapability.ready).toBe(false);
    expect(mosaicCapability.reason).toMatch(/plafond/i);
  });
});
