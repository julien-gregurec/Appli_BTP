/**
 * ATELIER-FREE-CONTOUR-AREA-V1 §15/§16/§17 — le contour fermé dans le pipeline d'export.
 *
 * L'enjeu est le même qu'au lot fondateur, et la conclusion aussi : le contour TRAVERSE le
 * pipeline existant sans qu'aucune ligne de ce pipeline change. Les assertions portent donc sur
 * la sortie réelle — le `d` du SVG, les codes de groupe du DXF, les sections du PDF — et pas
 * sur la structure intermédiaire qui les produit.
 *
 * Le point vérifié le plus souvent ici est la FERMETURE : c'est la seule chose que le contour
 * ajoute à ce qu'une polyligne savait déjà faire, et c'est donc la seule qui puisse se perdre.
 */

import { describe, expect, it } from "vitest";
import { createTracingProject, type TracingProject } from "../tracing/project";
import { FREE_GEOMETRY_VERSION, type FreeGeometry } from "../tracing/free-geometry";
import { freeContourMeasures } from "../tracing/free-contour";
import { freeGeometryToShape } from "../tracing/free-shape";
import { resolveTracingProjectModel } from "../tracing/model-resolver";
import { resolvedAtelierGeometry } from "./atelier-resolved-geometry";
import { freeAtelierGeometry, reportPointsFromFreeGeometry } from "./atelier-free-geometry";
import { tracingProjectToChantierExportDocument } from "./atelier-export-adapter";
import { chantierExportCapabilities } from "./chantier-export-bus";
import { resolveChantierPdfSections } from "./chantier-pdf";
import { renderPlanSvg } from "./svg";
import { renderDxf, shapeGeometryToDxf } from "./dxf";

/** Rectangle 1200 × 800 mm — 0,96 m², périmètre 4000 mm. Fermeture IMPLICITE. */
const RECTANGLE = [
  { x: 0, y: 0 },
  { x: 1200, y: 0 },
  { x: 1200, y: 800 },
  { x: 0, y: 800 },
];

const DRAWING: FreeGeometry = {
  version: FREE_GEOMETRY_VERSION,
  entities: [
    { id: "sg-1", kind: "segment", points: [{ x: 0, y: 1000 }, { x: 1200, y: 1000 }] },
    { id: "pg-1", kind: "polygon", points: RECTANGLE },
  ],
};

/** Contour noué : lisible, exportable, mais sans surface exploitable (§5/§13). */
const KNOTTED: FreeGeometry = {
  version: FREE_GEOMETRY_VERSION,
  entities: [
    {
      id: "pg-1",
      kind: "polygon",
      points: [
        { x: 0, y: 0 },
        { x: 400, y: 400 },
        { x: 0, y: 400 },
        { x: 400, y: 0 },
      ],
    },
  ],
};

function projectWith(geometry: FreeGeometry): TracingProject {
  return createTracingProject(
    { id: "trace-libre002", name: "Plafond séjour", type: "ceiling", freeGeometry: geometry },
    new Date("2026-09-06T09:00:00.000Z"),
  );
}

function documentOf(project: TracingProject) {
  // Exactement l'enchaînement de `AtelierExportWorkspace`.
  const resolution = resolveTracingProjectModel(project);
  const geometry = resolvedAtelierGeometry(resolution) ?? freeAtelierGeometry(project) ?? {};
  return tracingProjectToChantierExportDocument(project, geometry);
}

const shapeOf = (geometry: FreeGeometry) =>
  freeGeometryToShape(geometry, { id: "libre-test", name: "Tracé libre", quantities: true });

describe("projection (§2/§15)", () => {
  it("range le contour dans `polygons`, pas dans `polylines`", () => {
    const shape = shapeOf(DRAWING);
    expect(shape.polygons?.map((polygon) => polygon.id)).toEqual(["pg-1"]);
    expect(shape.polylines).toBeUndefined();
  });

  it("n'ajoute aucun sommet en double : quatre sommets entrent, quatre sortent", () => {
    expect(shapeOf(DRAWING).polygons?.[0].points).toHaveLength(4);
  });

  it("laisse `polygons` absent quand le tracé n'en porte aucun", () => {
    const shape = shapeOf({ version: FREE_GEOMETRY_VERSION, entities: [DRAWING.entities[0]] });
    expect(shape.polygons).toBeUndefined();
  });

  it("cadre l'export sur le CONTENU, contour compris", () => {
    const shape = shapeOf(DRAWING);
    expect(shape.bounds).toEqual({ minX: 0, minY: 0, maxX: 1200, maxY: 1000 });
  });
});

