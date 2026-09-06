/**
 * §5, §6, §42, §43 — Import d'une référence (photo, capture, croquis) : acceptation du
 * format, taille de travail, orientation EXIF.
 *
 * Tout est pur : aucun accès DOM ici. Le décodage réel (`<canvas>` / `createImageBitmap`)
 * vit dans `image-decode.ts`, qui consomme ces fonctions.
 *
 * Deux règles tenues :
 *   - §3  : un format non décodable par le navigateur (HEIC) est refusé explicitement,
 *           jamais « pris en charge » par un bricolage.
 *   - §42 : une photo de téléphone est réduite à une taille de travail avant tout
 *           algorithme. La réduction est un facteur connu, donc la calibration reste
 *           convertible (`rescaleCalibration`) au lieu d'être silencieusement fausse.
 */

import {
  detectFormat,
  isSupportedFormat,
  isCalibrated,
  type CalibrationState,
  type ReferenceImageFormat,
} from "./reference-image";

/* -------------------------------------------------------------------------- */
/*  §3 — Acceptation d'un fichier                                             */
/* -------------------------------------------------------------------------- */

export type ReferenceFileDecision =
  | { accepted: true; format: ReferenceImageFormat }
  | { accepted: false; format: ReferenceImageFormat | null; reason: string };

/** Types MIME à proposer dans un `<input type="file">` (§6). */
export const REFERENCE_FILE_ACCEPT = "image/jpeg,image/png,image/webp";

/** Taille de fichier maximale acceptée à l'import (§42). */
export const MAX_REFERENCE_FILE_BYTES = 40 * 1024 * 1024;

/**
 * Décide si un fichier peut devenir une image de référence. `mimeOrName` accepte aussi bien
 * un type MIME (`image/webp`) qu'un nom de fichier (`photo.HEIC`).
 */
export function decideReferenceFile(mimeOrName: string, sizeBytes?: number): ReferenceFileDecision {
  const format = detectFormat(mimeOrName);
  if (!format) {
    return { accepted: false, format: null, reason: "Format d'image non reconnu. Utilisez JPEG, PNG ou WEBP." };
  }
  if (format === "heic") {
    return { accepted: false, format, reason: "HEIC non pris en charge pour le moment. Exportez la photo en JPEG depuis votre téléphone." };
  }
  if (!isSupportedFormat(format)) {
    return { accepted: false, format, reason: "Format d'image non pris en charge pour le moment." };
  }
  if (sizeBytes !== undefined && (!Number.isFinite(sizeBytes) || sizeBytes <= 0)) {
    return { accepted: false, format, reason: "Fichier image illisible." };
  }
  if (sizeBytes !== undefined && sizeBytes > MAX_REFERENCE_FILE_BYTES) {
    return { accepted: false, format, reason: "Image trop volumineuse (40 Mo maximum)." };
  }
  return { accepted: true, format };
}

/* -------------------------------------------------------------------------- */
/*  §42 — Taille de travail                                                   */
/* -------------------------------------------------------------------------- */

/** Côté maximal du calque de référence affiché et tracé. */
export const MAX_WORKING_DIMENSION_PX = 2400;

/** Budget en pixels pour les algorithmes de détection (§14) : ~1 Mpx. */
export const MAX_ANALYSIS_PIXELS = 1_200_000;

export type WorkingSize = {
  widthPx: number;
  heightPx: number;
  /** Facteur appliqué à la source : `working = source × scale`. Vaut 1 si aucune réduction. */
  scale: number;
  downscaled: boolean;
};

/**
 * Réduit une image source à une taille de travail raisonnable en conservant le rapport
 * d'aspect. Une photo 48 Mpx ne doit jamais alimenter directement un algorithme (§42).
 */
export function computeWorkingSize(
  sourceWidthPx: number,
  sourceHeightPx: number,
  maxDimensionPx: number = MAX_WORKING_DIMENSION_PX,
): WorkingSize {
  if (!Number.isFinite(sourceWidthPx) || !Number.isFinite(sourceHeightPx) || sourceWidthPx < 1 || sourceHeightPx < 1) {
    throw new Error("Dimensions d'image source invalides.");
  }
  if (!Number.isFinite(maxDimensionPx) || maxDimensionPx < 1) throw new Error("Dimension de travail maximale invalide.");
  const largest = Math.max(sourceWidthPx, sourceHeightPx);
  if (largest <= maxDimensionPx) {
    return { widthPx: Math.round(sourceWidthPx), heightPx: Math.round(sourceHeightPx), scale: 1, downscaled: false };
  }
  const scale = maxDimensionPx / largest;
  return {
    widthPx: Math.max(1, Math.round(sourceWidthPx * scale)),
    heightPx: Math.max(1, Math.round(sourceHeightPx * scale)),
    scale,
    downscaled: true,
  };
}

