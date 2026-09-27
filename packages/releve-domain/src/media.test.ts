import { describe, expect, it } from "vitest";
import {
  buildPhotoMetadata, cameraErrorMessage, captureCapabilities, needsNextCompressionStep, orientationOf, planPhotoCompression,
  sha256Hex, validatePhotoMetadata, PHOTO_COMPRESSION, PHOTO_METADATA_KEYS, type CaptureEnvironment, type PhotoMetadata,
} from "./media";
import { MEDIA_CATEGORY_POLICIES } from "./storage";

const SHA = "a".repeat(64);

describe("compression « preuve terrain »", () => {
  it("réduit un 12 Mpx à 3 072 px de grand côté en conservant les proportions, sans jamais agrandir", () => {
    expect(planPhotoCompression(4032, 3024)).toEqual({ width: 3072, height: 2304, quality: 0.85, maxLongEdgePx: 3072, scaled: true });
    expect(planPhotoCompression(3024, 4032)).toMatchObject({ width: 2304, height: 3072 });
    expect(planPhotoCompression(1280, 960)).toEqual({ width: 1280, height: 960, quality: 0.85, maxLongEdgePx: 3072, scaled: false });
  });

  it("paliers de repli : qualité puis taille, plancher 1 600 px / 0,6", () => {
    expect(planPhotoCompression(8000, 6000, 1)).toMatchObject({ width: 3072, quality: 0.75 });
    expect(planPhotoCompression(8000, 6000, 2)).toMatchObject({ width: 2400, quality: 0.72 });
    expect(planPhotoCompression(8000, 6000, 3)).toMatchObject({ width: 1600, height: 1200, quality: 0.6 });
    expect(planPhotoCompression(8000, 6000, 99)).toMatchObject({ width: 1600, quality: 0.6 });
    expect(() => planPhotoCompression(0, 10)).toThrow();
  });

  it("palier suivant seulement au-delà de la cible (4 Mo) ou de la limite de catégorie, jamais après le dernier", () => {
    const limit = MEDIA_CATEGORY_POLICIES.photos.maxBytes;
    expect(needsNextCompressionStep(2_000_000, 0, limit)).toBe(false);
    expect(needsNextCompressionStep(PHOTO_COMPRESSION.targetMaxBytes + 1, 0, limit)).toBe(true);
    expect(needsNextCompressionStep(limit + 1, PHOTO_COMPRESSION.steps.length - 1, limit)).toBe(false);
  });

  it("orientation de l'image stockée", () => {
    expect([orientationOf(4, 3), orientationOf(3, 4), orientationOf(5, 5)]).toEqual(["paysage", "portrait", "carre"]);
  });
});

