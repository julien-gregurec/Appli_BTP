/**
 * Types fondamentaux du moteur géométrique paramétrique (unité canonique : mm).
 * Indépendants du DOM, de React et de tout pixel écran.
 */

export type Point2D = { x: number; y: number };
export type Vector2D = { x: number; y: number };

/** Ligne infinie définie par un point et une direction (non nécessairement unitaire). */
export type Line2D = { point: Point2D; direction: Vector2D };

/** Segment borné entre deux points. */
export type Segment2D = { start: Point2D; end: Point2D };

export type Circle2D = { centre: Point2D; radius: number };

/** Arc de cercle. Angles en radians. `counterClockwise` par défaut à true (sens trigonométrique). */
export type Arc2D = { centre: Point2D; radius: number; startAngle: number; endAngle: number; counterClockwise?: boolean };

export type Ellipse2D = { centre: Point2D; radiusX: number; radiusY: number; rotation?: number };

/** Ligne brisée ouverte ou fermée. */
export type Polyline2D = { points: readonly Point2D[]; closed?: boolean };

/** Polygone fermé implicite (le dernier point est relié au premier). */
export type Polygon2D = { points: readonly Point2D[] };

export type BoundingBox2D = { minX: number; minY: number; maxX: number; maxY: number };

/** Dimensions rectangulaires simples (largeur/hauteur), en mm. */
export type Dimensions2D = { width: number; height: number };

/** Matrice de transformation affine 2D : [x'; y'] = [[a, c, e], [b, d, f]] · [x; y; 1]. */
export type Transform2D = { a: number; b: number; c: number; d: number; e: number; f: number };

export type Angle = { radians: number; degrees: number };

/** Qualité d'une valeur métier : jamais d'invention de mesure (§30). */
export type GeometryQuality = "exact" | "approximated";

export type MeasuredValue = { value: number; quality: GeometryQuality; errorTolerance?: number };

export type IntersectionKind = "none" | "one" | "two" | "tangent" | "coincident";
export type IntersectionResult = { kind: IntersectionKind; points: Point2D[] };

export const DEFAULT_EPSILON = 1e-9;

export function isFinitePoint(p: Point2D): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y);
}

export function assertFinitePositive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} doit être supérieur à 0.`);
  return value;
}

export function assertFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new Error(`${label} doit être une valeur numérique finie.`);
  return value;
}
