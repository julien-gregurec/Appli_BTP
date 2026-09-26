import { describe, expect, it } from "vitest";
import {
  computeAnalysisSize,
  computeWorkingSize,
  decideReferenceFile,
  exifOrientationAdjust,
  exifOrientationSwapsAxes,
  readJpegExifOrientation,
  rescaleCalibration,
  MAX_REFERENCE_FILE_BYTES,
} from "./image-import";
import { computeCalibration, pixelsToMillimetres, UNDEFINED_CALIBRATION } from "./reference-image";

describe("acceptation d'un fichier de référence (§3)", () => {
  it("accepte JPEG, PNG et WEBP", () => {
    expect(decideReferenceFile("image/jpeg")).toEqual({ accepted: true, format: "jpeg" });
    expect(decideReferenceFile("croquis.PNG")).toEqual({ accepted: true, format: "png" });
    expect(decideReferenceFile("image/webp", 120_000)).toEqual({ accepted: true, format: "webp" });
  });

  it("refuse HEIC avec un message explicite plutôt qu'une fausse prise en charge", () => {
    const decision = decideReferenceFile("photo.HEIC");
    expect(decision.accepted).toBe(false);
    expect(decision.format).toBe("heic");
    if (!decision.accepted) expect(decision.reason).toContain("HEIC non pris en charge");
  });

  it("refuse un format inconnu et un fichier hors limite", () => {
    expect(decideReferenceFile("plan.dxf").accepted).toBe(false);
    expect(decideReferenceFile("image/png", MAX_REFERENCE_FILE_BYTES + 1).accepted).toBe(false);
  });
});

describe("taille de travail (§42)", () => {
  it("laisse une image déjà raisonnable intacte", () => {
    expect(computeWorkingSize(1600, 900)).toEqual({ widthPx: 1600, heightPx: 900, scale: 1, downscaled: false });
  });

  it("réduit une photo de téléphone en conservant le rapport d'aspect", () => {
    const working = computeWorkingSize(8000, 6000);
    expect(working.downscaled).toBe(true);
    expect(working.widthPx).toBe(2400);
    expect(working.heightPx).toBe(1800);
    expect(working.widthPx / working.heightPx).toBeCloseTo(8000 / 6000, 6);
  });

  it("borne la taille d'analyse à un budget de pixels", () => {
    const analysis = computeAnalysisSize(4000, 3000, 1_200_000);
    expect(analysis.widthPx * analysis.heightPx).toBeLessThanOrEqual(1_200_000);
    expect(analysis.downscaled).toBe(true);
  });

  it("refuse des dimensions absurdes", () => {
    expect(() => computeWorkingSize(0, 100)).toThrow();
    expect(() => computeWorkingSize(Number.NaN, 100)).toThrow();
  });
});

describe("transport de la calibration lors d'un redimensionnement (§4, §42)", () => {
  it("conserve la dimension réelle mesurée quand l'image est réduite de moitié", () => {
    const calibration = computeCalibration({ pointA: { x: 0, y: 0 }, pointB: { x: 800, y: 0 }, realDistance: 2000, realUnit: "mm" });
    const halved = rescaleCalibration(calibration, 0.5);
    expect(pixelsToMillimetres(calibration, 800)).toBeCloseTo(2000, 9);
    expect(pixelsToMillimetres(halved, 400)).toBeCloseTo(2000, 9);
    expect(halved.status === "calibrated" && halved.pointB.x).toBe(400);
  });

  it("laisse une échelle non définie inchangée et refuse un facteur nul", () => {
    expect(rescaleCalibration(UNDEFINED_CALIBRATION, 0.5)).toBe(UNDEFINED_CALIBRATION);
    expect(() => rescaleCalibration(UNDEFINED_CALIBRATION, 0)).toThrow();
  });
});

describe("orientation EXIF (§43)", () => {
  it("associe chaque orientation à son redressement", () => {
    expect(exifOrientationAdjust(1)).toEqual({ rotationDeg: 0, mirrorX: false, swapsAxes: false });
    expect(exifOrientationAdjust(6)).toEqual({ rotationDeg: 90, mirrorX: false, swapsAxes: true });
    expect(exifOrientationSwapsAxes(8)).toBe(true);
    expect(exifOrientationSwapsAxes(3)).toBe(false);
  });

  it("lit le tag Orientation d'un JPEG", () => {
    expect(readJpegExifOrientation(jpegWithOrientation(6))).toBe(6);
    expect(readJpegExifOrientation(jpegWithOrientation(1))).toBe(1);
  });

  it("renvoie null sans EXIF — ce n'est pas une erreur", () => {
    expect(readJpegExifOrientation(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]))).toBeNull();
    expect(readJpegExifOrientation(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
  });
});

/** JPEG minimal (SOI + APP1/Exif little-endian) portant l'orientation demandée. */
function jpegWithOrientation(orientation: number): Uint8Array {
  const tiff = [
    0x49, 0x49, 0x2a, 0x00, // « II », 42
    0x08, 0x00, 0x00, 0x00, // offset de l'IFD0
    0x01, 0x00, // une entrée
    0x12, 0x01, // tag 0x0112 (Orientation)
    0x03, 0x00, // type SHORT
    0x01, 0x00, 0x00, 0x00, // count 1
    orientation, 0x00, 0x00, 0x00, // valeur
    0x00, 0x00, 0x00, 0x00, // pas d'IFD suivant
  ];
  const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
  const length = payload.length + 2;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, (length >> 8) & 0xff, length & 0xff, ...payload, 0xff, 0xd9]);
}