describe("export SVG (§15)", () => {
  it("referme le chemin par un Z, et une seule fois", () => {
    const svg = renderPlanSvg(shapeOf(DRAWING), "Tracé libre");
    const path = /<path id="pg-1"[^>]*d="([^"]+)"/.exec(svg)?.[1];
    expect(path).toBeDefined();
    expect(path?.trimEnd().endsWith("Z")).toBe(true);
    expect(path?.match(/Z/g)).toHaveLength(1);
  });

  it("trace autant de sommets que le contour en porte — pas un de plus", () => {
    const svg = renderPlanSvg(shapeOf(DRAWING), "Tracé libre");
    const path = /<path id="pg-1"[^>]*d="([^"]+)"/.exec(svg)?.[1] ?? "";
    // Un M suivi de trois L : le quatrième côté est le Z, il ne se dessine pas deux fois.
    expect(path.match(/L/g)).toHaveLength(3);
    expect(path.match(/M/g)).toHaveLength(1);
  });
});

describe("export DXF (§16)", () => {
  it("écrit une POLYLINE FERMÉE", () => {
    const { entities } = shapeGeometryToDxf(shapeOf(DRAWING));
    const closed = (entities.polylines ?? []).filter((polyline) => polyline.closed);
    expect(closed).toHaveLength(1);
    expect(closed[0].points).toHaveLength(4);
    expect(closed[0].layer).toBe("FINAL");
  });

  it("porte le drapeau de fermeture (groupe 70 = 1) dans le fichier réel", () => {
    const lines = renderDxf(shapeGeometryToDxf(shapeOf(DRAWING)).entities)
      .split(/\r?\n/)
      .map((line) => line.trim());
    // Le drapeau de fermeture est la valeur du groupe 70 de CETTE POLYLINE : on le lit là où il
    // est réellement écrit, en repartant de l'entité, plutôt qu'à une position devinée.
    const flags: string[] = [];
    lines.forEach((line, index) => {
      if (line !== "POLYLINE") return;
      const at = lines.indexOf("70", index);
      if (at !== -1) flags.push(lines[at + 1]);
    });
    // Une seule POLYLINE dans ce tracé, et elle est fermée.
    expect(flags).toEqual(["1"]);
  });

  it("compte autant de VERTEX que de sommets réels", () => {
    const dxf = renderDxf(shapeGeometryToDxf(shapeOf(DRAWING)).entities);
    expect(dxf.match(/^VERTEX$/gm)).toHaveLength(4);
  });
});

describe("PDF, PNG et mosaïque (§17)", () => {
  it("annonce le contour comme exportable dans les quatre formats", () => {
    const ready = chantierExportCapabilities(documentOf(projectWith(DRAWING)))
      .filter((capability) => capability.ready)
      .map((capability) => capability.format);
    for (const format of ["pdf", "svg", "dxf", "png"] as const) expect(ready).toContain(format);
  });

  it("porte le plan et les quantités dans les sections du PDF", () => {
    const sections = resolveChantierPdfSections(documentOf(projectWith(DRAWING)));
    expect(sections.plan).toBe(true);
    expect(sections.report).toBe(true);
    // §14 — la section « Quantités » n'apparaît que parce que le contour en publie.
    expect(sections.quantities).toBe(true);
  });

  it("planifie une mosaïque dimensionnée sur le CONTENU, jamais sur le viewport", () => {
    const mosaic = documentOf(projectWith(DRAWING)).mosaic;
    expect(mosaic).toBeDefined();
    expect(mosaic!.sheetCount).toBeGreaterThan(0);
    expect(mosaic!.tiles.length).toBe(mosaic!.sheetCount);
    // 1200 × 1000 mm de contenu tiennent en une planche A4 à l'échelle 1:1 ? Non — et c'est
    // justement ce que la mosaïque existe pour découper. Le contour y est donc bien entré.
    expect(mosaic!.columns * mosaic!.rows).toBe(mosaic!.sheetCount);
  });
});

