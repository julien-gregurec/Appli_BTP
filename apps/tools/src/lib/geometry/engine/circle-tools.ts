import { angleWithinArc } from "./intersections";
import { cross, distance, midpoint, pointAtPolar, polarAngle, vectorBetween } from "./measure";
import { DEFAULT_EPSILON, type Arc2D, type Circle2D, type Point2D } from "./types";

/** Cercle passant par trois points non alignés (rayon depuis trois points). */
export function circleFromThreePoints(a: Point2D, b: Point2D, c: Point2D, tolerance = DEFAULT_EPSILON): Circle2D {
  const ab = vectorBetween(a, b);
  const bc = vectorBetween(b, c);
  const denom = cross(ab, bc);
  if (Math.abs(denom) < tolerance) throw new Error("Trois points alignés ne définissent pas de cercle.");
  const midAB = midpoint(a, b);
  const midBC = midpoint(b, c);
  // Intersection des deux médiatrices via un système 2x2.
  const d1 = { x: -ab.y, y: ab.x };
  const d2 = { x: -bc.y, y: bc.x };
  const denom2 = cross(d1, d2);
  const t = cross(vectorBetween(midAB, midBC), d2) / denom2;
  const centre = { x: midAB.x + t * d1.x, y: midAB.y + t * d1.y };
  return { centre, radius: distance(centre, a) };
}

/** Points de tangence depuis un point externe vers un cercle. */
export function tangentPointsFromExternal(external: Point2D, circle: Circle2D, tolerance = DEFAULT_EPSILON): Point2D[] {
  const d = distance(external, circle.centre);
  if (d < circle.radius - tolerance) return [];
  if (Math.abs(d - circle.radius) < tolerance) return [{ x: external.x, y: external.y }];
  const base = Math.atan2(external.y - circle.centre.y, external.x - circle.centre.x);
  const delta = Math.acos(circle.radius / d);
  return [pointAtPolar(circle.centre, circle.radius, base + delta), pointAtPolar(circle.centre, circle.radius, base - delta)];
}

export type CardinalPoints = { north: Point2D; east: Point2D; south: Point2D; west: Point2D };

/** Points cardinaux d'un cercle (Nord = +Y, conforme au repère métier Y vers le haut). */
export function cardinalPoints(circle: Circle2D): CardinalPoints {
  return {
    north: { x: circle.centre.x, y: circle.centre.y + circle.radius },
    east: { x: circle.centre.x + circle.radius, y: circle.centre.y },
    south: { x: circle.centre.x, y: circle.centre.y - circle.radius },
    west: { x: circle.centre.x - circle.radius, y: circle.centre.y },
  };
}

/** Répartition régulière de `count` points sur un cercle, à partir de `startAngle` (radians). */
export function pointsOnCircle(circle: Circle2D, count: number, startAngle = 0): Point2D[] {
  if (!Number.isInteger(count) || count < 1) throw new Error("Le nombre de points doit être un entier supérieur ou égal à 1.");
  return Array.from({ length: count }, (_, index) => pointAtPolar(circle.centre, circle.radius, startAngle + (index * 2 * Math.PI) / count));
}

/** Division d'un cercle en N parties égales : renvoie les N points de division. */
export function divideCircle(circle: Circle2D, parts: number, startAngle = 0): Point2D[] {
  if (!Number.isInteger(parts) || parts < 2) throw new Error("Un cercle se divise en au moins 2 parties.");
  return pointsOnCircle(circle, parts, startAngle);
}

/** Division d'un segment en N parties égales : renvoie les N+1 points (extrémités incluses). */
export function divideSegment(a: Point2D, b: Point2D, parts: number): Point2D[] {
  if (!Number.isInteger(parts) || parts < 1) throw new Error("Un segment se divise en au moins 1 partie.");
  return Array.from({ length: parts + 1 }, (_, index) => ({ x: a.x + ((b.x - a.x) * index) / parts, y: a.y + ((b.y - a.y) * index) / parts }));
}

/**
 * Arc passant par deux points (corde) avec une flèche signée : positive vers la gauche
 * du sens `a → b`, négative vers la droite. Généralise la construction segmentaire.
 */
export function arcThroughChordAndSagitta(a: Point2D, b: Point2D, signedRise: number): Arc2D & { apex: Point2D } {
  const chordLengthValue = distance(a, b);
  if (chordLengthValue < DEFAULT_EPSILON) throw new Error("Impossible de construire un arc sur une corde nulle.");
  if (Math.abs(signedRise) < DEFAULT_EPSILON) throw new Error("La flèche ne peut pas être nulle (l'arc serait un segment).");
  const halfChord = chordLengthValue / 2;
  const rise = Math.abs(signedRise);
  const radius = (halfChord ** 2 + rise ** 2) / (2 * rise);
  const u = { x: (b.x - a.x) / chordLengthValue, y: (b.y - a.y) / chordLengthValue };
  const n = { x: -u.y, y: u.x };
  const mid = midpoint(a, b);
  const sign = Math.sign(signedRise);
  const apex = { x: mid.x + n.x * signedRise, y: mid.y + n.y * signedRise };
  const centre = { x: mid.x - sign * n.x * (radius - rise), y: mid.y - sign * n.y * (radius - rise) };
  const angleA = polarAngle(centre, a);
  const angleB = polarAngle(centre, b);
  const apexAngle = polarAngle(centre, apex);
  const candidate: Arc2D = { centre, radius, startAngle: angleA, endAngle: angleB, counterClockwise: true };
  const counterClockwise = angleWithinArc(candidate, apexAngle);
  return { centre, radius, startAngle: angleA, endAngle: angleB, counterClockwise, apex };
}
