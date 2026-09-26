/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §11 — le tracé libre dans le pipeline d'export.
 *
 * L'enjeu du lot n'est pas d'écrire un nouvel export : c'est de vérifier que le tracé libre
 * TRAVERSE celui qui existe. Les assertions portent donc sur la sortie réelle de `renderPlanSvg`
 * et de `shapeGeometryToDxf`, pas sur la structure intermédiaire.
 *
 * §11 dit aussi ce qu'il ne faut pas faire : « ne pas inventer de quantités ». On le vérifie —
 * un tracé libre ne produit ni nomenclature, ni plan LED, ni profils.
 */

import { describe, expect, it } from "vitest";
import { createTracingProject, type TracingProject } from "../tracing/project";
import { FREE_GEOMETRY_VERSION, type FreeGeometry } from "../tracing/free-geometry";
import { freeGeometryToShape } from "../tracing/free-shape";
import { resolveTracingProjectModel } from "../tracing/model-resolver";
import { resolvedAtelierGeometry } from "./atelier-resolved-geometry";
import {
  freeAtelierGeometry,
  reportPointsFromFreeGeometry,
  reportTableFromFreeGeometry,
} from "./atelier-free-geometry";
import { tracingProjectToChantierExportDocument } from "./atelier-export-adapter";
import { chantierExportCapabilities } from "./chantier-export-bus";
import { renderPlanSvg } from "./svg";
import { shapeGeometryToDxf, renderDxf } from "./dxf";

const DRAWING: FreeGeometry = {
  version: FREE_GEOMETRY_VERSION,
  entities: [
    { id: "pt-1", kind: "point", points: [{ x: 600, y: 900 }] },
    {
      id: "sg-1",
      kind: "segment",
      points: [
        { x: 0, y: 0 },
        { x: 1200, y: 0 },
      ],
    },
    {
      id: "pl-1",
      kind: "polyline",
      points: [
        { x: 0, y: 0 },
        { x: 600, y: 900 },
        { x: 1200, y: 0 },
      ],
    },
  ],
};

function freeProject(): TracingProject {
  return createTracingProject(
    { id: "trace-libre001", name: "Plafond séjour", type: "ceiling", freeGeometry: DRAWING },
    new Date("2026-09-06T09:00:00.000Z"),
  );
}

function documentOf(project: TracingProject) {
  // Exactement l'enchaînement de `AtelierExportWorkspace` : modèle résolu, sinon tracé libre.
  const resolution = resolveTracingProjectModel(project);
  const geometry = resolvedAtelierGeometry(resolution) ?? freeAtelierGeometry(project) ?? {};
  return tracingProjectToChantierExportDocument(project, geometry);
}

describe("projection en géométrie d'export (§11)", () => {
  it("produit une ShapeGeometry portant points, segments et polylignes", () => {
    const shape = freeGeometryToShape(DRAWING, { id: "libre-test", name: "Tracé libre" });
    expect(shape.points.map((point) => point.id)).toEqual(["pt-1"]);
    expect(shape.segments.map((segment) => segment.id)).toEqual(["sg-1"]);
    expect(shape.polylines?.map((polyline) => polyline.id)).toEqual(["pl-1"]);
    expect(shape.bounds).toEqual({ minX: 0, minY: 0, maxX: 1200, maxY: 900 });
    // Rien n'est inventé : ni cote, ni quantité, ni étape de chantier.
    expect(shape.dimensions).toEqual([]);
    expect(shape.quantities).toEqual([]);
    expect(shape.steps).toEqual([]);
  });

  it("ne rend rien pour un projet sans tracé libre", () => {
    const plain = createTracingProject({ id: "trace-vide0001", name: "Vide", type: "other" });
    expect(freeAtelierGeometry(plain)).toBeUndefined();
  });
});

describe("export SVG (§11)", () => {
  it("dessine les trois natures de primitive", () => {
    const svg = renderPlanSvg(freeGeometryToShape(DRAWING), "Plafond séjour");
    expect(svg).toContain('id="sg-1"');
    expect(svg).toContain('id="pl-1"');
    expect(svg).toContain('id="point-pt-1"');
    expect(svg).not.toContain("NaN");
  });
});

describe("export DXF (§11)", () => {
  it("produit une LINE pour le segment et une POLYLINE pour la polyligne", () => {
    const { entities, approximations } = shapeGeometryToDxf(freeGeometryToShape(DRAWING));
    expect(entities.lines).toHaveLength(1);
    expect(entities.polylines).toHaveLength(1);
    expect(entities.polylines?.[0].points).toHaveLength(3);
    expect(entities.polylines?.[0].closed).toBe(false);
    // Aucun arc ni ellipse : rien à approximer, donc rien à signaler.
    expect(approximations).toEqual([]);

    const dxf = renderDxf(entities);
    expect(dxf).toContain("POLYLINE");
    expect(dxf).toContain("LINE");
    expect(dxf).not.toContain("NaN");
  });
});

describe("table de report (§11)", () => {
  it("cote chaque sommet tracé, avec un libellé qui le distingue", () => {
    const points = reportPointsFromFreeGeometry(DRAWING);
    expect(points.map((point) => point.label)).toEqual(["pt-1", "sg-1·A", "sg-1·B", "pl-1·1", "pl-1·2", "pl-1·3"]);

    const table = reportTableFromFreeGeometry(DRAWING);
    expect(table?.rows).toHaveLength(6);
    expect(table?.measurementOrigin).toBe("exact");
  });

  it("ne produit aucune table pour un tracé vide", () => {
    expect(reportTableFromFreeGeometry({ version: FREE_GEOMETRY_VERSION, entities: [] })).toBeUndefined();
  });
});

describe("document d'export complet (§11)", () => {
  it("assemble un document exportable en SVG, DXF, PNG et PDF", () => {
    const document = documentOf(freeProject());
    expect(document.geometry).toBeDefined();
    expect(document.report?.rows).toHaveLength(6);

    const ready = chantierExportCapabilities(document)
      .filter((capability) => capability.ready)
      .map((capability) => capability.format);
    for (const format of ["pdf", "svg", "dxf", "png"] as const) {
      expect(ready).toContain(format);
    }
  });

  it("n'invente ni nomenclature, ni plan LED, ni profils", () => {
    const document = documentOf(freeProject());
    expect(document.nomenclature).toBeUndefined();
    expect(document.ledSummary).toBeUndefined();
    expect(document.profiles).toBeUndefined();
    expect(document.lightingRows).toBeUndefined();
  });

  it("passe le contrôle pré-export sans erreur bloquante", () => {
    const document = documentOf(freeProject());
    // Un tracé libre est construit en millimètres exacts : son échelle est définie par
    // construction, comme celle d'un modèle résolu (§7 du bridge Engine B).
    expect(document.preExport?.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("laisse intact le chemin paramétrique", () => {
    const parametric = createTracingProject({
      id: "trace-param001",
      name: "Rosace",
      type: "ceiling",
      modelId: "rosette-6",
    });
    const document = documentOf(parametric);
    expect(document.geometry).toBeDefined();
    // La géométrie vient d'Engine B, pas du tracé libre : elle porte des cercles, qu'un tracé
    // libre ne sait pas produire dans cette version (§3).
    expect(document.geometry?.circles.length).toBeGreaterThan(0);
  });
});