/** Taille d'analyse (détection de contours) bornée par un budget de pixels (§14, §42). */
export function computeAnalysisSize(widthPx: number, heightPx: number, maxPixels: number = MAX_ANALYSIS_PIXELS): WorkingSize {
  if (!Number.isFinite(widthPx) || !Number.isFinite(heightPx) || widthPx < 1 || heightPx < 1) {
    throw new Error("Dimensions d'image invalides.");
  }
  const pixels = widthPx * heightPx;
  if (pixels <= maxPixels) return { widthPx: Math.round(widthPx), heightPx: Math.round(heightPx), scale: 1, downscaled: false };
  // Arrondi vers le bas : le budget de pixels est une contrainte, pas une cible.
  const scale = Math.sqrt(maxPixels / pixels);
  return {
    widthPx: Math.max(1, Math.floor(widthPx * scale)),
    heightPx: Math.max(1, Math.floor(heightPx * scale)),
    scale,
    downscaled: true,
  };
}

/**
 * Transporte une calibration d'un espace pixel vers un autre (réduction ou agrandissement).
 * `scale` est le facteur appliqué aux pixels : `nouveau = ancien × scale`. Un pixel valant
 * deux fois moins de millimètres quand l'image est deux fois plus grande, `mmPerPixel` est
 * divisé par `scale`. Sans cette conversion, redimensionner l'image fausserait toutes les cotes.
 */
export function rescaleCalibration(state: CalibrationState, scale: number): CalibrationState {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("Le facteur de redimensionnement doit être supérieur à 0.");
  if (!isCalibrated(state)) return state;
  return {
    ...state,
    mmPerPixel: state.mmPerPixel / scale,
    pixelDistance: state.pixelDistance * scale,
    pointA: { x: state.pointA.x * scale, y: state.pointA.y * scale },
    pointB: { x: state.pointB.x * scale, y: state.pointB.y * scale },
  };
}

/* -------------------------------------------------------------------------- */
/*  §43 — Orientation EXIF                                                    */
/* -------------------------------------------------------------------------- */

export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** Redressement à appliquer pour annuler une orientation EXIF. */
export type ExifOrientationAdjust = { rotationDeg: number; mirrorX: boolean; swapsAxes: boolean };

const EXIF_ORIENTATION_ADJUST: Record<ExifOrientation, ExifOrientationAdjust> = {
  1: { rotationDeg: 0, mirrorX: false, swapsAxes: false },
  2: { rotationDeg: 0, mirrorX: true, swapsAxes: false },
  3: { rotationDeg: 180, mirrorX: false, swapsAxes: false },
  4: { rotationDeg: 180, mirrorX: true, swapsAxes: false },
  5: { rotationDeg: 90, mirrorX: true, swapsAxes: true },
  6: { rotationDeg: 90, mirrorX: false, swapsAxes: true },
  7: { rotationDeg: 270, mirrorX: true, swapsAxes: true },
  8: { rotationDeg: 270, mirrorX: false, swapsAxes: true },
};

export function exifOrientationAdjust(orientation: ExifOrientation): ExifOrientationAdjust {
  return EXIF_ORIENTATION_ADJUST[orientation];
}

/** Vrai si l'orientation échange largeur et hauteur (photo prise à 90°). */
export function exifOrientationSwapsAxes(orientation: ExifOrientation): boolean {
  return EXIF_ORIENTATION_ADJUST[orientation].swapsAxes;
}

/**
 * Lit le tag EXIF `Orientation` (0x0112) d'un JPEG. Retourne `null` si absent ou illisible
 * (PNG, WEBP, JPEG sans EXIF) — ce n'est pas une erreur.
 *
 * Utilisé comme secours : les navigateurs récents redressent déjà l'image via
 * `createImageBitmap(blob, { imageOrientation: "from-image" })`. Aucune dépendance ajoutée
 * pour cette lecture (§43).
 */
export function readJpegExifOrientation(bytes: Uint8Array): ExifOrientation | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null; // pas un JPEG (SOI)
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) return null; // début des données compressées
    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) return null;
    if (marker === 0xe1) {
      const orientation = readExifOrientationFromApp1(bytes, offset + 4, segmentLength - 2);
      if (orientation) return orientation;
    }
    offset += 2 + segmentLength;
  }
  return null;
}

function readExifOrientationFromApp1(bytes: Uint8Array, start: number, length: number): ExifOrientation | null {
  // En-tête « Exif\0\0 » puis en-tête TIFF.
  if (length < 14) return null;
  const header = String.fromCharCode(bytes[start], bytes[start + 1], bytes[start + 2], bytes[start + 3]);
  if (header !== "Exif") return null;
  const tiff = start + 6;
  const byteOrder = (bytes[tiff] << 8) | bytes[tiff + 1];
  const littleEndian = byteOrder === 0x4949;
  if (!littleEndian && byteOrder !== 0x4d4d) return null;
  const u16 = (at: number) => (littleEndian ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1]);
  const u32 = (at: number) =>
    littleEndian
      ? (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0
      : ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
  if (u16(tiff + 2) !== 0x002a) return null;
  const ifdOffset = u32(tiff + 4);
  const ifd = tiff + ifdOffset;
  if (ifd + 2 > start + length) return null;
  const entryCount = u16(ifd);
  for (let index = 0; index < entryCount; index++) {
    const entry = ifd + 2 + index * 12;
    if (entry + 12 > start + length) return null;
    if (u16(entry) === 0x0112) {
      const value = u16(entry + 8);
      return value >= 1 && value <= 8 ? (value as ExifOrientation) : null;
    }
  }
  return null;
}
