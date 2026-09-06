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
  boundsDimensions,
  boundsFromPoints,
  distance,
  polylineLength,
  projectOntoSegment,
  simplifyPolyline,
  simplifyToConstructionElements,
  type ConstructionElement,
  type Point2D,
  type SimplificationMode,
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

/* -------------------------------------------------------------------------- */
/*  §15, §16 — Vectorisation manuelle assistée                                */
/* -------------------------------------------------------------------------- */

/**
 * Ajoute un point au contour. Le tracé vit au-dessus du calque de référence mais en est
 * totalement indépendant (§16) : masquer l'image ne retire rien au dessin.
 */
export function appendContourPoint(contour: RawContour, point: Point2D): RawContour {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error("Le point ajouté a des coordonnées invalides.");
  return { ...contour, status: "proposition", points: [...contour.points, { x: point.x, y: point.y }] };
}

/** Déplace un sommet existant (correction d'une proposition, §18). */
export function moveContourPoint(contour: RawContour, index: number, point: Point2D): RawContour {
  if (!Number.isInteger(index) || index < 0 || index >= contour.points.length) throw new Error("Le point à déplacer n'existe pas.");
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error("Le point déplacé a des coordonnées invalides.");
  const points = contour.points.map((existing, at) => (at === index ? { x: point.x, y: point.y } : existing));
  return { ...contour, status: "proposition", points };
}

/** Supprime un sommet. Refuse de descendre sous deux points : un contour ne serait plus défini. */
export function removeContourPoint(contour: RawContour, index: number): RawContour {
  if (!Number.isInteger(index) || index < 0 || index >= contour.points.length) throw new Error("Le point à supprimer n'existe pas.");
  if (contour.points.length <= 2) throw new Error("Un contour exige au moins deux points.");
  return { ...contour, status: "proposition", points: contour.points.filter((_, at) => at !== index) };
}

/** Ferme ou rouvre le contour. */
export function setContourClosed(contour: RawContour, closed: boolean): RawContour {
  if (closed && contour.points.length < 3) throw new Error("Un contour fermé exige au moins trois points.");
  return { ...contour, closed };
}

/* -------------------------------------------------------------------------- */
/*  §19, §20 — Niveaux de simplification et écart mesuré                      */
/* -------------------------------------------------------------------------- */

/** Libellés UX des trois niveaux (§19). */
export const SIMPLIFICATION_LABELS: Record<SimplificationLevel, string> = {
  precis: "Précis",
  standard: "Équilibré",
  simple: "Chantier",
};

export const SIMPLIFICATION_DESCRIPTIONS: Record<SimplificationLevel, string> = {
  precis: "Conserve le maximum de points — fidèle au relevé, plus long à tracer.",
  standard: "Réduction modérée — bon compromis relevé / traçabilité.",
  simple: "Priorité aux segments et arcs facilement traçables au cordeau et au compas.",
};

/** Correspondance avec les modes du moteur géométrique. */
export const SIMPLIFICATION_ENGINE_MODE: Record<SimplificationLevel, SimplificationMode> = {
  precis: "precise",
  standard: "balanced",
  simple: "site",
};

/**
 * §20 — Écart maximal **mesuré** entre le contour d'origine et sa version simplifiée :
 * pour chaque point d'origine, distance au segment le plus proche de la polyligne simplifiée.
 * C'est cette valeur qui est affichée à l'utilisateur, jamais la tolérance demandée.
 */
export function maxDeviationBetweenPolylines(original: readonly Point2D[], simplified: readonly Point2D[]): number {
  if (simplified.length < 2) throw new Error("La polyligne simplifiée doit contenir au moins deux points.");
  let worst = 0;
  for (const point of original) {
    let nearest = Infinity;
    for (let index = 0; index < simplified.length - 1; index++) {
      const projected = projectOntoSegment(point, { start: simplified[index], end: simplified[index + 1] });
      const value = distance(point, projected);
      if (value < nearest) nearest = value;
    }
    if (nearest > worst) worst = nearest;
  }
  return worst;
}

export type SimplifyReport = SimplifyResult & {
  level: SimplificationLevel;
  /** Écart maximal mesuré, dans l'unité du contour (px ou mm). */
  maxDeviation: number;
  /** Écart maximal en millimètres, seulement s'il est calculable. */
  maxDeviationMm: number | null;
  /** Phrase affichable, construite sur l'écart mesuré (§20, §36, §37). */
  notice: string;
};

/**
 * §19, §20 — Simplifie et **rend compte** de l'écart réellement introduit. L'utilisateur voit
 * ce qu'il perd avant d'accepter.
 */
export function simplifyContourWithReport(contour: RawContour, level: SimplificationLevel, mmPerPixel?: number): SimplifyReport {
  const result = simplifyContourForSite(contour, level, mmPerPixel);
  const maxDeviation = maxDeviationBetweenPolylines(contour.points, result.contour.points);
  const maxDeviationMm =
    contour.space === "millimetres" ? maxDeviation : mmPerPixel && Number.isFinite(mmPerPixel) ? maxDeviation * mmPerPixel : null;
  const notice =
    maxDeviationMm === null
      ? `Simplification ${SIMPLIFICATION_LABELS[level]} — écart maximal ${round(maxDeviation)} px (échelle non définie : aucune valeur en millimètres).`
      : `Simplification ${SIMPLIFICATION_LABELS[level]} — écart maximal ${round(maxDeviationMm)} mm.`;
  return { ...result, level, maxDeviation, maxDeviationMm, notice };
}

