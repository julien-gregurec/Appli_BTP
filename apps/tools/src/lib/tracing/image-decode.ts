/**
 * §6, §41, §42, §43, §44 — Décodage réel d'une image de référence.
 *
 * Seul module du workflow à toucher au navigateur (`createImageBitmap`, `<canvas>`). Il est
 * isolé pour que toute la logique métier reste testable sans DOM.
 *
 * §42 — l'image est décodée puis **réduite** à la taille de travail avant tout usage : une
 *       photo 48 Mpx n'alimente jamais directement un algorithme.
 * §43 — l'orientation EXIF est demandée au navigateur (`imageOrientation: "from-image"`),
 *       avec repli sur la lecture du tag pour les moteurs qui l'ignorent. Aucune dépendance.
 * §44 — tout se passe sur l'appareil : aucun octet ne sort d'ici.
 */

import { toGrayscale, type GrayscaleImage } from "./edge-detection";
import {
  computeAnalysisSize,
  computeWorkingSize,
  decideReferenceFile,
  exifOrientationAdjust,
  readJpegExifOrientation,
  MAX_WORKING_DIMENSION_PX,
  type ExifOrientation,
} from "./image-import";
import type { ReferenceImageFormat } from "./reference-image";

export type DecodedReferenceImage = {
  format: ReferenceImageFormat;
  /** Dimensions du fichier d'origine, après application de l'orientation EXIF. */
  sourceWidthPx: number;
  sourceHeightPx: number;
  /** Dimensions de l'image de travail — celles dans lesquelles on clique et on calibre. */
  widthPx: number;
  heightPx: number;
  /** `working = source × workingScale`. */
  workingScale: number;
  /** Pixels RGBA de l'image de travail. */
  pixels: ImageData;
  /** Orientation EXIF lue dans le fichier, `null` si absente ou non applicable. */
  exifOrientation: ExifOrientation | null;
};

export type DecodeReferenceImageOptions = {
  fileName?: string;
  maxWorkingDimensionPx?: number;
};

function assertBrowser(): void {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") {
    throw new Error("Le décodage d'image n'est disponible que dans l'application.");
  }
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

/**
 * Décode un fichier image et renvoie sa version de travail. Rejette explicitement les formats
 * non pris en charge (HEIC) avant même le décodage (§3).
 */
export async function decodeReferenceImage(file: Blob, options: DecodeReferenceImageOptions = {}): Promise<DecodedReferenceImage> {
  assertBrowser();
  const descriptor = options.fileName ?? file.type;
  const decision = decideReferenceFile(descriptor, file.size);
  if (!decision.accepted) throw new Error(decision.reason);

  const exifOrientation = decision.format === "jpg" || decision.format === "jpeg" ? await readOrientation(file) : null;
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const working = computeWorkingSize(bitmap.width, bitmap.height, options.maxWorkingDimensionPx ?? MAX_WORKING_DIMENSION_PX);
    const canvas = createCanvas(working.widthPx, working.heightPx);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Rendu de l'image impossible sur cet appareil.");
    context.drawImage(bitmap, 0, 0, working.widthPx, working.heightPx);
    return {
      format: decision.format,
      sourceWidthPx: bitmap.width,
      sourceHeightPx: bitmap.height,
      widthPx: working.widthPx,
      heightPx: working.heightPx,
      workingScale: working.scale,
      pixels: context.getImageData(0, 0, working.widthPx, working.heightPx),
      exifOrientation,
    };
  } finally {
    bitmap.close();
  }
}

async function readOrientation(file: Blob): Promise<ExifOrientation | null> {
  try {
    // L'en-tête EXIF tient dans les premiers kilo-octets : inutile de lire toute la photo.
    const head = file.slice(0, Math.min(file.size, 128 * 1024));
    return readJpegExifOrientation(new Uint8Array(await head.arrayBuffer()));
  } catch {
    return null;
  }
}

/**
 * §43 — Redressement à appliquer si le moteur n'a pas honoré `imageOrientation`. Comparer les
 * proportions décodées à celles attendues permet de ne corriger que si c'est nécessaire.
 */
export function pendingExifCorrection(decoded: DecodedReferenceImage): { rotationDeg: number; mirrorX: boolean } | null {
  if (!decoded.exifOrientation) return null;
  const adjust = exifOrientationAdjust(decoded.exifOrientation);
  if (adjust.rotationDeg === 0 && !adjust.mirrorX) return null;
  // Un quart de tour non appliqué se voit : l'image décodée reste dans l'orientation du capteur.
  const landscapeDecoded = decoded.sourceWidthPx >= decoded.sourceHeightPx;
  if (adjust.swapsAxes && landscapeDecoded) return { rotationDeg: adjust.rotationDeg, mirrorX: adjust.mirrorX };
  if (!adjust.swapsAxes) return { rotationDeg: adjust.rotationDeg, mirrorX: adjust.mirrorX };
  return null;
}

/**
 * §14, §42 — Version niveaux de gris réduite au budget d'analyse, prête pour la détection de
 * contour. Le facteur `scale` permet de reprojeter le contour détecté dans l'image de travail.
 */
export function grayscaleForAnalysis(pixels: ImageData, maxPixels?: number): { image: GrayscaleImage; scale: number } {
  const analysis = computeAnalysisSize(pixels.width, pixels.height, maxPixels);
  if (!analysis.downscaled) {
    return { image: toGrayscale(pixels.data, pixels.width, pixels.height), scale: 1 };
  }
  assertBrowser();
  const source = createCanvas(pixels.width, pixels.height);
  const sourceContext = source.getContext("2d");
  if (!sourceContext) throw new Error("Rendu de l'image impossible sur cet appareil.");
  sourceContext.putImageData(pixels, 0, 0);
  const target = createCanvas(analysis.widthPx, analysis.heightPx);
  const targetContext = target.getContext("2d", { willReadFrequently: true });
  if (!targetContext) throw new Error("Rendu de l'image impossible sur cet appareil.");
  targetContext.drawImage(source, 0, 0, analysis.widthPx, analysis.heightPx);
  const reduced = targetContext.getImageData(0, 0, analysis.widthPx, analysis.heightPx);
  return { image: toGrayscale(reduced.data, reduced.width, reduced.height), scale: analysis.scale };
}

/** Reprojette des points de l'espace d'analyse vers l'espace de travail (§14). */
export function scalePointsFromAnalysis(points: readonly { x: number; y: number }[], scale: number) {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Facteur de reprojection invalide.");
  return points.map((point) => ({ x: point.x / scale, y: point.y / scale }));
}

/**
 * URL temporaire d'affichage du calque de fond. À révoquer quand le calque est retiré :
 * une photo de téléphone maintenue en mémoire pèse lourd sur mobile (§41).
 */
export function createReferenceObjectUrl(blob: Blob): string {
  if (typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    throw new Error("Aperçu d'image indisponible sur cette plateforme.");
  }
  return URL.createObjectURL(blob);
}

export function revokeReferenceObjectUrl(url: string): void {
  if (typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
}