describe("métadonnées de photo", () => {
  const base = { original: { width: 4032, height: 3024, bytes: 5_200_000 }, stored: { width: 3072, height: 2304, quality: 0.85, maxLongEdgePx: 3072 }, sha256: SHA };

  it("date EXIF prioritaire ; dimensions d'origine redressées ; GPS signalé comme retiré", () => {
    const metadata = buildPhotoMetadata({
      ...base, source: "import", fileLastModified: Date.parse("2026-01-01T00:00:00Z"), captureAt: "2026-09-27T12:00:00.000Z",
      exif: { orientation: 6, dateTimeOriginal: "2026-09-27T14:05:33+02:00", width: 4032, height: 3024, hasGps: true },
      stored: { width: 2304, height: 3072, quality: 0.85, maxLongEdgePx: 3072 },
    });
    expect(metadata).toMatchObject({
      source: "import", priseLe: "2026-09-27T14:05:33+02:00", priseLeSource: "exif", orientation: "portrait", orientationExif: 6,
      largeurOriginePx: 3024, hauteurOriginePx: 4032, largeurPx: 2304, hauteurPx: 3072, gpsRetire: true, remplaceMediaId: null,
    });
    expect(validatePhotoMetadata(metadata)).toEqual([]);
  });

  it("sans EXIF : horloge de capture, sinon date du fichier, sinon inconnue", () => {
    expect(buildPhotoMetadata({ ...base, source: "camera_web", exif: null, captureAt: "2026-09-27T10:00:00.000Z" })).toMatchObject({ priseLe: "2026-09-27T10:00:00.000Z", priseLeSource: "capture", gpsRetire: false });
    expect(buildPhotoMetadata({ ...base, source: "import", exif: null, fileLastModified: Date.parse("2026-05-04T03:02:01Z") })).toMatchObject({ priseLe: "2026-05-04T03:02:01.000Z", priseLeSource: "fichier" });
    expect(buildPhotoMetadata({ ...base, source: "import", exif: null })).toMatchObject({ priseLe: null, priseLeSource: null });
  });

  it("liste de clés fermée : aucune clé de localisation, aucune clé inconnue", () => {
    const valid = buildPhotoMetadata({ ...base, source: "camera_appareil", exif: null, originalSha256: "c".repeat(64) });
    expect(validatePhotoMetadata(valid)).toEqual([]);
    expect(validatePhotoMetadata({ ...valid, empreinteOrigineSha256: "pas-un-hash" }).map((issue) => issue.key)).toEqual(["empreinteOrigineSha256"]);
    // Facultative : absente des métadonnées construites sans empreinte d'origine.
    expect("empreinteOrigineSha256" in buildPhotoMetadata({ ...base, source: "import", exif: null })).toBe(false);
    expect(validatePhotoMetadata({ ...valid, latitude: 48.58 }).map((issue) => issue.key)).toEqual(["latitude"]);
    expect(validatePhotoMetadata({ ...valid, gps: { lat: 1 } })[0].message).toMatch(/localisation/);
    expect(validatePhotoMetadata({ ...valid, appareil: "iPhone" })[0]).toEqual({ key: "appareil", message: "Clé non autorisée." });
    expect(Object.keys(valid).sort()).toEqual([...PHOTO_METADATA_KEYS].sort());
  });

  it("valeurs contrôlées ; objet vide admis (médias antérieurs et non photo)", () => {
    const valid: PhotoMetadata = buildPhotoMetadata({ ...base, source: "camera_web", exif: null });
    expect(validatePhotoMetadata({})).toEqual([]);
    expect(validatePhotoMetadata([])).toHaveLength(1);
    const keys = (value: Record<string, unknown>) => validatePhotoMetadata({ ...valid, ...value }).map((issue) => issue.key);
    expect(keys({ source: "drone" })).toEqual(["source"]);
    expect(keys({ empreinteSha256: "xyz" })).toEqual(["empreinteSha256"]);
    expect(keys({ orientationExif: 9, largeurPx: 0, compressionQualite: 2, remplaceMediaId: "abc" })).toEqual(["orientationExif", "largeurPx", "compressionQualite", "remplaceMediaId"]);
    expect(validatePhotoMetadata({ largeurPx: 10 }).map((issue) => issue.key)).toEqual(["source", "orientation", "hauteurPx", "empreinteSha256"]);
  });

  it("empreinte SHA-256 des octets déposés", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("faisabilité de la capture Web (getUserMedia, input capture, permissions)", () => {
  const web: CaptureEnvironment = { secureContext: true, hasMediaDevices: true, hasGetUserMedia: true, policyAllowsCamera: true, permissionState: "prompt", native: false, coarsePointer: true };

  it("caméra en direct proposée en HTTPS avec getUserMedia et politique autorisant la caméra", () => {
    expect(captureCapabilities(web)).toEqual({ liveCamera: true, liveCameraReason: null, fileCapture: true, fileImport: true });
    expect(captureCapabilities({ ...web, permissionState: null, policyAllowsCamera: null }).liveCamera).toBe(true);
  });

  it.each([
    [{ secureContext: false }, /HTTPS/],
    [{ hasGetUserMedia: false }, /navigateur/],
    [{ policyAllowsCamera: false }, /politique/],
    [{ permissionState: "denied" as const }, /refusé/],
    [{ native: true }, /native/],
  ])("repli sur « Prendre une photo » / « Importer » quand %o", (patch, reason) => {
    const capabilities = captureCapabilities({ ...web, ...patch });
    expect(capabilities.liveCamera).toBe(false);
    expect(capabilities.liveCameraReason).toMatch(reason);
    expect(capabilities.fileCapture && capabilities.fileImport).toBe(true);
  });

  it("messages d'erreur getUserMedia", () => {
    expect(cameraErrorMessage("NotAllowedError")).toMatch(/refusé/);
    expect(cameraErrorMessage("NotFoundError")).toMatch(/Aucune caméra/);
    expect(cameraErrorMessage("NotReadableError")).toMatch(/autre application/);
    expect(cameraErrorMessage(undefined)).toMatch(/indisponible/);
  });
});
