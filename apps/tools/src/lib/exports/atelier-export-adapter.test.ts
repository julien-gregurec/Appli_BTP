import { describe, expect, it } from "vitest";
import { createTracingProject, validateTracingProject, type TracingProject } from "../tracing/project";
import type { GeometricShape } from "../tracing/vectorization";
import { buildNomenclature } from "../chantier/nomenclature";
import { runPreExportChecks } from "../chantier/pre-export-check";
import { renderPlanSvg } from "./svg";
import { renderDxf, shapeGeometryToDxf, validateDxfStructure } from "./dxf";
import { buildChantierPdfDocument } from "./chantier-pdf";
import { exportChantier, ChantierExportBlockedError } from "./chantier-export-bus";
import {
  buildPreExportInputFromProject,
  combinedOriginFromProject,
  geometryFromTracingShapes,
  tracingProjectToChantierExportDocument,
} from "./atelier-export-adapter";

const squareShape: GeometricShape = {
  id: "shape-square",
  kind: "polygon",
  vertices: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }],
  closed: true,
  origin: "manual",
};

const openLineShape: GeometricShape = {
  id: "shape-line",
  kind: "polyline",
  vertices: [{ x: 0, y: 0 }, { x: 500, y: 200 }],
  closed: false,
  origin: "calibrated",
};

function buildFixtureProject(overrides: Partial<TracingProject> = {}): TracingProject {
  const base = createTracingProject(
    { id: "atelier-integration-test-0001", name: "Fixture intégration", type: "ceiling", roomWidthMm: 4000, roomHeightMm: 3000 },
    new Date("2026-09-05T10:00:00.000Z"),
  );
  return validateTracingProject({
    ...base,
    scaleStatus: "defined",
    shapes: [squareShape],
    materials: buildNomenclature({ counts: [{ label: "Spots", value: 4 }] }),
    lighting: [{ id: "f1", kind: "spot", position: { x: 500, y: 500 } }],
    constructionSteps: [{ id: "s1", title: "Tracer le contour", instruction: "Reporter les quatre sommets depuis O." }],
    ...overrides,
  });
}

describe("A — TracingProject réel → ChantierExportDocument", () => {
  const project = buildFixtureProject();
  const document = tracingProjectToChantierExportDocument(project);

  it("assemble les métadonnées projet sans les recalculer", () => {
    expect(document.project.id).toBe(project.id);
    expect(document.project.name).toBe(project.name);
    expect(document.project.ouvrageType).toBe("ceiling");
    expect(document.project.roomWidthMm).toBe(4000);
    expect(document.project.roomHeightMm).toBe(3000);
    expect(document.project.units).toBe("mm");
  });

  it("réutilise materials/lighting/constructionSteps tels quels (aucune réinvention)", () => {
    expect(document.nomenclature).toEqual(project.materials);
    expect(document.lightingRows?.[0]).toMatchObject({ kind: "Spot", xMm: 500, yMm: 500 });
    expect(document.constructionSteps).toEqual([{ id: "s1", title: "Tracer le contour", instruction: "Reporter les quatre sommets depuis O." }]);
  });

  it("construit la cote témoin depuis exportSettings.witnessMm (réel, pas inventé)", () => {
    expect(document.witness?.lengthMm).toBe(project.exportSettings.witnessMm);
  });

  it("assemble une géométrie minimale depuis les formes vectorisées du projet", () => {
    expect(document.geometry).toBeDefined();
    expect(document.geometry?.polygons).toHaveLength(1);
    expect(document.geometry?.segments).toHaveLength(0); // aucune primitive nouvelle inventée
  });

  it("construit un plan de mosaïque par défaut à partir des réglages réels du projet", () => {
    expect(document.mosaic).toBeDefined();
    expect(document.mosaic?.format).toBe(project.exportSettings.paperFormat);
  });

  it("calcule le contrôle pré-export via runPreExportChecks (pas de contournement)", () => {
    expect(document.preExport).toBeDefined();
    expect(document.preExport?.canExport).toBe(true);
  });
});