export type ConstructionSimplification = {
  elements: ConstructionElement[];
  /** Écart maximal mesuré par le moteur, dans l'unité des points fournis. */
  maxError: number;
  level: SimplificationLevel;
  /** §17 — reste une proposition tant que l'utilisateur n'a pas validé. */
  status: ContourStatus;
  notice: string;
};

/**
 * §21 — Convertit un contour en éléments réellement traçables (segments et arcs de cercle),
 * via le simplificateur du moteur géométrique. C'est la sortie utile au chantier : un
 * cordeau et un compas, pas une nuée de points.
 */
export function contourToConstructionElements(
  contour: RawContour,
  level: SimplificationLevel,
  mmPerPixel?: number,
): ConstructionSimplification {
  let tolerance = SIMPLIFICATION_TOLERANCE_MM[level];
  if (contour.space === "image-pixels") {
    if (!mmPerPixel || !Number.isFinite(mmPerPixel) || mmPerPixel <= 0) {
      throw new Error("Conversion impossible : échelle image requise (mm par pixel).");
    }
    tolerance = tolerance / mmPerPixel;
  }
  const result = simplifyToConstructionElements(contour.points, tolerance, SIMPLIFICATION_ENGINE_MODE[level]);
  const segments = result.elements.filter((element) => element.kind === "segment").length;
  const arcs = result.elements.length - segments;
  return {
    elements: result.elements,
    maxError: result.estimatedMaxError,
    level,
    status: "proposition",
    notice: `${segments} segment(s) et ${arcs} arc(s) proposés — à valider avant utilisation.`,
  };
}

/* -------------------------------------------------------------------------- */
/*  §31, §32 — Mise à l'échelle d'une géométrie confirmée                     */
/* -------------------------------------------------------------------------- */

export type ScaleShapeInput = {
  targetWidthMm?: number;
  targetHeightMm?: number;
  /** Par défaut `true` : les rayons et les tangences sont conservés. */
  keepProportions?: boolean;
};

export type ScaleShapeResult = {
  shape: GeometricShape;
  factorX: number;
  factorY: number;
  /** Avertissements à afficher tels quels (§32, §37). */
  warnings: string[];
};

/**
 * §31, §32 — Redimensionne une géométrie confirmée, indépendamment de l'image dont elle est
 * issue. Une mise à l'échelle non uniforme transforme les cercles en ellipses : l'avertissement
 * est explicite, jamais silencieux.
 */
export function scaleGeometricShape(shape: GeometricShape, input: ScaleShapeInput): ScaleShapeResult {
  const bounds = boundsFromPoints(shape.vertices);
  const { width, height } = boundsDimensions(bounds);
  if (width < 1e-9 || height < 1e-9) throw new Error("Mise à l'échelle impossible : la forme est plate.");
  const keepProportions = input.keepProportions !== false;
  const requestedX = input.targetWidthMm !== undefined ? input.targetWidthMm / width : undefined;
  const requestedY = input.targetHeightMm !== undefined ? input.targetHeightMm / height : undefined;
  if (requestedX === undefined && requestedY === undefined) throw new Error("Indiquez une largeur ou une hauteur cible.");
  for (const factor of [requestedX, requestedY]) {
    if (factor !== undefined && (!Number.isFinite(factor) || factor <= 0)) throw new Error("La dimension cible doit être supérieure à 0.");
  }
  let factorX: number;
  let factorY: number;
  const warnings: string[] = [];
  if (keepProportions) {
    const factor = requestedX ?? requestedY!;
    factorX = factor;
    factorY = factor;
    if (requestedX !== undefined && requestedY !== undefined && Math.abs(requestedX - requestedY) > 1e-9) {
      warnings.push("Proportions conservées : seule la largeur cible a été appliquée, la hauteur en découle.");
      factorX = requestedX;
      factorY = requestedX;
    }
  } else {
    factorX = requestedX ?? 1;
    factorY = requestedY ?? 1;
    if (Math.abs(factorX - factorY) > 1e-9) {
      warnings.push("Mise à l'échelle non uniforme : les cercles deviennent des ellipses, les rayons et les points de tangence changent.");
    }
  }
  const vertices = shape.vertices.map((vertex) => ({
    x: bounds.minX + (vertex.x - bounds.minX) * factorX,
    y: bounds.minY + (vertex.y - bounds.minY) * factorY,
  }));
  return {
    shape: { ...shape, vertices, origin: combineOrigins(shape.origin), derivedFrom: shape.derivedFrom ?? shape.id },
    factorX,
    factorY,
    warnings,
  };
}

/* -------------------------------------------------------------------------- */
/*  §35 — Annotation de fiabilité d'une forme                                 */
/* -------------------------------------------------------------------------- */

/** Libellé de provenance à afficher à côté de la géométrie (§35). */
export function describeShapeSource(shape: GeometricShape): string {
  switch (shape.origin) {
    case "exact":
      return "Géométrie exacte (construction paramétrique)";
    case "manual":
      return "Dessiné manuellement";
    case "calibrated":
      return "Calibré depuis photo";
    case "imported":
      return "Import vectoriel";
    case "approximated":
      return "Approximation";
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
