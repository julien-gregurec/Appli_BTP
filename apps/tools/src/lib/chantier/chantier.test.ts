import { describe, expect, it } from "vitest";
import { applyMargin, marginPercent } from "./margins";
import { witnessDimension } from "./witness";
import { buildReportTable, formatReportRow } from "./report-table";
import { buildNomenclature, nomenclatureFromQuantities } from "./nomenclature";
import { DEFAULT_LED_ROLL_MM, planLed } from "./led";
import { planProfiles } from "./profiles";
import { lightingExportRows, summariseLighting } from "./lighting";
import { runPreExportChecks } from "./pre-export-check";
import type { Quantity } from "../geometry/shape-model";

describe("marge / chute (§23)", () => {
  it("sépare longueur calculée et longueur avec marge", () => {
    const breakdown = applyMargin(17850, { kind: "preset", percent: 10 });
    expect(breakdown.baseMm).toBe(17850);
    expect(breakdown.marginMm).toBeCloseTo(1785, 6);
    expect(breakdown.withMarginMm).toBeCloseTo(19635, 6);
  });

  it("refuse un pourcentage hors bornes", () => {
    expect(() => marginPercent({ kind: "custom", percent: -1 })).toThrow();
    expect(() => marginPercent({ kind: "custom", percent: 250 })).toThrow();
  });
});

describe("cote témoin (§15)", () => {
  it("produit une ligne de 100 mm avec consigne de vérification", () => {
    const witness = witnessDimension();
    expect(witness.lengthMm).toBe(100);
    expect(witness.text).toBe("Vérifier après impression : cette ligne doit mesurer exactement 100 mm.");
  });
});

describe("table de report (§14)", () => {
  it("calcule X, Y, distance à l'origine et angle", () => {
    const table = buildReportTable([
      { label: "A", point: { x: 1250, y: 600 } },
      { label: "B", point: { x: 2100, y: 600 } },
    ]);
    expect(table.rows[0].distanceToOriginMm).toBeCloseTo(1386.54, 1);
    expect(table.rows[0].angleDeg).toBeCloseTo(25.64, 1);
    expect(formatReportRow(table.rows[0])).toEqual(["A", "1250,0", "600,0", "1386,5", "25,6°"]);
  });

  it("refuse un point sans coordonnées finies", () => {
    expect(() => buildReportTable([{ label: "X", point: { x: Number.POSITIVE_INFINITY, y: 0 } }])).toThrow(/invalides/);
  });
});

describe("nomenclature (§22)", () => {
  it("agrège longueurs, surfaces et comptages avec leur qualité", () => {
    const lines = buildNomenclature({
      lengthsMm: [
        { label: "Contour principal", value: 18420 },
        { label: "Gorge LED", value: 17850, quality: "estimate" },
      ],
      surfacesM2: [{ label: "Surface", value: 6.35 }],
      counts: [{ label: "Spots", value: 8 }],
    });
    expect(lines.find((line) => line.label === "Contour principal")).toMatchObject({ quantity: 18.42, unit: "ml", quality: "exact" });
    expect(lines.find((line) => line.label === "Gorge LED")?.quality).toBe("estimate");
    expect(lines.find((line) => line.label === "Surface")).toMatchObject({ quantity: 6.35, unit: "m²" });
    expect(lines.find((line) => line.label === "Spots")).toMatchObject({ quantity: 8, unit: "u" });
  });

  it("adapte les quantités d'une ShapeGeometry (mm et mm²)", () => {
    const quantities: Quantity[] = [
      { id: "perimeter", label: "Périmètre", value: 6000, unit: "mm", quality: "exact" },
      { id: "area", label: "Aire", value: 2_000_000, unit: "mm²", quality: "estimate" },
    ];
    const lines = nomenclatureFromQuantities(quantities);
    expect(lines).toEqual([
      { id: "perimeter", label: "Périmètre", quantity: 6, unit: "ml", quality: "exact", note: undefined },
      { id: "area", label: "Aire", quantity: 2, unit: "m²", quality: "estimate", note: undefined },
    ]);
  });
});