describe("géométrie assemblée depuis les formes (aucun recalcul)", () => {
  it("sépare formes ouvertes (polylines) et fermées (polygons)", () => {
    const geometry = geometryFromTracingShapes([squareShape, openLineShape]);
    expect(geometry?.polygons).toHaveLength(1);
    expect(geometry?.polylines).toHaveLength(1);
    expect(geometry?.bounds).toEqual({ minX: 0, minY: 0, maxX: 1000, maxY: 1000 });
  });

  it("renvoie undefined sans forme", () => {
    expect(geometryFromTracingShapes([])).toBeUndefined();
  });

  it("combine l'origine de mesure des formes (§28) — le maillon le plus faible l'emporte", () => {
    expect(combinedOriginFromProject(buildFixtureProject({ shapes: [squareShape, openLineShape] }))).toBe("calibrated");
    expect(combinedOriginFromProject(buildFixtureProject({ shapes: [] }))).toBeUndefined();
  });
});

describe("B — TracingProject + géométrie → PDF (§7)", () => {
  it("couverture + plan + construction + quantités, sans page vide", () => {
    const document = tracingProjectToChantierExportDocument(buildFixtureProject());
    const pdf = buildChantierPdfDocument(document);
    expect(pdf.getNumberOfPages()).toBe(4); // pas de report : resolved.report non fourni
  });
});

describe("C — TracingProject + géométrie → SVG", () => {
  it("rend le contour tracé comme un vrai path vectoriel", () => {
    const document = tracingProjectToChantierExportDocument(buildFixtureProject());
    const svg = renderPlanSvg(document.geometry!, document.project.name);
    expect(svg).toContain("<svg");
    expect(svg).toContain('id="shape-square"');
    expect(svg).not.toMatch(/NaN|Infinity/);
  });
});

describe("D — TracingProject + géométrie → DXF", () => {
  it("produit un DXF structurellement valide avec le contour en POLYLINE", () => {
    const document = tracingProjectToChantierExportDocument(buildFixtureProject());
    const { entities } = shapeGeometryToDxf(document.geometry!);
    const dxf = renderDxf(entities);
    expect(validateDxfStructure(dxf).ok).toBe(true);
    expect(dxf).toContain("POLYLINE");
  });
});

describe("E — TracingProject + géométrie → contrôle pré-export", () => {
  it("assemble les entrées réelles sans dupliquer la logique de contrôle", () => {
    const project = buildFixtureProject();
    const geometry = geometryFromTracingShapes(project.shapes);
    const input = buildPreExportInputFromProject(project, geometry);
    expect(input.scaleDefined).toBe(true);
    expect(input.shapes).toHaveLength(1);
    expect(input.dimensionsCount).toBe(0); // aucune cote sur un tracé manuel — pas inventée
    const report = runPreExportChecks(input);
    expect(report.canExport).toBe(true);
    expect(report.warnings).toBeGreaterThan(0); // dimensions-missing, honnête
  });

  it("signale une image de référence utilisée mais non calibrée", () => {
    const project = buildFixtureProject({
      referenceImages: [{ id: "img1", name: "Photo", source: "camera", format: "jpg", widthPx: 100, heightPx: 100, adjust: { rotationDeg: 0, mirrorX: false, mirrorY: false }, layer: { opacity: .5, visible: true, locked: true, grayscale: false, contrast: 1 }, calibration: { status: "undefined" } }],
    });
    const input = buildPreExportInputFromProject(project);
    expect(input.usesReferenceImage).toBe(true);
    expect(input.imageCalibrated).toBe(false);
    expect(runPreExportChecks(input).canExport).toBe(false);
  });
});

describe("F — projet incomplet → blocage et sections absentes correctes (§3)", () => {
  const empty = createTracingProject({ id: "atelier-integration-empty-0001", name: "Tracé vide", type: "wall" }, new Date("2026-09-05T10:00:00.000Z"));
  const document = tracingProjectToChantierExportDocument(empty);

  it("aucune donnée inventée : géométrie, nomenclature, construction, mosaïque absentes", () => {
    expect(document.geometry).toBeUndefined();
    expect(document.nomenclature).toBeUndefined();
    expect(document.constructionSteps).toBeUndefined();
    expect(document.mosaic).toBeUndefined();
    expect(document.project.measurementOrigin).toBeUndefined();
  });

  it("le pré-export bloque (échelle non définie + tracé vide)", () => {
    expect(document.preExport?.canExport).toBe(false);
    expect(document.preExport?.errors).toBeGreaterThanOrEqual(2);
  });

  it("le dossier PDF ne contient que la couverture", () => {
    const pdf = buildChantierPdfDocument(document);
    expect(pdf.getNumberOfPages()).toBe(1);
  });

  it("le bus d'export bloque réellement l'export (pas seulement l'affichage)", async () => {
    await expect(exportChantier(document, "pdf")).rejects.toBeInstanceOf(ChantierExportBlockedError);
  });
});
