/**
 * §3 à §6 — Import d'image de référence, redressement et calque de fond.
 * §4        — Calibration : convertir des distances image en dimensions chantier.
 *
 * Règle absolue (§4, §28) : sans échelle calibrée, aucune conversion pixel → mm n'est
 * autorisée. `pixelsToMillimetres` lève une erreur tant que l'échelle n'est pas définie.
 *
 * Tout est en fonctions pures : aucun accès DOM, `<canvas>` ni décodage d'image ici. Le
 * décodage, le rendu du calque et le warp de perspective restent à la couche interface
 * (cf. docs/production-workflow.md, section « Différé »).
 */

import { convertLength, type LengthUnit } from "../units";
import {
  DEFAULT_EPSILON,
  distance,
  polarAngle,
  rotationAround,
  type Point2D,
  type Transform2D,
} from "./geometry-port";

export type ReferenceImageSource = "camera" | "gallery" | "screenshot" | "sketch" | "scan" | "imported";
export type ReferenceImageFormat = "jpg" | "jpeg" | "png" | "webp" | "heic";

/** Formats acceptés sans dépendance supplémentaire. `heic` est reconnu mais différé (§3). */
export const SUPPORTED_REFERENCE_FORMATS: readonly ReferenceImageFormat[] = ["jpg", "jpeg", "png", "webp"];

export function isSupportedFormat(format: ReferenceImageFormat): boolean {
  return SUPPORTED_REFERENCE_FORMATS.includes(format);
}

const EXTENSION_TO_FORMAT: Record<string, ReferenceImageFormat> = {
  jpg: "jpg",
  jpeg: "jpeg",
  jpe: "jpeg",
  png: "png",
  webp: "webp",
  heic: "heic",
  heif: "heic",
  "image/jpeg": "jpeg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heic",
};

/** Déduit le format depuis un type MIME ou un nom de fichier. `null` si inconnu. */
export function detectFormat(mimeOrName: string): ReferenceImageFormat | null {
  const value = mimeOrName.trim().toLowerCase();
  if (value in EXTENSION_TO_FORMAT) return EXTENSION_TO_FORMAT[value];
  const dot = value.lastIndexOf(".");
  if (dot >= 0) {
    const extension = value.slice(dot + 1);
    if (extension in EXTENSION_TO_FORMAT) return EXTENSION_TO_FORMAT[extension];
  }
  return null;
}

/** §5 — Redressement géométrique de l'image (rotation, miroir, recadrage). En pixels image. */
export type ReferenceImageAdjust = {
  rotationDeg: number;
  mirrorX: boolean;
  mirrorY: boolean;
  crop?: { x: number; y: number; width: number; height: number };
};

export const DEFAULT_REFERENCE_ADJUST: ReferenceImageAdjust = { rotationDeg: 0, mirrorX: false, mirrorY: false };

/** §6 — État du calque « Fond / Référence ». */
export type ReferenceImageLayer = {
  opacity: number; // 0..1
  visible: boolean;
  locked: boolean;
  grayscale: boolean;
  contrast: number; // 1 = neutre
};

export const DEFAULT_REFERENCE_LAYER: ReferenceImageLayer = {
  opacity: 0.55,
  visible: true,
  locked: true,
  grayscale: false,
  contrast: 1,
};

export function clampLayer(layer: ReferenceImageLayer): ReferenceImageLayer {
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
  return {
    opacity: clamp(Number.isFinite(layer.opacity) ? layer.opacity : DEFAULT_REFERENCE_LAYER.opacity, 0, 1),
    visible: layer.visible !== false,
    locked: layer.locked !== false,
    grayscale: layer.grayscale === true,
    contrast: clamp(Number.isFinite(layer.contrast) ? layer.contrast : 1, 0.2, 3),
  };
}

/* -------------------------------------------------------------------------- */
/*  §4 — Calibration                                                          */
/* -------------------------------------------------------------------------- */

/** Deux points visibles de l'image (px) et la distance réelle qui les sépare. */
export type CalibrationInput = {
  pointA: Point2D;
  pointB: Point2D;
  realDistance: number;
  realUnit: LengthUnit;
};

