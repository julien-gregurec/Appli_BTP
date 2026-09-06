import { describe, expect, it } from "vitest";
import { reportPointsFromModel, reportTableFromModel, resolvedAtelierGeometry } from "./atelier-resolved-geometry";
import { tracingProjectToChantierExportDocument } from "./atelier-export-adapter";
import { chantierExportCapabilities, exportChantier, type ChantierExportFormat } from "./chantier-export-bus";
import { validateDxfStructure } from "./dxf";
import { renderPlanSvg } from "./svg";
import { resolveTracingProjectModel } from "../tracing/model-resolver";
import { createTracingProject, type TracingProject } from "../tracing/project";
import { migrateTracingProject } from "../tracing/migration";
import { TRACE_MODEL_SLUGS } from "../geometry/models/catalog";

function modelProject(modelId: string, modelParams?: Record<string, number>): TracingProject {
  return createTracingProject(
    {
      id: "trace-export001",
      name: "Plafond rosace",
      type: "ceiling",
      roomWidthMm: 5000,
      roomHeightMm: 4000,
      modelId,
      modelParams,
    },
    new Date("2026-09-05T10:00:00Z"),
  );
}

function documentFor(project: TracingProject) {
  return tracingProjectToChantierExportDocument(project, resolvedAtelierGeometry(resolveTracingProjectModel(project)) ?? {});
}

describe("géométrie résolue → document d'export (§7)", () => {
  it("alimente le document avec la géométrie du moteur, pas avec les formes du projet", () => {
    const project = modelProject("rosette-6", { diameter: 2600 });
    expect(project.shapes).toHaveLength(0); // aucun tracé manuel/photo
    const document = documentFor(project);
    expect(document.geometry).toBeDefined();
    expect(document.geometry?.id).toBe("rosette-6");
    expect(document.geometry?.circles.length ?? 0).toBeGreaterThan(0);
  });

  it("laisse la géométrie absente quand le modèle ne résout pas — jamais de valeur inventée (§3)", () => {
    const document = documentFor(modelProject("modele-fantome"));
    expect(document.geometry).toBeUndefined();
    expect(document.report).toBeUndefined();
    const capabilities = chantierExportCapabilities(document);
    for (const format of ["svg", "dxf", "png"] as ChantierExportFormat[]) {
      expect(capabilities.find((capability) => capability.format === format)?.ready, format).toBe(false);
    }
  });

  it("débloque SVG/DXF/PNG, la mosaïque et le 1:1 dès que le modèle est résolu", () => {
    // Le volume d'impression conditionne désormais la mosaïque (§39) : on prend une rosace
    // d'emprise réaliste pour vérifier le déblocage, pas un motif de 5 m sur A4.
    const capabilities = chantierExportCapabilities(documentFor(modelProject("rosette-6", { diameter: 600 })));
    for (const format of ["pdf", "svg", "svg-1to1", "dxf", "png", "pdf-mosaic", "print-1to1"] as ChantierExportFormat[]) {
      expect(capabilities.find((capability) => capability.format === format)?.ready, format).toBe(true);
    }
  });

  it("refuse la mosaïque et le 1:1 quand le motif dépasse le plafond de feuilles (§39)", () => {
    // Une rosace au diamètre par défaut occupe ~5,3 m : 570 feuilles A4. Le format vectoriel
    // reste disponible, mais proposer le gabarit papier serait promettre l'impossible.
    const capabilities = chantierExportCapabilities(documentFor(modelProject("rosette-6")));
    for (const format of ["svg", "svg-1to1", "dxf", "png"] as ChantierExportFormat[]) {
      expect(capabilities.find((capability) => capability.format === format)?.ready, format).toBe(true);
    }
    for (const format of ["pdf-mosaic", "print-1to1"] as ChantierExportFormat[]) {
      const capability = capabilities.find((entry) => entry.format === format);
      expect(capability?.ready, format).toBe(false);
      expect(capability?.reason, format).toMatch(/plafond/i);
    }
  });

  it("produit un plan de mosaïque et un témoin cohérents avec les réglages du projet", () => {
    const project = modelProject("ellipse-pedagogical", { width: 3000, height: 2000 });
    const document = documentFor(project);
    expect(document.mosaic).toBeDefined();
    expect(document.mosaic!.sheetCount).toBeGreaterThan(0);
    expect(document.mosaic!.tiles.length).toBe(document.mosaic!.sheetCount);
    expect(document.mosaic!.format).toBe(project.exportSettings.paperFormat);
    expect(document.witness?.lengthMm).toBe(project.exportSettings.witnessMm);
  });

  it("construit la table de report depuis les points nommés du modèle, en origine « exact »", () => {
    const resolution = resolveTracingProjectModel(modelProject("ellipse-pedagogical", { width: 2400, height: 1600 }));
    expect(resolution.status).toBe("resolved");
    if (resolution.status !== "resolved") return;
    const points = reportPointsFromModel(resolution.model);
    const table = reportTableFromModel(resolution.model)!;
    expect(table.rows).toHaveLength(points.length);
    expect(table.measurementOrigin).toBe("exact");
    // Les foyers sont bien à ± c du centre : c = √(1200² − 800²) ≈ 894,4 mm.
    const focus = table.rows.find((row) => row.label === "F1")!;
    expect(focus).toBeDefined();
    expect(focus.distanceToOriginMm).toBeCloseTo(Math.sqrt(1200 ** 2 - 800 ** 2), 6);
  });
});

