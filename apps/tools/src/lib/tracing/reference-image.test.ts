import { describe, expect, it } from "vitest";
import {
  calibrationLabel,
  computeCalibration,
  detectFormat,
  isSupportedFormat,
  millimetresToPixels,
  pixelPointToMillimetres,
  pixelsToMillimetres,
  straightenRotationRadians,
  UNDEFINED_CALIBRATION,
} from "./reference-image";
import { radToDeg } from "./geometry-port";

describe("import image — formats (§3)", () => {
  it("accepte jpg/png/webp, refuse heic mais le reconnaît", () => {
    expect(isSupportedFormat("png")).toBe(true);
    expect(isSupportedFormat("webp")).toBe(true);
    expect(isSupportedFormat("heic")).toBe(false);
    expect(detectFormat("photo-chantier.HEIC")).toBe("heic");
    expect(detectFormat("image/webp")).toBe("webp");
    expect(detectFormat("croquis.gif")).toBeNull();
  });
});

describe("calibration (§4)", () => {
  it("calcule le facteur d'échelle depuis deux points et une distance réelle", () => {
    const result = computeCalibration({ pointA: { x: 100, y: 100 }, pointB: { x: 900, y: 100 }, realDistance: 2000, realUnit: "mm" });
    expect(result.pixelDistance).toBe(800);
    expect(result.realDistanceMm).toBe(2000);
    expect(result.mmPerPixel).toBeCloseTo(2.5, 9);
    expect(calibrationLabel(result)).toBe("Échelle calibrée");
  });

  it("convertit une unité réelle non métrique avant calibration", () => {
    const result = computeCalibration({ pointA: { x: 0, y: 0 }, pointB: { x: 0, y: 500 }, realDistance: 2, realUnit: "m" });
    expect(result.realDistanceMm).toBe(2000);
    expect(result.mmPerPixel).toBeCloseTo(4, 9);
  });

  it("refuse deux points confondus ou une distance nulle", () => {
    expect(() => computeCalibration({ pointA: { x: 10, y: 10 }, pointB: { x: 10, y: 10 }, realDistance: 1000, realUnit: "mm" })).toThrow(/distincts/);
    expect(() => computeCalibration({ pointA: { x: 0, y: 0 }, pointB: { x: 10, y: 0 }, realDistance: 0, realUnit: "mm" })).toThrow(/supérieure à 0/);
  });

  it("§4 interdiction : aucune conversion pixel → mm sans échelle calibrée", () => {
    expect(calibrationLabel(UNDEFINED_CALIBRATION)).toBe("Échelle non définie");
    expect(() => pixelsToMillimetres(UNDEFINED_CALIBRATION, 120)).toThrow(/Échelle non définie/);
    expect(() => millimetresToPixels(UNDEFINED_CALIBRATION, 120)).toThrow(/Échelle non définie/);
  });

  it("convertit un point image (Y vers le bas) vers le repère chantier (Y vers le haut)", () => {
    const calibration = computeCalibration({ pointA: { x: 0, y: 0 }, pointB: { x: 10, y: 0 }, realDistance: 100, realUnit: "mm" });
    expect(pixelsToMillimetres(calibration, 10)).toBeCloseTo(100, 9);
    const point = pixelPointToMillimetres(calibration, { x: 10, y: 20 }, 100);
    expect(point.x).toBeCloseTo(100, 9);
    expect(point.y).toBeCloseTo(800, 9); // (100 - 20) * 10 mm/px
  });
});

describe("redressement (§5)", () => {
  it("calcule la plus petite rotation pour rendre une ligne horizontale", () => {
    const radians = straightenRotationRadians({ x: 0, y: 0 }, { x: 100, y: 6 }, "horizontal");
    expect(radToDeg(radians)).toBeLessThan(0);
    expect(Math.abs(radToDeg(radians))).toBeCloseTo(3.43, 1);
  });

  it("calcule la rotation pour rendre une ligne verticale", () => {
    const radians = straightenRotationRadians({ x: 0, y: 0 }, { x: 4, y: 100 }, "vertical");
    expect(Math.abs(radToDeg(radians))).toBeLessThan(5);
  });

  it("refuse deux points confondus", () => {
    expect(() => straightenRotationRadians({ x: 1, y: 1 }, { x: 1, y: 1 }, "horizontal")).toThrow(/distincts/);
  });
});