export type CalibrationResult = {
  status: "calibrated";
  mmPerPixel: number;
  pixelDistance: number;
  realDistanceMm: number;
};

export type CalibrationState = { status: "undefined" } | CalibrationResult;

export const UNDEFINED_CALIBRATION: CalibrationState = { status: "undefined" };

export function computeCalibration(input: CalibrationInput): CalibrationResult {
  const pixelDistance = distance(input.pointA, input.pointB);
  if (!Number.isFinite(pixelDistance) || pixelDistance < DEFAULT_EPSILON) {
    throw new Error("Les deux points de calibration doivent être distincts.");
  }
  if (!Number.isFinite(input.realDistance) || input.realDistance <= 0) {
    throw new Error("La distance réelle de calibration doit être supérieure à 0.");
  }
  const realDistanceMm = convertLength(input.realDistance, input.realUnit, "mm");
  return {
    status: "calibrated",
    pixelDistance,
    realDistanceMm,
    mmPerPixel: realDistanceMm / pixelDistance,
  };
}

export function isCalibrated(state: CalibrationState): state is CalibrationResult {
  return state.status === "calibrated";
}

/** Libellé d'état à afficher tel quel (§4). */
export function calibrationLabel(state: CalibrationState): "Échelle calibrée" | "Échelle non définie" {
  return isCalibrated(state) ? "Échelle calibrée" : "Échelle non définie";
}

/** §4 — Interdiction : refuse toute conversion tant que l'échelle n'est pas calibrée. */
export function pixelsToMillimetres(state: CalibrationState, pixels: number): number {
  if (!isCalibrated(state)) throw new Error("Échelle non définie : impossible de convertir une distance image en dimension réelle.");
  if (!Number.isFinite(pixels)) throw new Error("La distance en pixels doit être finie.");
  return pixels * state.mmPerPixel;
}

export function millimetresToPixels(state: CalibrationState, millimetres: number): number {
  if (!isCalibrated(state)) throw new Error("Échelle non définie : impossible de convertir une dimension réelle en pixels image.");
  if (!Number.isFinite(millimetres)) throw new Error("La dimension en millimètres doit être finie.");
  return millimetres / state.mmPerPixel;
}

/**
 * Convertit un point image (origine en haut à gauche, Y vers le bas) vers le repère
 * chantier en millimètres (origine en bas à gauche, Y vers le haut — cf. tracing-engine.md).
 * `imageHeightPx` déclenche l'inversion de l'axe Y ; sans lui, Y n'est pas inversé.
 */
export function pixelPointToMillimetres(state: CalibrationState, pointPx: Point2D, imageHeightPx?: number): Point2D {
  const x = pixelsToMillimetres(state, pointPx.x);
  const yPixels = imageHeightPx !== undefined ? imageHeightPx - pointPx.y : pointPx.y;
  return { x, y: pixelsToMillimetres(state, yPixels) };
}

/* -------------------------------------------------------------------------- */
/*  §5 — Redressement à partir d'une ligne censée être horizontale/verticale  */
/* -------------------------------------------------------------------------- */

export type StraightenTarget = "horizontal" | "vertical";

/**
 * Angle (radians) à appliquer pour que la ligne `from → to` devienne parallèle à l'axe
 * demandé. Choisit toujours la plus petite correction, dans ]-π/2, π/2].
 */
export function straightenRotationRadians(from: Point2D, to: Point2D, target: StraightenTarget): number {
  if (distance(from, to) < DEFAULT_EPSILON) throw new Error("Les deux points de redressement doivent être distincts.");
  const current = polarAngle(from, to);
  const step = Math.PI; // axe horizontal : 0 ou π ; axe vertical : π/2 décalé de π
  const reference = target === "horizontal" ? 0 : Math.PI / 2;
  const nearest = Math.round((current - reference) / step) * step + reference;
  return nearest - current;
}

/** Transformation de redressement, autour de `pivot` (par défaut `from`). */
export function straightenTransform(from: Point2D, to: Point2D, target: StraightenTarget, pivot?: Point2D): Transform2D {
  return rotationAround(pivot ?? from, straightenRotationRadians(from, to, target));
}
