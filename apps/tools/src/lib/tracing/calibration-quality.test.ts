import { describe, expect, it } from "vitest";
import {
  adjustSwapsAxes,
  calibrationGrid,
  calibrationQualityFromError,
  computeCalibration,
  describeCalibrationQuality,
  DEFAULT_REFERENCE_ADJUST,
  flipAdjust,
  rotateAdjust,
  rotateAdjustQuarterTurn,
  suggestCalibrationGridStep,
  UNDEFINED_CALIBRATION,
  verifyCalibration,
  withCalibrationCheck,
} from "./reference-image";

const CALIBRATION = computeCalibration({
  pointA: { x: 100, y: 100 },
  pointB: { x: 942, y: 100 },
  realDistance: 1200,
  realUnit: "mm",
  at: new Date("2026-09-06T10:00:00.000Z"),
});

describe("traçabilité de la calibration (§9)", () => {
  it("conserve les points, l'unité, la date et l'origine de mesure", () => {
    expect(CALIBRATION.pixelDistance).toBe(842);
    expect(CALIBRATION.mmPerPixel).toBeCloseTo(1200 / 842, 12);
    expect(CALIBRATION.pointA).toEqual({ x: 100, y: 100 });
    expect(CALIBRATION.realUnit).toBe("mm");
    expect(CALIBRATION.calibratedAt).toBe("2026-09-06T10:00:00.000Z");
    expect(CALIBRATION.origin).toBe("calibrated");
    expect(CALIBRATION.check).toBeUndefined();
  });
});

describe("deuxième cote de contrôle (§10, §36)", () => {
  it("expose l'écart réel entre la cote attendue et la cote calculée", () => {
    const pixels = 814 / CALIBRATION.mmPerPixel; // une cote qui « tombe » à 814 mm
    const check = verifyCalibration(CALIBRATION, {
      pointA: { x: 0, y: 0 },
      pointB: { x: pixels, y: 0 },
      expectedDistance: 800,
      expectedUnit: "mm",
    });
    expect(check.expectedMm).toBe(800);
    expect(check.measuredMm).toBeCloseTo(814, 6);
    expect(check.deviationMm).toBeCloseTo(14, 6);
    expect(check.errorPercent).toBeCloseTo(1.75, 6);
    expect(check.quality).toBe("bon");
  });

  it("classe la qualité uniquement à partir de l'écart mesuré", () => {
    expect(calibrationQualityFromError(0.2)).toBe("excellent");
    expect(calibrationQualityFromError(1.75)).toBe("bon");
    expect(calibrationQualityFromError(4)).toBe("moyen");
    expect(calibrationQualityFromError(12)).toBe("insuffisant");
  });

  it("n'affiche jamais un écart masqué", () => {
    const check = verifyCalibration(CALIBRATION, {
      pointA: { x: 0, y: 0 },
      pointB: { x: 814 / CALIBRATION.mmPerPixel, y: 0 },
      expectedDistance: 800,
      expectedUnit: "mm",
    });
    const message = describeCalibrationQuality(withCalibrationCheck(CALIBRATION, check));
    expect(message).toContain("814");
    expect(message).toContain("1.75 %");
  });

  it("refuse tout contrôle avant calibration", () => {
    expect(() =>
      verifyCalibration(UNDEFINED_CALIBRATION, { pointA: { x: 0, y: 0 }, pointB: { x: 10, y: 0 }, expectedDistance: 800, expectedUnit: "mm" }),
    ).toThrow(/Échelle non définie/);
  });

  it("signale une calibration non contrôlée sans la présenter comme fiable", () => {
    expect(describeCalibrationQuality(CALIBRATION)).toContain("une seule cote");
    expect(describeCalibrationQuality(UNDEFINED_CALIBRATION)).toContain("Échelle non définie");
  });
});

describe("redressement simple (§13)", () => {
  it("applique rotations libres, quarts de tour et miroirs", () => {
    expect(rotateAdjust(DEFAULT_REFERENCE_ADJUST, -12).rotationDeg).toBe(348);
    expect(rotateAdjustQuarterTurn(DEFAULT_REFERENCE_ADJUST).rotationDeg).toBe(90);
    expect(rotateAdjustQuarterTurn(DEFAULT_REFERENCE_ADJUST, "ccw").rotationDeg).toBe(270);
    expect(flipAdjust(DEFAULT_REFERENCE_ADJUST, "horizontal").mirrorX).toBe(true);
    expect(flipAdjust(DEFAULT_REFERENCE_ADJUST, "vertical").mirrorY).toBe(true);
  });

  it("sait si le redressement échange largeur et hauteur", () => {
    expect(adjustSwapsAxes({ ...DEFAULT_REFERENCE_ADJUST, rotationDeg: 90 })).toBe(true);
    expect(adjustSwapsAxes({ ...DEFAULT_REFERENCE_ADJUST, rotationDeg: 180 })).toBe(false);
  });
});

describe("grille de contrôle d'échelle (§30)", () => {
  it("projette un pas réel sur l'image calibrée", () => {
    const grid = calibrationGrid(CALIBRATION, 500, 2000, 1000);
    expect(grid.stepPx).toBeCloseTo(500 / CALIBRATION.mmPerPixel, 9);
    expect(grid.lineCountX).toBe(Math.floor(2000 / grid.stepPx) + 1);
  });

  it("propose un pas lisible et refuse toute grille sans échelle", () => {
    expect(suggestCalibrationGridStep(CALIBRATION, 2000)).toBeGreaterThanOrEqual(100);
    expect(() => calibrationGrid(UNDEFINED_CALIBRATION, 500, 2000, 1000)).toThrow(/Échelle non définie/);
  });
});