describe("exports réels depuis la géométrie résolue (§7)", () => {
  const project = modelProject("star-5", { outerDiameter: 2000, innerRatio: 0.4 });

  it("le contrôle pré-export autorise l'export d'un tracé modèle complet", () => {
    const document = documentFor(project);
    expect(document.preExport?.canExport).toBe(true);
  });

  it("génère un PDF, un SVG et un DXF valides", async () => {
    const document = documentFor(project);

    const pdf = await exportChantier(document, "pdf");
    expect(pdf.mimeType).toBe("application/pdf");
    expect(pdf.blob.size).toBeGreaterThan(0);

    const svg = await exportChantier(document, "svg");
    const svgText = await svg.blob.text();
    expect(svgText.startsWith("<?xml")).toBe(true);
    expect(svgText).toContain("<svg xmlns=");
    expect(svgText).toContain("Plafond rosace");

    const dxf = await exportChantier(document, "dxf");
    const dxfText = await dxf.blob.text();
    expect(() => validateDxfStructure(dxfText)).not.toThrow();
  });

  it("achemine bien la géométrie résolue jusqu'au rendu PNG (rasterisation navigateur)", async () => {
    const document = documentFor(project);
    // Le PNG part de la même géométrie que le SVG ; seule la rasterisation exige un canvas.
    // En environnement node, l'échec doit rester celui du navigateur — jamais « géométrie requise ».
    await expect(exportChantier(document, "png")).rejects.toThrow(/navigateur/i);
    expect(renderPlanSvg(document.geometry!, document.project.name, { mode: "complete" })).toContain("<svg xmlns=");
  });

  it("bloque tout export quand le modèle est inconnu : ni géométrie, ni tracé (§10)", async () => {
    const document = documentFor(modelProject("modele-fantome"));
    expect(document.preExport?.canExport).toBe(false);
    expect(document.preExport?.issues.map((issue) => issue.code)).toContain("empty-drawing");
    await expect(exportChantier(document, "svg")).rejects.toThrow(/bloqué/i);
    await expect(exportChantier(document, "pdf")).rejects.toThrow(/bloqué/i);
  });
});

describe("persistance : aucune géométrie dérivée stockée (§8)", () => {
  it("un projet enregistré ne porte que modelId + modelParams, jamais la géométrie calculée", () => {
    const project = modelProject("flower-5", { diameter: 1800 });
    const stored = JSON.parse(JSON.stringify(project)) as Record<string, unknown>;
    expect(stored.modelId).toBe("flower-5");
    expect(stored.modelParams).toEqual({ diameter: 1800 });
    for (const derived of ["geometry", "model", "points", "segments", "arcs", "steps", "dimensions", "report"]) {
      expect(stored, derived).not.toHaveProperty(derived);
    }
    expect(stored.shapes).toEqual([]);
    expect(stored.contours).toEqual([]);
  });

  it("relit un projet sérialisé et retrouve exactement la même géométrie", () => {
    const project = modelProject("turbine", { diameter: 2200, branches: 8, twist: 30 });
    const reloaded = migrateTracingProject(JSON.parse(JSON.stringify(project)));
    expect(reloaded.modelParams).toEqual({ diameter: 2200, branches: 8, twist: 30 });

    const before = resolveTracingProjectModel(project);
    const after = resolveTracingProjectModel(reloaded);
    expect(after.status).toBe("resolved");
    if (before.status !== "resolved" || after.status !== "resolved") return;
    // Recalcul déterministe : la source de vérité reste le moteur, pas un cache.
    expect(JSON.stringify(after.model)).toBe(JSON.stringify(before.model));
  });

  it("chaque modèle du registre traverse la chaîne complète projet → export", () => {
    for (const slug of TRACE_MODEL_SLUGS) {
      const document = documentFor(modelProject(slug));
      expect(document.geometry, slug).toBeDefined();
      expect(document.report?.rows.length ?? 0, slug).toBeGreaterThan(0);
      expect(chantierExportCapabilities(document).find((capability) => capability.format === "dxf")?.ready, slug).toBe(true);
    }
  });
});
