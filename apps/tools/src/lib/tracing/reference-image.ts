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
import type { MeasurementOrigin } from "./measurement-origin";
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


/** §13 — Redressement simple : rotation libre, quarts de tour, miroirs. */
export function rotateAdjust(adjust: ReferenceImageAdjust, deltaDeg: number): ReferenceImageAdjust {
  if (!Number.isFinite(deltaDeg)) throw new Error("L'angle de rotation doit être fini.");
  return { ...adjust, rotationDeg: normalizeRotationDeg(adjust.rotationDeg + deltaDeg) };
}

export function rotateAdjustQuarterTurn(adjust: ReferenceImageAdjust, direction: "cw" | "ccw" = "cw"): ReferenceImageAdjust {
  return rotateAdjust(adjust, direction === "cw" ? 90 : -90);
}

export function flipAdjust(adjust: ReferenceImageAdjust, axis: "horizontal" | "vertical"): ReferenceImageAdjust {
  return axis === "horizontal" ? { ...adjust, mirrorX: !adjust.mirrorX } : { ...adjust, mirrorY: !adjust.mirrorY };
}

/** Ramène un angle dans [0, 360[. */
export function normalizeRotationDeg(deg: number): number {
  if (!Number.isFinite(deg)) throw new Error("L'angle de rotation doit être fini.");
  const wrapped = deg % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Vrai si le redressement échange largeur et hauteur (quart de tour). */
export function adjustSwapsAxes(adjust: ReferenceImageAdjust): boolean {
  const quarter = Math.round(normalizeRotationDeg(adjust.rotationDeg) / 90) % 4;
  return quarter === 1 || quarter === 3;
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
  /** Horodatage de la calibration (§9). Par défaut : maintenant. */
  at?: Date;
};

export type CalibrationResult = {
  status: "calibrated";
  mmPerPixel: number;
  pixelDistance: number;
  realDistanceMm: number;
  /** §9 — traçabilité : points utilisés, unité saisie, date, origine de la mesure. */
  pointA: Point2D;
  pointB: Point2D;
  realUnit: LengthUnit;
  calibratedAt: string;
  origin: MeasurementOrigin;
  /** §10 — cote de contrôle, renseignée seulement si l'utilisateur en a mesuré une. */
  check?: CalibrationCheck;
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
    pointA: { x: input.pointA.x, y: input.pointA.y },
    pointB: { x: input.pointB.x, y: input.pointB.y },
    realUnit: input.realUnit,
    calibratedAt: (input.at ?? new Date()).toISOString(),
    origin: "calibrated",
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
/*  §10 — Deuxième cote de contrôle                                           */
/* -------------------------------------------------------------------------- */

/** Qualité déduite d'un écart **mesuré**, jamais d'un score inventé (§36). */
export type CalibrationQuality = "excellent" | "bon" | "moyen" | "insuffisant";

export type CalibrationCheck = {
  pointA: Point2D;
  pointB: Point2D;
  /** Cote attendue par l'utilisateur, convertie en mm. */
  expectedMm: number;
  /** Cote obtenue en appliquant l'échelle calibrée à la distance image. */
  measuredMm: number;
  /** `measuredMm - expectedMm` : signé, pour dire si l'image sur- ou sous-estime. */
  deviationMm: number;
  /** Écart relatif en pourcentage, toujours positif. */
  errorPercent: number;
  quality: CalibrationQuality;
  checkedAt: string;
};

/** Seuils d'écart relatif (%) pour qualifier une calibration. */
export const CALIBRATION_QUALITY_THRESHOLDS: Record<Exclude<CalibrationQuality, "insuffisant">, number> = {
  excellent: 0.5,
  bon: 2,
  moyen: 5,
};

export function calibrationQualityFromError(errorPercent: number): CalibrationQuality {
  const error = Math.abs(errorPercent);
  if (error <= CALIBRATION_QUALITY_THRESHOLDS.excellent) return "excellent";
  if (error <= CALIBRATION_QUALITY_THRESHOLDS.bon) return "bon";
  if (error <= CALIBRATION_QUALITY_THRESHOLDS.moyen) return "moyen";
  return "insuffisant";
}

export type CalibrationCheckInput = {
  pointA: Point2D;
  pointB: Point2D;
  expectedDistance: number;
  expectedUnit: LengthUnit;
  at?: Date;
};

/**
 * §10 — Mesure une deuxième cote connue avec l'échelle déjà calibrée et renvoie l'écart réel.
 * L'écart n'est jamais masqué ni lissé : c'est la seule mesure de qualité honnête dont
 * dispose l'utilisateur (§36).
 */
export function verifyCalibration(state: CalibrationState, input: CalibrationCheckInput): CalibrationCheck {
  if (!isCalibrated(state)) throw new Error("Échelle non définie : impossible de contrôler une cote avant calibration.");
  const pixelDistance = distance(input.pointA, input.pointB);
  if (!Number.isFinite(pixelDistance) || pixelDistance < DEFAULT_EPSILON) {
    throw new Error("Les deux points de la cote de contrôle doivent être distincts.");
  }
  if (!Number.isFinite(input.expectedDistance) || input.expectedDistance <= 0) {
    throw new Error("La cote de contrôle doit être supérieure à 0.");
  }
  const expectedMm = convertLength(input.expectedDistance, input.expectedUnit, "mm");
  const measuredMm = pixelDistance * state.mmPerPixel;
  const deviationMm = measuredMm - expectedMm;
  const errorPercent = Math.abs(deviationMm / expectedMm) * 100;
  return {
    pointA: { x: input.pointA.x, y: input.pointA.y },
    pointB: { x: input.pointB.x, y: input.pointB.y },
    expectedMm,
    measuredMm,
    deviationMm,
    errorPercent,
    quality: calibrationQualityFromError(errorPercent),
    checkedAt: (input.at ?? new Date()).toISOString(),
  };
}

/** Attache une cote de contrôle à la calibration (la calibration elle-même n'est pas modifiée). */
export function withCalibrationCheck(state: CalibrationResult, check: CalibrationCheck): CalibrationResult {
  return { ...state, check };
}

/** Phrase à afficher telle quelle sous la calibration (§10, §37). Jamais un pourcentage inventé. */
export function describeCalibrationQuality(state: CalibrationState): string {
  if (!isCalibrated(state)) return "Échelle non définie — aucune mesure réelle disponible.";
  if (!state.check) return "Échelle calibrée sur une seule cote — contrôle recommandé sur une deuxième cote connue.";
  const { expectedMm, measuredMm, deviationMm, errorPercent, quality } = state.check;
  const signed = deviationMm >= 0 ? "+" : "−";
  return `Qualité calibration : ${quality} — attendu ${formatMm(expectedMm)}, calculé ${formatMm(measuredMm)}, écart ${signed}${formatMm(Math.abs(deviationMm))} (${errorPercent.toFixed(2)} %).`;
}

function formatMm(value: number): string {
  return `${Math.round(value * 10) / 10} mm`;
}

/* -------------------------------------------------------------------------- */
/*  §30 — Grille de contrôle d'échelle                                        */
/* -------------------------------------------------------------------------- */

/** Pas de grille proposés une fois l'image calibrée (mm). */
export const CALIBRATION_GRID_STEPS_MM: readonly number[] = [100, 250, 500, 1000];

export type CalibrationGrid = { stepMm: number; stepPx: number; lineCountX: number; lineCountY: number };

/**
 * Grille réelle projetée sur l'image calibrée : elle permet de vérifier **visuellement** que
 * l'échelle est cohérente (une dalle de 600 mm doit couvrir un peu plus d'une maille de 500).
 */
export function calibrationGrid(state: CalibrationState, stepMm: number, imageWidthPx: number, imageHeightPx: number): CalibrationGrid {
  if (!isCalibrated(state)) throw new Error("Échelle non définie : aucune grille réelle ne peut être affichée.");
  if (!Number.isFinite(stepMm) || stepMm <= 0) throw new Error("Le pas de grille doit être supérieur à 0.");
  if (!Number.isFinite(imageWidthPx) || !Number.isFinite(imageHeightPx) || imageWidthPx <= 0 || imageHeightPx <= 0) {
    throw new Error("Les dimensions de l'image doivent être positives.");
  }
  const stepPx = stepMm / state.mmPerPixel;
  return {
    stepMm,
    stepPx,
    lineCountX: Math.floor(imageWidthPx / stepPx) + 1,
    lineCountY: Math.floor(imageHeightPx / stepPx) + 1,
  };
}

/** Pas de grille le plus lisible pour l'image courante (maille d'au moins 40 px). */
export function suggestCalibrationGridStep(state: CalibrationState, imageWidthPx: number): number {
  if (!isCalibrated(state)) throw new Error("Échelle non définie : aucune grille réelle ne peut être affichée.");
  const usable = CALIBRATION_GRID_STEPS_MM.filter((step) => step / state.mmPerPixel >= 40 && step / state.mmPerPixel <= imageWidthPx);
  return usable[0] ?? CALIBRATION_GRID_STEPS_MM[CALIBRATION_GRID_STEPS_MM.length - 1];
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
