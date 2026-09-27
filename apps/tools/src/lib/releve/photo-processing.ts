/**
 * Traitement navigateur d'une photo de terrain avant dépôt (Lot 4).
 *
 * 1. Lecture EXIF minimale (date, orientation, dimensions, présence GPS) — `readExifSummary`.
 * 2. Décodage avec l'orientation EXIF appliquée (`createImageBitmap(…, { imageOrientation: "from-image" })`,
 *    repli `<img>` qui applique aussi l'orientation par défaut).
 * 3. Ré-encodage JPEG par paliers (`planPhotoCompression`) : taille raisonnable, et l'EXIF
 *    d'origine (GPS, appareil, numéro de série) n'est jamais transmis.
 * 4. Empreinte SHA-256 des octets déposés, métadonnées de preuve (`buildPhotoMetadata`).
 */
import {
  buildPhotoMetadata, captureCapabilities, MEDIA_CATEGORY_POLICIES, needsNextCompressionStep, PHOTO_COMPRESSION, planPhotoCompression,
  readExifSummary, sha256Hex, type CaptureCapabilities, type CaptureEnvironment, type PhotoMetadata, type PhotoSource,
} from "@elsatia/releve-domain";
import { isNativeRuntime } from "@/lib/platform";

export type ProcessedPhoto = {
  readonly blob: Blob;
  readonly metadata: PhotoMetadata;
  readonly originalBytes: number;
  readonly nomFichier: string | null;
};

export class PhotoProcessingError extends Error {
  constructor(message: string) { super(message); this.name = "PhotoProcessingError"; }
}

type Decoded = { source: CanvasImageSource; width: number; height: number; close(): void };

async function decode(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch { /* repli <img> */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoProcessingError("Image illisible par ce navigateur (format HEIC ?). Exportez-la en JPEG ou reprenez la photo.");
  }
}

function encode(source: CanvasImageSource, width: number, height: number, quality: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new PhotoProcessingError("Compression impossible sur cet appareil.");
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new PhotoProcessingError("Compression impossible."))), PHOTO_COMPRESSION.mimeType, quality));
}

export async function processPhoto(file: Blob, options: { source: PhotoSource; captureAt?: string | null; fileLastModified?: number | null; nomFichier?: string | null; replaceMediaId?: string | null }): Promise<ProcessedPhoto> {
  if (!file.size) throw new PhotoProcessingError("Fichier vide.");
  if (file.size > 60 * 1024 * 1024) throw new PhotoProcessingError("Fichier trop volumineux (60 Mo maximum avant compression).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const exif = readExifSummary(bytes);
  const decoded = await decode(file);
  try {
    const hardLimit = MEDIA_CATEGORY_POLICIES.photos.maxBytes;
    let step = 0; let plan = planPhotoCompression(decoded.width, decoded.height, step);
    let blob = await encode(decoded.source, plan.width, plan.height, plan.quality);
    while (needsNextCompressionStep(blob.size, step, hardLimit)) {
      step += 1; plan = planPhotoCompression(decoded.width, decoded.height, step);
      blob = await encode(decoded.source, plan.width, plan.height, plan.quality);
    }
    if (blob.size > hardLimit) throw new PhotoProcessingError("Photo trop lourde même après compression.");
    const metadata = buildPhotoMetadata({
      source: options.source, exif, captureAt: options.captureAt ?? null, fileLastModified: options.fileLastModified ?? null,
      original: { width: exif.width ?? decoded.width, height: exif.height ?? decoded.height, bytes: file.size },
      stored: { width: plan.width, height: plan.height, quality: plan.quality, maxLongEdgePx: plan.maxLongEdgePx },
      sha256: await sha256Hex(await blob.arrayBuffer()),
      remplaceMediaId: options.replaceMediaId ?? null,
    });
    // Sans EXIF, les dimensions d'origine sont celles du décodage (déjà redressées).
    return { blob, metadata: exif.width ? metadata : { ...metadata, largeurOriginePx: decoded.width, hauteurOriginePx: decoded.height }, originalBytes: file.size, nomFichier: options.nomFichier ?? null };
  } finally {
    decoded.close();
  }
}

/** Environnement de capture réel du navigateur (voir `captureCapabilities`). */
export async function detectCaptureCapabilities(): Promise<CaptureCapabilities> {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const policy = (document as Document & { permissionsPolicy?: { allowsFeature(feature: string): boolean }; featurePolicy?: { allowsFeature(feature: string): boolean } });
  const allows = policy.permissionsPolicy ?? policy.featurePolicy;
  let permissionState: CaptureEnvironment["permissionState"] = null;
  try {
    const status = await nav?.permissions?.query({ name: "camera" as PermissionName });
    permissionState = status?.state ?? null;
  } catch { permissionState = null; }
  return captureCapabilities({
    secureContext: window.isSecureContext,
    hasMediaDevices: Boolean(nav?.mediaDevices),
    hasGetUserMedia: typeof nav?.mediaDevices?.getUserMedia === "function",
    policyAllowsCamera: allows ? allows.allowsFeature("camera") : null,
    permissionState,
    native: isNativeRuntime(),
    coarsePointer: window.matchMedia?.("(pointer: coarse)").matches ?? false,
  });
}
