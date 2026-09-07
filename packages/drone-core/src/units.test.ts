import { describe, expect, it } from "vitest";

import {
  degreesToRadians,
  estLatitudeValide,
  estLongitudeValide,
  estMeasurementUnit,
  MEASUREMENT_UNIT_DB_CODES,
  metresToMillimetres,
  millimetresToMetres,
  normalizeAzimuthDegrees,
  radiansToDegrees,
  slopeDegreesToPercent,
  slopePercentToDegrees,
} from "./units";

describe("unités", () => {
  it("expose l'unité de mesure canon et sa correspondance base de données", () => {
    expect(estMeasurementUnit("m2")).toBe(true);
    expect(estMeasurementUnit("cm")).toBe(false);
    expect(MEASUREMENT_UNIT_DB_CODES.percent).toBe("pourcent");
  });

  it("convertit degrés et radians sans perte notable", () => {
    expect(radiansToDegrees(degreesToRadians(35))).toBeCloseTo(35, 12);
    expect(degreesToRadians(180)).toBeCloseTo(Math.PI, 12);
  });

  it("convertit mètres et millimètres", () => {
    expect(metresToMillimetres(1.234)).toBeCloseTo(1234, 9);
    expect(millimetresToMetres(300)).toBeCloseTo(0.3, 12);
  });

  it("publie la pente dans les deux unités, 45° valant 100 %", () => {
    expect(slopeDegreesToPercent(45)).toBeCloseTo(100, 9);
    expect(slopePercentToDegrees(100)).toBeCloseTo(45, 9);
    expect(slopePercentToDegrees(slopeDegreesToPercent(35))).toBeCloseTo(35, 9);
  });

  it("normalise un azimut dans [0, 360)", () => {
    expect(normalizeAzimuthDegrees(-10)).toBeCloseTo(350, 9);
    expect(normalizeAzimuthDegrees(360)).toBe(0);
    expect(normalizeAzimuthDegrees(725)).toBeCloseTo(5, 9);
  });

  it("borne latitude et longitude au domaine WGS84", () => {
    expect(estLatitudeValide(46)).toBe(true);
    expect(estLatitudeValide(91)).toBe(false);
    expect(estLongitudeValide(-180)).toBe(true);
    expect(estLongitudeValide(181)).toBe(false);
  });
});
