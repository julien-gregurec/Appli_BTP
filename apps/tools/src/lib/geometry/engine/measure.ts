import { normalizeAngle, toAngle } from "./angles";
import { DEFAULT_EPSILON, type Angle, type Arc2D, type BoundingBox2D, type Circle2D, type Line2D, type Point2D, type Polyline2D, type Segment2D, type Vector2D } from "./types";

export function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function vectorBetween(a: Point2D, b: Point2D): Vector2D {
  return { x: b.x - a.x, y: b.y - a.y };
}

export function vectorLength(v: Vector2D): number {
  return Math.hypot(v.x, v.y);
}

export function normalizeVector(v: Vector2D): Vector2D {
  const length = vectorLength(v);
  if (length < DEFAULT_EPSILON) throw new Error("Impossible de normaliser un vecteur nul.");
  return { x: v.x / length, y: v.y / length };
}

export function dot(a: Vector2D, b: Vector2D): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Vector2D, b: Vector2D): number {
  return a.x * b.y - a.y * b.x;
}

/** Angle non signé entre deux vecteurs, dans [0, π]. */
export function angleBetweenVectors(a: Vector2D, b: Vector2D): Angle {
  const denominator = vectorLength(a) * vectorLength(b);
  if (denominator < DEFAULT_EPSILON) throw new Error("Angle impossible avec un vecteur nul.");
  const radians = Math.acos(Math.max(-1, Math.min(1, dot(a, b) / denominator)));
  return toAngle(radians);
}

/** Angle non signé au sommet B du triangle A-B-C, dans [0, π]. */
export function angleAtVertex(a: Point2D, vertex: Point2D, c: Point2D): Angle {
  return angleBetweenVectors(vectorBetween(vertex, a), vectorBetween(vertex, c));
}

/** Angle polaire (radians) du vecteur allant de `from` vers `to`, mesuré depuis l'axe X. */
export function polarAngle(from: Point2D, to: Point2D): number {
  return Math.atan2(to.y - from.y, to.x - from.x);
}

export function pointAtPolar(centre: Point2D, radius: number, angleRadians: number): Point2D {
  return { x: centre.x + radius * Math.cos(angleRadians), y: centre.y + radius * Math.sin(angleRadians) };
}

/** Projection orthogonale d'un point sur une droite infinie. */
export function projectOntoLine(source: Point2D, line: Line2D): Point2D {
  const lengthSquared = line.direction.x ** 2 + line.direction.y ** 2;
  if (lengthSquared < DEFAULT_EPSILON) throw new Error("Projection impossible sur une droite de direction nulle.");
  const t = ((source.x - line.point.x) * line.direction.x + (source.y - line.point.y) * line.direction.y) / lengthSquared;
  return { x: line.point.x + t * line.direction.x, y: line.point.y + t * line.direction.y };
}

/** Projection orthogonale d'un point sur un segment (résultat borné à la droite support, pas au segment). */
export function projectOntoSegment(source: Point2D, segment: Segment2D): Point2D {
  return projectOntoLine(source, { point: segment.start, direction: vectorBetween(segment.start, segment.end) });
}

/** Droite perpendiculaire à `line`, passant par `through`. */
export function perpendicularThrough(line: Line2D, through: Point2D): Line2D {
  return { point: through, direction: { x: -line.direction.y, y: line.direction.x } };
}

/** Droite parallèle à `line`, passant par `through`. */
export function parallelThrough(line: Line2D, through: Point2D): Line2D {
  return { point: through, direction: { ...line.direction } };
}

/** Droite bissectrice de l'angle au sommet B du triangle A-B-C. */
export function bisector(a: Point2D, vertex: Point2D, c: Point2D): Line2D {
  const ua = normalizeVector(vectorBetween(vertex, a));
  const uc = normalizeVector(vectorBetween(vertex, c));
  const direction = { x: ua.x + uc.x, y: ua.y + uc.y };
  if (vectorLength(direction) < DEFAULT_EPSILON) {
    // A, B, C alignés et opposés : la bissectrice est perpendiculaire à l'axe.
    return { point: vertex, direction: { x: -ua.y, y: ua.x } };
  }
  return { point: vertex, direction };
}

/** Bissectrice perpendiculaire (médiatrice) d'un segment. */
export function perpendicularBisector(a: Point2D, b: Point2D): Line2D {
  const mid = midpoint(a, b);
  const direction = vectorBetween(a, b);
  return { point: mid, direction: { x: -direction.y, y: direction.x } };
}

export function segmentLength(segment: Segment2D): number {
  return distance(segment.start, segment.end);
}

export function polylineLength(polyline: Polyline2D): number {
  const points = polyline.points;
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < points.length; i++) total += distance(points[i - 1], points[i]);
  if (polyline.closed) total += distance(points[points.length - 1], points[0]);
  return total;
}

export function arcLength(arc: Arc2D): number {
  const sweep = angularSweepOf(arc);
  return Math.abs(arc.radius * sweep);
}

export function angularSweepOf(arc: Arc2D): number {
  const ccw = arc.counterClockwise !== false;
  let delta = normalizeAngle(arc.endAngle) - normalizeAngle(arc.startAngle);
  if (!ccw) delta = -delta;
  const twoPi = Math.PI * 2;
  delta = delta % twoPi;
  return delta < 0 ? delta + twoPi : delta;
}

export function circleCircumference(circle: Circle2D): number {
  return 2 * Math.PI * circle.radius;
}

export function chordLength(radius: number, angleRadians: number): number {
  return 2 * radius * Math.sin(Math.abs(angleRadians) / 2);
}

export function sagitta(radius: number, chord: number): number {
  if (!Number.isFinite(radius) || radius <= 0) throw new Error("Le rayon doit être supérieur à 0.");
  if (!Number.isFinite(chord) || chord <= 0) throw new Error("La corde doit être supérieure à 0.");
  if (chord > radius * 2) throw new Error("La corde ne peut pas dépasser le diamètre.");
  return radius - Math.sqrt(radius ** 2 - (chord / 2) ** 2);
}

/** Somme des longueurs d'un ensemble hétérogène de segments/arcs/polylignes/cercles. */
export function totalLength(elements: readonly (Segment2D | Arc2D | Polyline2D | Circle2D)[]): number {
  return elements.reduce((sum, element) => {
    if ("radius" in element && "startAngle" in element) return sum + arcLength(element);
    if ("radius" in element) return sum + circleCircumference(element);
    if ("points" in element) return sum + polylineLength(element);
    return sum + segmentLength(element);
  }, 0);
}

export function boundsFromPoints(points: readonly Point2D[], padding = 0): BoundingBox2D {
  if (!points.length) throw new Error("Une bounding box exige au moins un point.");
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX: minX - padding, minY: minY - padding, maxX: maxX + padding, maxY: maxY + padding };
}

export function boundsCentre(bounds: BoundingBox2D): Point2D {
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

export function boundsDimensions(bounds: BoundingBox2D): { width: number; height: number } {
  return { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };
}

export function mergeBounds(a: BoundingBox2D, b: BoundingBox2D): BoundingBox2D {
  return { minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) };
}
