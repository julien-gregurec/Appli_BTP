import { describe, expect, it } from "vitest";
import {
  buildChantierMosaicPdf,
  buildChantierMosaicPdfDocument,
  buildChantierPdf,
  buildChantierPdfDocument,
  nomenclatureQualityStatus,
  resolveChantierPdfSections,
} from "./chantier-pdf";
import type { ChantierExportDocument } from "./chantier-document";
import type { ShapeGeometry } from "../geometry/shape-model";
import { buildReportTable } from "../chantier/report-table";
import { buildNomenclature } from "../chantier/nomenclature";
import { planMosaic } from "../chantier/mosaic";
import { witnessDimension } from "../chantier/witness";

const model: ShapeGeometry = {
  id: "rosette-6", name: "Rosace 6 pétales",
  bounds: { minX: 0, minY: 0, maxX: 2400, maxY: 2400 },
  referenceFrame: { unit: "mm", origin: { id: "O", x: 1200, y: 1200 }, xLabel: "X", yLabel: "Y", yOrientation: "up" },
  axes: [],
  points: [{ id: "O", x: 1200, y: 1200 }, { id: "T1", x: 2400, y: 1200 }],
  segments: [{ id: "s1", start: { id: "O", x: 1200, y: 1200 }, end: { id: "T1", x: 2400, y: 1200 } }],
  arcs: [{ id: "a1", centre: { id: "C1", x: 1200, y: 1200 }, radius: 600, startAngle: 0, endAngle: Math.PI / 2 }],
  circles: [{ id: "c1", centre: { id: "O", x: 1200, y: 1200 }, radius: 1200 }],
  ellipses: [],
  constructionLines: [{ id: "cl1", start: { id: "O", x: 1200, y: 1200 }, end: { id: "T1", x: 2400, y: 1200 }, role: "construction" }],
  dimensions: [{ id: "d1", kind: "linear", from: { id: "O", x: 1200, y: 1200 }, to: { id: "T1", x: 2400, y: 1200 }, label: "1200 mm", value: 1200, unit: "mm" }],
  controls: [], quantities: [], steps: [],
};

const baseProject: ChantierExportDocument["project"] = { id: "trace-1", name: "Rosace 6 pétales", units: "mm", generatedAt: "2026-09-05T12:00:00.000Z" };

describe("sections conditionnelles (§17, logique pure)", () => {
  it("aucune section annexe sans données", () => {
    expect(resolveChantierPdfSections({ project: baseProject })).toEqual({ plan: false, report: false, construction: false, quantities: false });
  });

  it("chaque section s'active indépendamment quand sa donnée est présente", () => {
    const report = buildReportTable([{ label: "A", point: { x: 100, y: 0 } }]);
    expect(resolveChantierPdfSections({ project: baseProject, geometry: model }).plan).toBe(true);
    expect(resolveChantierPdfSections({ project: baseProject, report }).report).toBe(true);
    expect(resolveChantierPdfSections({ project: baseProject, constructionSteps: [{ id: "s1", title: "Tracer O", instruction: "Placer le centre." }] }).construction).toBe(true);
    expect(resolveChantierPdfSections({ project: baseProject, nomenclature: buildNomenclature({ counts: [{ label: "Spots", value: 4 }] }) }).quantities).toBe(true);
  });

  it("un report ou des étapes vides ne comptent pas comme présents", () => {
    expect(resolveChantierPdfSections({ project: baseProject, report: buildReportTable([]) }).report).toBe(false);
    expect(resolveChantierPdfSections({ project: baseProject, constructionSteps: [] }).construction).toBe(false);
  });
});

describe("statut exact/estimate (§17, logique pure)", () => {
  it("undefined sans nomenclature", () => { expect(nomenclatureQualityStatus(undefined)).toBeUndefined(); expect(nomenclatureQualityStatus([])).toBeUndefined(); });
  it("exact quand aucune ligne n'est une estimation", () => { expect(nomenclatureQualityStatus([{ quality: "exact" }, { quality: "exact" }])).toBe("exact"); });
  it("estimate dès qu'une ligne est une estimation", () => { expect(nomenclatureQualityStatus([{ quality: "exact" }, { quality: "estimate" }])).toBe("estimate"); });
});

describe("dossier chantier multipage (§5)", () => {
  it("un document minimal ne produit qu'une couverture", () => {
    const pdf = buildChantierPdfDocument({ project: baseProject });
    expect(pdf.getNumberOfPages()).toBe(1);
  });

  it("chaque section présente ajoute exactement une page, sans page vide", () => {
    const report = buildReportTable([{ label: "A", point: { x: 1250, y: 600 } }, { label: "B", point: { x: 2100, y: 600 } }]);
    const withGeometry = buildChantierPdfDocument({ project: baseProject, geometry: model });
    expect(withGeometry.getNumberOfPages()).toBe(2);

    const withGeometryAndReport = buildChantierPdfDocument({ project: baseProject, geometry: model, report });
    expect(withGeometryAndReport.getNumberOfPages()).toBe(3);

    const full = buildChantierPdfDocument({
      project: baseProject,
      geometry: model,
      report,
      constructionSteps: [{ id: "s1", title: "Tracer O", instruction: "Placer le centre au milieu de la pièce." }],
      nomenclature: buildNomenclature({ counts: [{ label: "Spots", value: 8 }] }),
    });
    expect(full.getNumberOfPages()).toBe(5);
  });

  it("génère un vrai PDF (en-tête %PDF, taille raisonnable)", () => {
    const bytes = buildChantierPdf({ project: baseProject, geometry: model, notes: "Vérifier l'aplomb avant fixation." });
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain("%PDF-");
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });

  it("accepte une cote témoin sans jamais prétendre imprimer la page Plan à l'échelle 1:1", () => {
    const pdf = buildChantierPdfDocument({ project: baseProject, geometry: model, witness: witnessDimension(100) });
    expect(pdf.getNumberOfPages()).toBe(2); // couverture + plan, aucune page supplémentaire pour le témoin
  });
});

describe("gabarit mosaïque / 1:1 (§16-§18, §12)", () => {
  it("refuse l'export sans géométrie ni plan de mosaïque", () => {
    expect(() => buildChantierMosaicPdfDocument({ project: baseProject })).toThrow(/géométrie/i);
    expect(() => buildChantierMosaicPdfDocument({ project: baseProject, geometry: model })).toThrow(/mosaïque/i);
  });

  it("cas 1 feuille (§12) : une seule page, pas de plan d'assemblage", () => {
    const mosaic = planMosaic({ contentWidthMm: 150, contentHeightMm: 150, format: "A4" });
    const pdf = buildChantierMosaicPdfDocument({ project: baseProject, geometry: model, mosaic });
    expect(pdf.getNumberOfPages()).toBe(1);
    expect(mosaic.fitsSingleSheet).toBe(true);
  });

  it("motif plus grand qu'une feuille : 1 page d'assemblage + N feuilles", () => {
    const mosaic = planMosaic({ contentWidthMm: 500, contentHeightMm: 800, format: "A4" });
    const pdf = buildChantierMosaicPdfDocument({ project: baseProject, geometry: model, mosaic });
    expect(pdf.getNumberOfPages()).toBe(1 + mosaic.sheetCount);
    expect(mosaic.sheetCount).toBe(9);
  });

  it("génère un vrai PDF mosaïque", () => {
    const mosaic = planMosaic({ contentWidthMm: 2400, contentHeightMm: 2400, format: "A3" });
    const bytes = buildChantierMosaicPdf({ project: baseProject, geometry: model, mosaic });
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toContain("%PDF-");
  });
});
