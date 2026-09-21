import { describe, expect, it } from "vitest";
import { hasBlockingNotice, reviewTracingReliability } from "./reliability";
import { assessPerspective } from "./perspective";
import { computeCalibration, verifyCalibration, withCalibrationCheck, UNDEFINED_CALIBRATION } from "./reference-image";
import { createRawContour } from "./vectorization";

const CALIBRATION = computeCalibration({ pointA: { x: 0, y: 0 }, pointB: { x: 800, y: 0 }, realDistance: 2000, realUnit: "mm" });

function withError(measuredMm: number, expectedMm: number) {
  return withCalibrationCheck(
    CALIBRATION,
    verifyCalibration(CALIBRATION, {
      pointA: { x: 0, y: 0 },
      pointB: { x: measuredMm / CALIBRATION.mmPerPixel, y: 0 },
      expectedDistance: expectedMm,
      expectedUnit: "mm",
    }),
  );
}

describe("avertissements de fiabilité (§37)", () => {
  it("PHOTO NON CALIBRÉE — aucune mesure réelle disponible", () => {
    const notices = reviewTracingReliability({ calibration: UNDEFINED_CALIBRATION });
    expect(notices[0]).toMatchObject({ code: "echelle-non-definie", level: "erreur", title: "Photo non calibrée" });
    expect(notices[0].detail).toContain("Aucune mesure réelle disponible");
  });

  it("recommande la deuxième cote tant qu'aucun contrôle n'a été fait", () => {
    const notices = reviewTracingReliability({ calibration: CALIBRATION });
    expect(notices.some((notice) => notice.code === "calibration-non-controlee")).toBe(true);
    expect(hasBlockingNotice(notices)).toBe(false);
  });

  it("classe une calibration selon l'écart mesuré sur la cote de contrôle", () => {
    const moyenne = reviewTracingReliability({ calibration: withError(830, 800) }); // 3,75 %
    expect(moyenne[0]).toMatchObject({ code: "calibration-insuffisante", level: "avertissement" });
    const insuffisante = reviewTracingReliability({ calibration: withError(900, 800) }); // 12,5 %
    expect(insuffisante[0].level).toBe("erreur");
    expect(hasBlockingNotice(insuffisante)).toBe(true);
  });

  it("PERSPECTIVE — mesures potentiellement imprécises, avec l'écart mesuré", () => {
    const perspective = assessPerspective({ a: { x: 100, y: 0 }, b: { x: 300, y: 0 }, c: { x: 400, y: 300 }, d: { x: 0, y: 300 } });
    const notices = reviewTracingReliability({ calibration: CALIBRATION, perspective });
    const notice = notices.find((entry) => entry.code === "perspective-suspectee");
    expect(notice?.detail).toContain("imprécises");
    expect(notice?.detail).toContain("%");
  });

  it("CONTOUR AUTOMATIQUE — à valider avant utilisation", () => {
    const detected = createRawContour({
      id: "auto",
      points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }],
      space: "image-pixels",
      closed: true,
      source: "detected",
    });
    const notices = reviewTracingReliability({ calibration: CALIBRATION, contours: [detected] });
    const notice = notices.find((entry) => entry.code === "contour-automatique");
    expect(notice?.title).toBe("Contour automatique");
    expect(notice?.detail).toContain("À valider");
  });

  it("SIMPLIFICATION — écart maximal affiché en millimètres", () => {
    const notices = reviewTracingReliability({ calibration: CALIBRATION, simplificationMaxDeviationMm: 8.04 });
    const notice = notices.find((entry) => entry.code === "simplification-ecart");
    expect(notice?.detail).toContain("8 mm");
  });

  it("ne renvoie aucune réserve détectable sur un relevé calibré, contrôlé et validé", () => {
    const notices = reviewTracingReliability({
      calibration: withError(801, 800),
      perspective: assessPerspective({ a: { x: 0, y: 0 }, b: { x: 100, y: 0 }, c: { x: 100, y: 100 }, d: { x: 0, y: 100 } }),
      contours: [
        { ...createRawContour({ id: "ok", points: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], space: "millimetres", closed: true, source: "manual" }), status: "confirmed" },
      ],
      shapes: [{ id: "s", kind: "polygon", vertices: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], closed: true, origin: "calibrated" }],
    });
    expect(notices).toHaveLength(0);
  });
});
