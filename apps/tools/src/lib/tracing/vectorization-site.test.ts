import { describe, expect, it } from "vitest";
import {
  appendContourPoint,
  confirmContour,
  contourToConstructionElements,
  contourToGeometricShape,
  createRawContour,
  describeShapeSource,
  maxDeviationBetweenPolylines,
  moveContourPoint,
  removeContourPoint,
  scaleGeometricShape,
  setContourClosed,
  simplifyContourWithReport,
  SIMPLIFICATION_LABELS,
} from "./vectorization";
import { computeCalibration } from "./reference-image";
import { boundsDimensions, boundsFromPoints, type Point2D } from "./geometry-port";

function noisyArc(radius: number, count: number, noise: number): Point2D[] {
  return Array.from({ length: count + 1 }, (_, index) => {
    const angle = (index / count) * Math.PI;
    const wobble = noise * Math.sin(index * 1.9);
    return { x: (radius + wobble) * Math.cos(angle), y: (radius + wobble) * Math.sin(angle) };
  });
}

describe("vectorisation manuelle assistée (§15, §16, §18)", () => {
  it("ajoute, déplace et supprime des points en repassant en proposition", () => {
    let contour = createRawContour({ id: "c1", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }], space: "millimetres", source: "manual" });
    contour = confirmContour(contour);
    expect(contour.status).toBe("confirmed");

    contour = appendContourPoint(contour, { x: 10, y: 10 });
    expect(contour.points).toHaveLength(3);
    // Toute retouche invalide la confirmation : l'utilisateur doit revalider (§18).
    expect(contour.status).toBe("proposition");

    contour = moveContourPoint(contour, 1, { x: 12, y: 1 });
    expect(contour.points[1]).toEqual({ x: 12, y: 1 });

    contour = removeContourPoint(contour, 2);
    expect(contour.points).toHaveLength(2);
    expect(() => removeContourPoint(contour, 0)).toThrow(/au moins deux points/);
  });

  it("refuse de fermer un contour de moins de trois points", () => {
    const contour = createRawContour({ id: "c2", points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], space: "millimetres", source: "manual" });
    expect(() => setContourClosed(contour, true)).toThrow(/trois points/);
  });
});

describe("simplification et écart mesuré (§19, §20)", () => {
  const contour = createRawContour({ id: "c3", points: noisyArc(600, 200, 3), space: "millimetres", source: "manual" });

  it("expose les trois niveaux avec des libellés chantier", () => {
    expect(SIMPLIFICATION_LABELS).toEqual({ precis: "Précis", standard: "Équilibré", simple: "Chantier" });
  });

  it("réduit davantage en mode Chantier qu'en mode Précis", () => {
    const precis = simplifyContourWithReport(contour, "precis");
    const chantier = simplifyContourWithReport(contour, "simple");
    expect(chantier.pointsAfter).toBeLessThan(precis.pointsAfter);
    expect(chantier.maxDeviationMm!).toBeGreaterThan(precis.maxDeviationMm!);
  });

  it("mesure l'écart réel introduit, sans se contenter d'annoncer la tolérance", () => {
    const report = simplifyContourWithReport(contour, "standard");
    expect(report.maxDeviation).toBeGreaterThan(0);
    expect(report.maxDeviation).toBeLessThanOrEqual(report.toleranceMm);
    expect(report.notice).toContain("écart maximal");
    expect(report.notice).toContain("mm");
  });

  it("ne promet aucun millimètre sur un contour image non calibré", () => {
    const inPixels = createRawContour({ id: "c4", points: noisyArc(600, 120, 3), space: "image-pixels", source: "manual" });
    expect(() => simplifyContourWithReport(inPixels, "standard")).toThrow(/échelle image requise/i);
    const report = simplifyContourWithReport(inPixels, "standard", 2);
    expect(report.maxDeviationMm).not.toBeNull();
  });

  it("calcule l'écart maximal entre deux polylignes", () => {
    const original: Point2D[] = [{ x: 0, y: 0 }, { x: 50, y: 30 }, { x: 100, y: 0 }];
    expect(maxDeviationBetweenPolylines(original, [{ x: 0, y: 0 }, { x: 100, y: 0 }])).toBeCloseTo(30, 9);
  });
});

describe("conversion en éléments constructibles (§21)", () => {
  it("produit des segments et des arcs traçables, en restant une proposition", () => {
    const contour = createRawContour({ id: "c5", points: noisyArc(800, 120, 0), space: "millimetres", source: "manual" });
    const result = contourToConstructionElements(contour, "standard");
    expect(result.elements.length).toBeGreaterThan(0);
    expect(result.elements.some((element) => element.kind === "arc")).toBe(true);
    expect(result.status).toBe("proposition");
    expect(result.notice).toContain("à valider");
    expect(result.maxError).toBeLessThanOrEqual(5 * 2.5);
  });

  it("refuse un contour image sans échelle", () => {
    const contour = createRawContour({ id: "c6", points: noisyArc(800, 60, 0), space: "image-pixels", source: "manual" });
    expect(() => contourToConstructionElements(contour, "standard")).toThrow(/échelle image requise/i);
  });
});

describe("mise à l'échelle d'une géométrie confirmée (§31, §32)", () => {
  const shape = contourToGeometricShape(
    confirmContour(
      createRawContour({
        id: "motif",
        points: [{ x: 0, y: 0 }, { x: 1850, y: 0 }, { x: 1850, y: 1850 }, { x: 0, y: 1850 }],
        space: "millimetres",
        closed: true,
        source: "manual",
      }),
    ),
  );

  it("agrandit un motif indépendamment de l'image dont il vient", () => {
    const scaled = scaleGeometricShape(shape, { targetWidthMm: 3200 });
    const { width, height } = boundsDimensions(boundsFromPoints(scaled.shape.vertices));
    expect(width).toBeCloseTo(3200, 6);
    expect(height).toBeCloseTo(3200, 6);
    expect(scaled.warnings).toHaveLength(0);
  });

  it("avertit explicitement quand les proportions ne sont pas conservées", () => {
    const scaled = scaleGeometricShape(shape, { targetWidthMm: 3200, targetHeightMm: 2000, keepProportions: false });
    const { width, height } = boundsDimensions(boundsFromPoints(scaled.shape.vertices));
    expect(width).toBeCloseTo(3200, 6);
    expect(height).toBeCloseTo(2000, 6);
    expect(scaled.warnings[0]).toContain("cercles deviennent des ellipses");
  });

  it("refuse une cible absente ou nulle", () => {
    expect(() => scaleGeometricShape(shape, {})).toThrow();
    expect(() => scaleGeometricShape(shape, { targetWidthMm: 0 })).toThrow();
  });
});

describe("annotation de provenance (§35)", () => {
  it("nomme l'origine réelle de chaque forme", () => {
    const calibration = computeCalibration({ pointA: { x: 0, y: 0 }, pointB: { x: 100, y: 0 }, realDistance: 500, realUnit: "mm" });
    const fromPhoto = contourToGeometricShape(
      confirmContour(createRawContour({ id: "p1", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }], space: "image-pixels", closed: true, source: "manual" })),
      { calibration, imageHeightPx: 200 },
    );
    expect(describeShapeSource(fromPhoto)).toBe("Calibré depuis photo");
    expect(describeShapeSource({ ...fromPhoto, origin: "approximated" })).toBe("Approximation");
    expect(describeShapeSource({ ...fromPhoto, origin: "manual" })).toBe("Dessiné manuellement");
  });
});