describe("LED (§24)", () => {
  it("calcule longueur totale, ruptures et nombre de rouleaux", () => {
    const plan = planLed({
      segments: [
        { id: "s1", lengthMm: 10000 },
        { id: "s2", lengthMm: 7850 },
      ],
      margin: { kind: "preset", percent: 10 },
    });
    expect(plan.totalLengthMm).toBe(17850);
    expect(plan.breaks).toBe(1);
    expect(plan.roll.lengthMm).toBe(DEFAULT_LED_ROLL_MM);
    expect(plan.roll.count).toBe(4); // 19,635 m / 5 m
    expect(plan.roll.orderedMm).toBe(20000);
  });

  it("refuse un plan sans segment", () => {
    expect(() => planLed({ segments: [] })).toThrow();
  });
});

describe("profils / ossature (§25)", () => {
  it("déduit le nombre de barres commerciales", () => {
    const plan = planProfiles({ type: "Profil gorge", totalLengthMm: 18400, barLengthMm: 3000 });
    expect(plan.barCount).toBe(7);
    expect(plan.orderedMm).toBe(21000);
    expect(plan.offcutMm).toBeCloseTo(2600, 6);
  });
});

describe("éclairage (§26)", () => {
  it("résume et exporte les positions", () => {
    const fixtures = [
      { id: "f1", kind: "spot" as const, position: { x: 500, y: 500 } },
      { id: "f2", kind: "spot" as const, position: { x: 1500, y: 500 } },
      { id: "f3", kind: "suspension" as const, position: { x: 1000, y: 1000 }, label: "Susp. centre" },
    ];
    expect(summariseLighting(fixtures)).toMatchObject({ spot: 2, suspension: 1, lustre: 0 });
    const rows = lightingExportRows(fixtures);
    expect(rows[2]).toEqual({ ref: "Susp. centre", kind: "Suspension", xMm: 1000, yMm: 1000, note: "" });
  });
});

describe("check avant export (§27)", () => {
  const validShape = { id: "sh1", vertices: [{ x: 0, y: 0 }, { x: 1000, y: 0 }, { x: 1000, y: 1000 }, { x: 0, y: 1000 }], closed: true, origin: "manual" as const };

  it("bloque l'export tant qu'il reste une erreur", () => {
    const report = runPreExportChecks({
      scaleDefined: false,
      usesReferenceImage: true,
      imageCalibrated: false,
      shapes: [],
    });
    expect(report.canExport).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["scale-undefined", "image-not-calibrated", "empty-drawing"]));
  });

  it("classe les anomalies et autorise l'export sans erreur", () => {
    const report = runPreExportChecks({
      roomWidthMm: 3000,
      roomHeightMm: 3000,
      scaleDefined: true,
      usesReferenceImage: false,
      imageCalibrated: false,
      shapes: [validShape, { id: "open", vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }], closed: false, origin: "approximated" as const }],
      dimensionsCount: 0,
      ledSegments: [{ id: "led1", lengthMm: 0 }],
    });
    expect(report.canExport).toBe(true);
    expect(report.infos).toBeGreaterThanOrEqual(1); // contour ouvert
    expect(report.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["open-shape", "unreliable-scale", "dimensions-missing", "led-without-length"]),
    );
  });

  it("signale un motif hors pièce", () => {
    const report = runPreExportChecks({
      roomWidthMm: 500,
      roomHeightMm: 500,
      scaleDefined: true,
      usesReferenceImage: false,
      imageCalibrated: false,
      shapes: [validShape],
      contentBounds: { minX: -10, minY: 0, maxX: 1200, maxY: 400 },
    });
    expect(report.issues.map((issue) => issue.code)).toContain("content-outside-room");
  });
});
