/**
 * §7 à §10 — Tracé par-dessus la référence, assistance au contour, vectorisation,
 * simplification chantier.
 *
 * Séparation stricte (§9) :
 *   - RawContour     : contour candidat (photo, croquis, tracé main levée). Peut être bruité,
 *                      exprimé en pixels image ou déjà en millimètres. Toujours provisoire.
 *   - GeometricShape : géométrie définitive, vectorielle, en millimètres, avec origine de
 *                      mesure (§28). Ne peut naître que d'un contour CONFIRMÉ (§8) et, si le
 *                      contour est en pixels, d'une échelle calibrée (§4).
 *
 * §8 — un contour détecté automatiquement porte le statut « proposition » ; jamais un
 * libellé de type « tracé certifié ». Seule une confirmation utilisateur le fait passer
 * à « confirmed ».
 */

import { combineOrigins, type MeasurementOrigin } from "./measurement-origin";
import {
  isCalibrated,
  pixelPointToMillimetres,
  type CalibrationState,
} from "./reference-image";
import {
  polylineLength,
  simplifyPolyline,
  type Point2D,
} from "./geometry-port";

export type ContourSource = "manual" | "detected" | "imported";
export type ContourStatus = "proposition" | "confirmed";
export type ContourSpace = "image-pixels" | "millimetres";

export type RawContour = {
  id: string;
  points: readonly Point2D[];
  space: ContourSpace;
  closed: boolean;
  source: ContourSource;
  status: ContourStatus;
};

export type CreateRawContourInput = {
  id: string;
  points: readonly Point2D[];
  space: ContourSpace;
  closed?: boolean;
  source: ContourSource;
  /** Ignoré pour `source: "detected"` (toujours forcé à « proposition », cf. §8). */
  status?: ContourStatus;
};

export function createRawContour(input: CreateRawContourInput): RawContour {
  if (!Array.isArray(input.points) || input.points.length < 2) {
    throw new Error("Un contour exige au moins deux points.");
  }
  for (const point of input.points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error("Un point du contour a des coordonnées invalides.");
  }
  const status: ContourStatus = input.source === "detected" ? "proposition" : input.status ?? "proposition";
  return {
    id: input.id,
    points: input.points.map((point) => ({ x: point.x, y: point.y })),
    space: input.space,
    closed: input.closed === true,
    source: input.source,
    status,
  };
}

/** §8 — passage explicite « proposition » → « confirmed » après validation utilisateur. */
export function confirmContour(contour: RawContour): RawContour {
  return { ...contour, status: "confirmed" };
}

export function contourLabel(contour: RawContour): string {
  return contour.status === "confirmed" ? "Contour confirmé" : "Proposition (à vérifier)";
}

/* -------------------------------------------------------------------------- */
/*  §10 — Simplification chantier                                             */
/* -------------------------------------------------------------------------- */

export type SimplificationLevel = "precis" | "standard" | "simple";

/** Tolérance de simplification exprimée en millimètres chantier. */
export const SIMPLIFICATION_TOLERANCE_MM: Record<SimplificationLevel, number> = {
  precis: 1,
  standard: 5,
  simple: 20,
};

export type SimplifyResult = {
  contour: RawContour;
  toleranceMm: number;
  pointsBefore: number;
  pointsAfter: number;
  removed: number;
};

/**
 * Réduit un contour à des éléments constructibles. Pour un contour en pixels, `mmPerPixel`
 * est obligatoire afin de convertir la tolérance chantier en tolérance image. Le moteur
 * géométrique (§34) fournit `simplifyPolyline` via l'adaptateur `geometry-port`.
 */
export function simplifyContourForSite(
  contour: RawContour,
  level: SimplificationLevel,
  mmPerPixel?: number,
): SimplifyResult {
  const toleranceMm = SIMPLIFICATION_TOLERANCE_MM[level];
  let tolerance = toleranceMm;
  if (contour.space === "image-pixels") {
    if (!mmPerPixel || !Number.isFinite(mmPerPixel) || mmPerPixel <= 0) {
      throw new Error("Simplification impossible : échelle image requise (mm par pixel).");
    }
    tolerance = toleranceMm / mmPerPixel;
  }
  const simplified = simplifyPolyline(contour.points, tolerance);
  return {
    contour: { ...contour, points: simplified },
    toleranceMm,
    pointsBefore: contour.points.length,
    pointsAfter: simplified.length,
    removed: contour.points.length - simplified.length,
  };
}

/* -------------------------------------------------------------------------- */
/*  §9 — Passage RawContour → GeometricShape                                  */
/* -------------------------------------------------------------------------- */

export type GeometricShape = {
  id: string;
  kind: "polyline" | "polygon";
  /** Sommets en millimètres, repère chantier (Y vers le haut). */
  vertices: readonly Point2D[];
  closed: boolean;
  origin: MeasurementOrigin;
  derivedFrom?: string;
};

export type ContourToShapeOptions = {
  /** Requis si le contour est en pixels image (§4). */
  calibration?: CalibrationState;
  /** Hauteur image en pixels : déclenche l'inversion de l'axe Y. */
  imageHeightPx?: number;
  id?: string;
  /** Origine du contour manuel/importé lorsqu'il est déjà en millimètres. */
  manualOrigin?: MeasurementOrigin;
};

export function contourToGeometricShape(contour: RawContour, options: ContourToShapeOptions = {}): GeometricShape {
  if (contour.status !== "confirmed") {
    throw new Error("Contour non confirmé : l'utilisateur doit valider la proposition avant vectorisation (§8).");
  }
  let vertices: Point2D[];
  let origin: MeasurementOrigin;
  if (contour.space === "image-pixels") {
    const calibration = options.calibration;
    if (!calibration || !isCalibrated(calibration)) {
      throw new Error("Échelle non définie : un contour image ne peut pas devenir une géométrie chantier sans calibration (§4).");
    }
    vertices = contour.points.map((point) => pixelPointToMillimetres(calibration, point, options.imageHeightPx));
    origin = "calibrated";
  } else {
    vertices = contour.points.map((point) => ({ x: point.x, y: point.y }));
    origin = options.manualOrigin ?? (contour.source === "imported" ? "imported" : "manual");
  }
  return {
    id: options.id ?? contour.id,
    kind: contour.closed ? "polygon" : "polyline",
    vertices,
    closed: contour.closed,
    origin: combineOrigins(origin),
    derivedFrom: contour.id,
  };
}

/** Périmètre (mm) d'une forme vectorielle. Un polygone referme sur son premier sommet. */
export function geometricShapePerimeter(shape: GeometricShape): number {
  return polylineLength({ points: shape.vertices, closed: shape.closed });
}