describe("report et quantités (§13/§14)", () => {
  it("reporte chaque sommet une seule fois, dans l'ordre du tracé", () => {
    const labels = reportPointsFromFreeGeometry(DRAWING).map((point) => point.label);
    expect(labels).toEqual(["sg-1·A", "sg-1·B", "pg-1·1", "pg-1·2", "pg-1·3", "pg-1·4"]);
  });

  it("publie la surface et le périmètre du contour, et rien d'autre", () => {
    const quantities = shapeOf(DRAWING).quantities;
    expect(quantities.map((quantity) => quantity.id)).toEqual(["q-pg-1-area", "q-pg-1-perimeter"]);
    expect(quantities[0]).toMatchObject({ unit: "m²", quality: "exact" });
    expect(quantities[0].value).toBeCloseTo(0.96, 12);
    expect(quantities[1]).toMatchObject({ unit: "mm", quality: "exact", value: 4000 });
  });

  it("ne publie AUCUNE surface pour un contour noué, mais garde son périmètre", () => {
    const quantities = shapeOf(KNOTTED).quantities;
    expect(quantities.map((quantity) => quantity.id)).toEqual(["q-pg-1-perimeter"]);
    expect(quantities.some((quantity) => quantity.unit === "m²")).toBe(false);
    expect(freeContourMeasures(KNOTTED.entities[0]).status).toBe("self-intersecting");
  });

  it("porte ces deux lignes jusqu'au document, en mètres linéaires et en m²", () => {
    const document = documentOf(projectWith(DRAWING));
    const lines = document.nomenclature ?? [];
    expect(new Set(lines.map((line) => line.unit))).toEqual(new Set(["m²", "ml"]));
    expect(lines).toHaveLength(2);
    expect(lines.find((line) => line.unit === "m²")).toMatchObject({ quantity: 0.96, quality: "exact" });
    expect(lines.find((line) => line.unit === "ml")).toMatchObject({ quantity: 4, quality: "exact" });
  });

  it("n'invente ni matière, ni chute, ni plan LED, ni profils (§14)", () => {
    const document = documentOf(projectWith(DRAWING));
    expect(document.ledSummary).toBeUndefined();
    expect(document.profiles).toBeUndefined();
    expect(document.lightingRows).toBeUndefined();
    // Aucune ligne de nomenclature ne compte des unités : rien n'a été dénombré.
    expect((document.nomenclature ?? []).some((line) => line.unit === "u")).toBe(false);
  });

  it("laisse la nomenclature absente quand un tracé libre ne porte aucun contour", () => {
    const document = documentOf(
      projectWith({ version: FREE_GEOMETRY_VERSION, entities: [DRAWING.entities[0]] }),
    );
    expect(document.nomenclature).toBeUndefined();
  });

  it("laisse intact le chemin paramétrique — aucune ligne de contour ne s'y ajoute", () => {
    const parametric = createTracingProject({
      id: "trace-param002",
      name: "Rosace",
      type: "ceiling",
      modelId: "rosette-6",
    });
    const document = documentOf(parametric);
    expect(document.geometry?.circles.length).toBeGreaterThan(0);
    expect(document.nomenclature).toBeUndefined();
  });

  it("passe le contrôle pré-export sans erreur bloquante", () => {
    const document = documentOf(projectWith(DRAWING));
    expect(document.preExport?.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });
});

describe("coût de la projection (§20)", () => {
  it("ne calcule les quantités que si on les demande — le viewport ne les paie pas", () => {
    expect(freeGeometryToShape(DRAWING, { frame: "sheet" }).quantities).toEqual([]);
    expect(shapeOf(DRAWING).quantities.length).toBeGreaterThan(0);
    // La géométrie, elle, est identique dans les deux cas : seul le calcul change.
    expect(freeGeometryToShape(DRAWING, { frame: "sheet" }).polygons?.[0].points).toEqual(
      shapeOf(DRAWING).polygons?.[0].points,
    );
  });
});
