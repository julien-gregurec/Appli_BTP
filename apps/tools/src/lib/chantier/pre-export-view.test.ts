import { describe, expect, it } from "vitest";
import { runPreExportChecks } from "./pre-export-check";
import { toPreExportViewModel } from "./pre-export-view";

describe("vue pré-export (§6)", () => {
  it("regroupe les anomalies par sévérité et bloque sur erreur", () => {
    const report = runPreExportChecks({ scaleDefined: false, usesReferenceImage: true, imageCalibrated: false, shapes: [] });
    const view = toPreExportViewModel(report);
    expect(view.canExport).toBe(false);
    expect(view.headline).toMatch(/bloqué/i);
    expect(view.bySeverity.error.length).toBe(view.counts.error);
    expect(view.counts.error).toBeGreaterThan(0);
  });

  it("autorise avec avertissement quand aucune erreur ne subsiste", () => {
    const report = runPreExportChecks({
      roomWidthMm: 3000, roomHeightMm: 3000, scaleDefined: true, usesReferenceImage: false, imageCalibrated: false,
      shapes: [{ id: "s", vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], closed: true, origin: "manual" }],
      dimensionsCount: 0,
    });
    const view = toPreExportViewModel(report);
    expect(view.canExport).toBe(true);
    expect(view.headline).toMatch(/avertissement/i);
    expect(view.counts.warning).toBeGreaterThan(0);
  });

  it("aucune anomalie : message neutre", () => {
    const report = runPreExportChecks({
      roomWidthMm: 3000, roomHeightMm: 3000, scaleDefined: true, usesReferenceImage: false, imageCalibrated: false,
      shapes: [{ id: "s", vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], closed: true, origin: "exact" }],
      dimensionsCount: 1,
    });
    const view = toPreExportViewModel(report);
    expect(view.canExport).toBe(true);
    expect(view.counts.warning).toBe(0);
    expect(view.headline).toMatch(/aucune anomalie/i);
  });
});
