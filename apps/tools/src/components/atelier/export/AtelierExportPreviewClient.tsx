"use client";

import { useMemo, useState } from "react";
import type { ShapeGeometry } from "@/lib/geometry/shape-model";
import { buildReportTable } from "@/lib/chantier/report-table";
import { buildNomenclature } from "@/lib/chantier/nomenclature";
import { planLed } from "@/lib/chantier/led";
import { planProfiles } from "@/lib/chantier/profiles";
import { lightingExportRows, type LightingFixture } from "@/lib/chantier/lighting";
import { witnessDimension } from "@/lib/chantier/witness";
import { planMosaic } from "@/lib/chantier/mosaic";
import { runPreExportChecks } from "@/lib/chantier/pre-export-check";
import { chantierExportCapabilities, type ChantierExportFormat } from "@/lib/exports/chantier-export-bus";
import type { ChantierExportDocument } from "@/lib/exports/chantier-document";
import { PreExportReportView } from "./PreExportReportView";
import { ExportFormatPicker } from "./ExportFormatPicker";
import { ExportActions } from "./ExportActions";

/** Motif de démonstration : rosace à 6 pétales, 2400 mm, dans une pièce 5000×4000. */
function buildFixtureGeometry(): ShapeGeometry {
  const centre = { id: "O", x: 2500, y: 2000 };
  return {
    id: "fixture-rosette-6",
    name: "Rosace 6 pétales — aperçu export",
    bounds: { minX: 1300, minY: 800, maxX: 3700, maxY: 3200 },
    referenceFrame: { unit: "mm", origin: centre, xLabel: "X", yLabel: "Y", yOrientation: "up" },
    axes: [],
    points: [centre, { id: "T1", x: 3700, y: 2000, label: "T1" }, { id: "T2", x: 2500, y: 3200, label: "T2" }],
    segments: [{ id: "s1", start: centre, end: { id: "T1", x: 3700, y: 2000 } }],
    arcs: [
      { id: "a1", centre, radius: 600, startAngle: 0, endAngle: Math.PI / 3 },
      { id: "a2", centre, radius: 600, startAngle: Math.PI / 3, endAngle: (2 * Math.PI) / 3 },
    ],
    circles: [{ id: "c1", centre, radius: 1200 }],
    ellipses: [],
    constructionLines: [{ id: "cl1", start: centre, end: { id: "T2", x: 2500, y: 3200 }, role: "construction" }],
    dimensions: [{ id: "d1", kind: "linear", from: centre, to: { id: "T1", x: 3700, y: 2000 }, label: "1200 mm", value: 1200, unit: "mm" }],
    controls: [],
    quantities: [
      { id: "q-contour", label: "Contour principal", value: 18_420, unit: "mm", quality: "exact" },
      { id: "q-led", label: "Gorge LED", value: 17_850, unit: "mm", quality: "estimate" },
      { id: "q-surface", label: "Surface", value: 6.35, unit: "m²", quality: "exact" },
    ],
    steps: [
      { id: "step-1", title: "Tracer le centre O", instruction: "Reporter le centre de la rosace au milieu de la pièce.", measurements: ["2500 mm depuis le mur gauche", "2000 mm depuis le mur bas"], pointIds: ["O"] },
      { id: "step-2", title: "Tracer le cercle directeur", instruction: "Tracer un cercle de rayon 1200 mm centré en O.", measurements: ["R 1200 mm"], pointIds: ["O"] },
    ],
  };
}

function buildFixtureDocument(): ChantierExportDocument {
  const geometry = buildFixtureGeometry();
  const report = buildReportTable(
    [
      { label: "A", point: { x: 1250, y: 600 } },
      { label: "B", point: { x: 2100, y: 600 } },
    ],
    { measurementOrigin: "exact" },
  );
  const nomenclature = buildNomenclature({
    lengthsMm: [{ label: "Contour principal", value: 18_420 }, { label: "Gorge LED", value: 17_850, quality: "estimate" }],
    surfacesM2: [{ label: "Surface", value: 6.35 }],
    counts: [{ label: "Spots", value: 8 }, { label: "Suspension", value: 1 }],
  });
  const ledSummary = planLed({ segments: [{ id: "led-1", lengthMm: 17_850 }], margin: { kind: "preset", percent: 10 } });
  const profiles = [planProfiles({ type: "Profil gorge", totalLengthMm: 18_400, barLengthMm: 3000 })];
  const fixtures: LightingFixture[] = [
    { id: "f1", kind: "spot", position: { x: 1800, y: 1200 } },
    { id: "f2", kind: "spot", position: { x: 3200, y: 1200 } },
    { id: "f3", kind: "suspension", position: { x: 2500, y: 2000 }, label: "Suspension centrale" },
  ];
  const mosaic = planMosaic({ contentWidthMm: geometry.bounds.maxX - geometry.bounds.minX, contentHeightMm: geometry.bounds.maxY - geometry.bounds.minY, format: "A4" });
  const preExport = runPreExportChecks({
    roomWidthMm: 5000,
    roomHeightMm: 4000,
    scaleDefined: true,
    usesReferenceImage: false,
    imageCalibrated: false,
    shapes: [{ id: geometry.id, vertices: [{ x: geometry.bounds.minX, y: geometry.bounds.minY }, { x: geometry.bounds.maxX, y: geometry.bounds.maxY }], closed: false, origin: "exact" }],
    dimensionsCount: geometry.dimensions.length,
    ledSegments: [{ id: "led-1", lengthMm: 17_850 }],
  });

  return {
    project: {
      id: "fixture-atelier-export-preview",
      name: "Rosace 6 pétales — Salle de réunion",
      ouvrageType: "ceiling",
      siteName: "Aperçu interne (démonstration)",
      units: "mm",
      roomWidthMm: 5000,
      roomHeightMm: 4000,
      measurementOrigin: "exact",
      generatedAt: new Date().toISOString(),
    },
    geometry,
    report,
    constructionSteps: geometry.steps.map((step) => ({ id: step.id, title: step.title, instruction: step.instruction, measurements: step.measurements })),
    nomenclature,
    ledSummary,
    profiles,
    lightingRows: lightingExportRows(fixtures),
    witness: witnessDimension(100),
    preExport,
    mosaic,
    notes: "Aperçu interne — données fictives, ne correspond à aucun chantier réel.",
  };
}

export function AtelierExportPreviewClient() {
  const document = useMemo(() => buildFixtureDocument(), []);
  const capabilities = useMemo(() => chantierExportCapabilities(document), [document]);
  const [format, setFormat] = useState<ChantierExportFormat>("pdf");

  return (
    <main className="atelier-export-page">
      <p className="atelier-export-banner">Aperçu interne — non catalogué, données de démonstration uniquement.</p>
      <h1>{document.project.name}</h1>
      <p className="atelier-export-lede">Pipeline d&rsquo;export chantier (lot P0) — contrôle, choix du format, génération et partage.</p>

      {document.preExport && <PreExportReportView report={document.preExport} />}

      <ExportFormatPicker capabilities={capabilities} value={format} onChange={setFormat} />
      <ExportActions document={document} format={format} disabled={document.preExport ? !document.preExport.canExport : false} />
    </main>
  );
}
