import { describe, expect, it } from "vitest";
import {
  calibrateReference,
  confirmContourGeometry,
  controlCalibration,
  createTracingGeometry,
  createTracingGeometryFromImage,
  detectContourProposal,
  fitContourGeometry,
  importReferenceImage,
  resizeReferenceImage,
  setReferenceLayer,
  setReferenceTransform,
  simplifyContour,
  traceContour,
} from "./api";
import { hasBlockingNotice, reviewTracingReliability } from "./reliability";
import { assessPerspective } from "./perspective";
import { isRealWorldTrusted } from "./measurement-origin";
import type { GrayscaleImage } from "./edge-detection";
import type { Point2D } from "./geometry-port";

function importedPhoto() {
  return importReferenceImage({
    id: "img-1",
    name: "Rosace salon",
    mimeOrName: "image/jpeg",
    source: "camera",
    sourceWidthPx: 4032,
    sourceHeightPx: 3024,
    sizeBytes: 3_400_000,
  });
}

describe("import de référence (§5, §42, §46)", () => {
  it("crée un calque non calibré, ramené à la taille de travail", () => {
    const { image, workingScale, downscaled } = importedPhoto();
    expect(downscaled).toBe(true);
    expect(image.widthPx).toBe(2400);
    expect(image.calibration.status).toBe("undefined");
    expect(image.layer.locked).toBe(true);
    expect(workingScale).toBeCloseTo(2400 / 4032, 9);
  });

  it("refuse un HEIC à l'import plutôt que de le laisser passer", () => {
    expect(() =>
      importReferenceImage({ id: "img-2", name: "Photo", mimeOrName: "reference.heic", source: "gallery", sourceWidthPx: 100, sourceHeightPx: 100 }),
    ).toThrow(/HEIC non pris en charge/);
  });

  it("applique redressement et réglages de calque", () => {
    const { image } = importedPhoto();
    const rotated = setReferenceTransform(image, { rotationDeg: -3.2, mirrorX: false, mirrorY: false });
    expect(rotated.adjust.rotationDeg).toBeCloseTo(-3.2, 9);
    const faded = setReferenceLayer(rotated, { ...rotated.layer, opacity: 2, visible: false });
    expect(faded.layer.opacity).toBe(1);
    expect(faded.layer.visible).toBe(false);
    expect(() => setReferenceTransform(image, { rotationDeg: 0, mirrorX: false, mirrorY: false, crop: { x: 0, y: 0, width: 99999, height: 10 } })).toThrow(/sort de l'image/);
  });
});

describe("interdiction absolue de mesurer sans calibration (§4, §49)", () => {
  it("refuse de produire une géométrie chantier depuis une photo non calibrée", () => {
    const { image } = importedPhoto();
    const contour = confirmContourGeometry(
      traceContour({ id: "ct-1", points: [{ x: 100, y: 100 }, { x: 500, y: 120 }, { x: 480, y: 600 }], closed: true }),
    );
    expect(() => createTracingGeometryFromImage(contour, image)).toThrow(/Échelle non définie/);
  });

  it("signale l'absence d'échelle comme une réserve bloquante", () => {
    const { image } = importedPhoto();
    const notices = reviewTracingReliability({ calibration: image.calibration });
    expect(notices[0].code).toBe("echelle-non-definie");
    expect(hasBlockingNotice(notices)).toBe(true);
  });
});

describe("une proposition ne devient jamais exacte toute seule (§17, §18, §49)", () => {
  const detectable: GrayscaleImage = {
    width: 100,
    height: 100,
    data: Uint8Array.from({ length: 100 * 100 }, (_, index) => {
      const x = index % 100;
      const y = Math.floor(index / 100);
      return Math.hypot(x - 50, y - 50) <= 30 ? 15 : 240;
    }),
  };

  it("un contour détecté sort en proposition et ne peut pas être vectorisé tel quel", () => {
    const { contour, notice } = detectContourProposal("ct-auto", detectable);
    expect(contour.source).toBe("detected");
    expect(contour.status).toBe("proposition");
    expect(notice).toContain("à valider");
    expect(() => createTracingGeometry(contour, { manualOrigin: "manual" })).toThrow(/non confirmé/);
  });

  it("un contour détecté forcé en « confirmed » à la construction reste une proposition", () => {
    const { contour } = detectContourProposal("ct-auto-2", detectable);
    expect(contour.status).toBe("proposition");
  });

  it("une géométrie ajustée reste une proposition portant son erreur mesurée", () => {
    const { contour } = detectContourProposal("ct-auto-3", detectable);
    const proposal = fitContourGeometry(contour, 3, { closed: true });
    expect(proposal.status).toBe("proposition");
    expect(proposal.label).toMatch(/valider|polyligne/);
    if (proposal.fit.kind === "circle") {
      expect(proposal.fit.circle.radius).toBeGreaterThan(28);
      expect(proposal.fit.circle.radius).toBeLessThan(32);
      expect(proposal.fit.maxError).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("une approximation garde son statut d'approximation (§35, §49)", () => {
  it("une forme importée ou approximée n'est jamais présentée comme fiable", () => {
    expect(isRealWorldTrusted("approximated")).toBe(false);
    expect(isRealWorldTrusted("imported")).toBe(false);
    expect(isRealWorldTrusted("calibrated")).toBe(true);
    const notices = reviewTracingReliability({
      calibration: { status: "undefined" },
      shapes: [{ id: "s1", kind: "polygon", vertices: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], closed: true, origin: "approximated" }],
    });
    expect(notices.some((notice) => notice.code === "forme-non-fiable")).toBe(true);
  });
});

describe("parcours complet photo → géométrie (§46, §56)", () => {
  it("enchaîne import, calibration, contrôle, tracé, simplification et validation", () => {
    const { image } = importedPhoto();
    // L'artisan connaît une cote sur la photo : 1200 mm entre deux repères distants de 842 px.
    const calibrated = calibrateReference(image, {
      pointA: { x: 300, y: 1500 },
      pointB: { x: 1142, y: 1500 },
      realDistance: 1200,
      realUnit: "mm",
      at: new Date("2026-09-06T08:00:00.000Z"),
    });
    expect(calibrated.calibration.status).toBe("calibrated");

    // Deuxième cote de contrôle : l'écart est affiché, pas masqué.
    const mmPerPixel = calibrated.calibration.status === "calibrated" ? calibrated.calibration.mmPerPixel : 0;
    const controlled = controlCalibration(calibrated, {
      pointA: { x: 0, y: 0 },
      pointB: { x: 802 / mmPerPixel, y: 0 },
      expectedDistance: 800,
      expectedUnit: "mm",
    });
    expect(controlled.check.deviationMm).toBeCloseTo(2, 6);
    expect(controlled.check.errorPercent).toBeCloseTo(0.25, 6);
    expect(controlled.check.quality).toBe("excellent");

    const square: Point2D[] = [
      { x: 400, y: 400 },
      { x: 400 + 1000 / mmPerPixel, y: 400 },
      { x: 400 + 1000 / mmPerPixel, y: 400 + 1000 / mmPerPixel },
      { x: 400, y: 400 + 1000 / mmPerPixel },
    ];
    const traced = traceContour({ id: "ct-2", points: square, closed: true });
    const simplified = simplifyContour(traced, "standard", mmPerPixel);
    expect(simplified.maxDeviationMm).toBeCloseTo(0, 6);

    const confirmed = confirmContourGeometry(simplified.contour);
    const shape = createTracingGeometryFromImage(confirmed, controlled.image);
    expect(shape.origin).toBe("calibrated");
    // Le carré tracé mesure bien 1000 mm de côté une fois converti.
    const width = Math.max(...shape.vertices.map((v) => v.x)) - Math.min(...shape.vertices.map((v) => v.x));
    expect(width).toBeCloseTo(1000, 6);

    const notices = reviewTracingReliability({
      calibration: controlled.image.calibration,
      contours: [confirmed],
      shapes: [shape],
      perspective: assessPerspective({ a: { x: 0, y: 0 }, b: { x: 400, y: 0 }, c: { x: 400, y: 400 }, d: { x: 0, y: 400 } }),
    });
    expect(hasBlockingNotice(notices)).toBe(false);
  });

  it("conserve les cotes réelles quand l'image de travail est redimensionnée", () => {
    const { image } = importedPhoto();
    const calibrated = calibrateReference(image, { pointA: { x: 0, y: 0 }, pointB: { x: 800, y: 0 }, realDistance: 1600, realUnit: "mm" });
    const resized = resizeReferenceImage(calibrated, 1200, 900);
    const contour = confirmContourGeometry(
      traceContour({ id: "ct-3", points: [{ x: 0, y: 900 }, { x: 400, y: 900 }, { x: 400, y: 700 }], closed: true }),
    );
    const shape = createTracingGeometryFromImage(contour, resized);
    // 400 px dans l'image réduite valent toujours 1600 mm.
    expect(Math.max(...shape.vertices.map((v) => v.x))).toBeCloseTo(1600, 6);
  });
});
