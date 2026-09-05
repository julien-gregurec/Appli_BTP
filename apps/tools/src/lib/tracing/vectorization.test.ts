import { describe, expect, it } from "vitest";
import { computeCalibration, UNDEFINED_CALIBRATION } from "./reference-image";
import { simplifyPolyline } from "./geometry-port";
import {
  confirmContour,
  contourLabel,
  contourToGeometricShape,
  createRawContour,
  geometricShapePerimeter,
  simplifyContourForSite,
} from "./vectorization";

const calibration = computeCalibration({ pointA: { x: 0, y: 0 }, pointB: { x: 10, y: 0 }, realDistance: 100, realUnit: "mm" }); // 10 mm/px

describe("Douglas–Peucker (§10)", () => {
  it("conserve les extrémités et supprime les points quasi alignés", () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0.05 },
      { x: 2, y: -0.05 },
      { x: 3, y: 0.02 },
      { x: 4, y: 0 },
      { x: 5, y: 5 },
    ];
    const simplified = simplifyPolyline(points, 0.5);
    expect(simplified[0]).toEqual({ x: 0, y: 0 });
    expect(simplified[simplified.length - 1]).toEqual({ x: 5, y: 5 });
    expect(simplified.length).toBeLessThan(points.length);
    expect(simplified).toContainEqual({ x: 4, y: 0 });
  });

  it("ne touche pas une polyligne de deux points", () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
    expect(simplifyPolyline(points, 5)).toEqual(points);
  });

  it("supporte un contour de plusieurs milliers de points sans récursion", () => {
    const points = Array.from({ length: 6000 }, (_, index) => ({ x: index, y: Math.sin(index / 40) * 3 }));
    const simplified = simplifyPolyline(points, 0.4);
    expect(simplified.length).toBeGreaterThan(2);
    expect(simplified.length).toBeLessThan(points.length);
  });
});

describe("statut proposition / confirmé (§8)", () => {
  it("un contour détecté est toujours une proposition, jamais certifié", () => {
    const contour = createRawContour({ id: "c1", points: [{ x: 0, y: 0 }, { x: 1, y: 1 }], space: "image-pixels", source: "detected", status: "confirmed" });
    expect(contour.status).toBe("proposition");
    expect(contourLabel(contour)).toBe("Proposition (à vérifier)");
    expect(contourLabel(confirmContour(contour))).toBe("Contour confirmé");
  });

  it("refuse un contour de moins de deux points ou avec coordonnées non finies", () => {
    expect(() => createRawContour({ id: "c", points: [{ x: 0, y: 0 }], space: "millimetres", source: "manual" })).toThrow(/deux points/);
    expect(() => createRawContour({ id: "c", points: [{ x: 0, y: 0 }, { x: Number.NaN, y: 1 }], space: "millimetres", source: "manual" })).toThrow(/invalides/);
  });
});

describe("simplification chantier — 3 niveaux (§10)", () => {
  const noisyMm = createRawContour({
    id: "mm",
    points: Array.from({ length: 200 }, (_, index) => ({ x: index * 10, y: (index % 2) * 2 })),
    space: "millimetres",
    source: "manual",
    closed: false,
  });

  it("réduit davantage en niveau simple qu'en niveau précis", () => {
    const precis = simplifyContourForSite(noisyMm, "precis");
    const simple = simplifyContourForSite(noisyMm, "simple");
    expect(simple.pointsAfter).toBeLessThanOrEqual(precis.pointsAfter);
    expect(simple.removed).toBeGreaterThanOrEqual(precis.removed);
    expect(precis.toleranceMm).toBe(1);
    expect(simple.toleranceMm).toBe(20);
  });

  it("exige l'échelle image pour un contour en pixels", () => {
    const pixelContour = createRawContour({ id: "px", points: [{ x: 0, y: 0 }, { x: 5, y: 1 }, { x: 10, y: 0 }], space: "image-pixels", source: "detected" });
    expect(() => simplifyContourForSite(pixelContour, "standard")).toThrow(/échelle image/i);
    expect(simplifyContourForSite(pixelContour, "standard", 10).toleranceMm).toBe(5);
  });
});

describe("RawContour → GeometricShape (§9)", () => {
  it("refuse une proposition non confirmée", () => {
    const proposal = createRawContour({ id: "p", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], space: "millimetres", source: "detected" });
    expect(() => contourToGeometricShape(proposal)).toThrow(/non confirmé/i);
  });

  it("refuse un contour image sans calibration (§4)", () => {
    const contour = confirmContour(createRawContour({ id: "i", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], space: "image-pixels", source: "manual", closed: true }));
    expect(() => contourToGeometricShape(contour, { calibration: UNDEFINED_CALIBRATION })).toThrow(/Échelle non définie/);
  });

  it("vectorise un contour image calibré et marque l'origine « calibrated »", () => {
    const contour = confirmContour(
      createRawContour({ id: "i", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }], space: "image-pixels", source: "manual", closed: true }),
    );
    const shape = contourToGeometricShape(contour, { calibration, imageHeightPx: 10 });
    expect(shape.origin).toBe("calibrated");
    expect(shape.kind).toBe("polygon");
    expect(shape.vertices[0]).toEqual({ x: 0, y: 100 });
    expect(geometricShapePerimeter(shape)).toBeCloseTo(400, 6); // carré de 100 mm
  });

  it("garde l'origine « manual » pour un contour déjà en millimètres", () => {
    const contour = confirmContour(createRawContour({ id: "m", points: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }], space: "millimetres", source: "manual", closed: true }));
    expect(contourToGeometricShape(contour).origin).toBe("manual");
  });
});
