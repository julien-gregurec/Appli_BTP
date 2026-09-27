import { distance, polarAngle, pointAtPolar } from "./measure";
import type { Point2D } from "./types";

/**
 * Guides directionnels d'accrochage — briques génériques d'Engine B, complémentaires de
 * `snap.ts` (qui accroche à des POINTS : extrémités, milieux, intersections…). Ici on accroche
 * à des DIRECTIONS et des ALIGNEMENTS : horizontale, verticale, angles usuels depuis un point
 * d'origine, et axes X / Y passant par des points existants.
 *
 * Unités du modèle ; la tolérance est déjà convertie de l'écran vers le monde par l'appelant.
 */

export type AngleGuide = {
  /** Point contraint (même distance à l'origine que le curseur). */
  point: Point2D;
  /** Angle retenu, en degrés dans [0, 360). */
  degrees: number;
  /** Écart angulaire corrigé, en degrés. */
  deviation: number;
};

/**
 * Contraint la direction origine → curseur au multiple de `stepDegrees` le plus proche, si
 * l'écart est inférieur à `toleranceDegrees`. Renvoie `null` sinon (ou si le curseur est sur
 * l'origine). Avec un pas de 90°, c'est la contrainte horizontale / verticale.
 */
export function constrainToAngleStep(origin: Point2D, cursor: Point2D, stepDegrees: number, toleranceDegrees: number): AngleGuide | null {
  const length = distance(origin, cursor);
  if (!(length > 0) || !(stepDegrees > 0)) return null;
  const raw = (polarAngle(origin, cursor) * 180) / Math.PI;
  const snapped = Math.round(raw / stepDegrees) * stepDegrees;
  const deviation = Math.abs(raw - snapped);
  if (deviation > toleranceDegrees) return null;
  const degrees = ((snapped % 360) + 360) % 360;
  return { point: pointAtPolar(origin, length, (snapped * Math.PI) / 180), degrees, deviation };
}

export type AlignmentGuide = {
  axis: "x" | "y";
  /** Valeur de l'axe retenu (x = constante pour un axe vertical, y pour un axe horizontal). */
  value: number;
  /** Point existant qui porte l'axe. */
  source: Point2D;
  distance: number;
};

/**
 * Axes d'alignement : la verticale (x = cte) et l'horizontale (y = cte) passant par des points
 * existants, à moins de `tolerance` du curseur. Au plus un guide par axe (le plus proche).
 */
export function alignmentGuides(cursor: Point2D, points: readonly Point2D[], tolerance: number): { x: AlignmentGuide | null; y: AlignmentGuide | null } {
  let x: AlignmentGuide | null = null;
  let y: AlignmentGuide | null = null;
  for (const p of points) {
    const dx = Math.abs(p.x - cursor.x);
    if (dx <= tolerance && (!x || dx < x.distance)) x = { axis: "x", value: p.x, source: p, distance: dx };
    const dy = Math.abs(p.y - cursor.y);
    if (dy <= tolerance && (!y || dy < y.distance)) y = { axis: "y", value: p.y, source: p, distance: dy };
  }
  return { x, y };
}
