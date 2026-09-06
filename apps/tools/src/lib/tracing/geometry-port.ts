/**
 * Adaptateur unique vers le moteur géométrique paramétrique (`../geometry/engine`).
 *
 * Objectif §34 : le workflow production/chantier ne duplique pas le moteur. Tous les
 * modules `tracing/` et `chantier/` importent leurs primitives ici, jamais directement
 * depuis `../geometry/engine/*`. Si le moteur déplace une fonction, seul ce fichier change.
 *
 * Dépendances signalées (fournies par le moteur, cf. §34) :
 *   - types      : Point2D, Vector2D, Polyline2D, BoundingBox2D, Transform2D, Dimensions2D
 *   - mesure     : distance, midpoint, polylineLength, boundsFromPoints, boundsDimensions,
 *                  boundsCentre, mergeBounds, polarAngle
 *   - transform  : applyTransform, applyTransformToPoints, compose, composeAll,
 *                  rotationAround, mirrorHorizontal, mirrorVertical, scaleAround,
 *                  translation, IDENTITY_TRANSFORM
 *   - angles     : degToRad, radToDeg, normalizeAngle
 *   - garde      : assertFinite, assertFinitePositive, DEFAULT_EPSILON, isFinitePoint
 *
 * Fonctions absentes du moteur au moment de l'écriture et donc fournies localement
 * ci-dessous (candidates à remontée ultérieure dans le moteur) :
 *   - perpendicularDistance : distance point → droite (A,B)
 *   - simplifyPolyline      : Douglas–Peucker itératif, tolérance en unité des points
 */

export type {
  Point2D,
  Vector2D,
  Segment2D,
  Polyline2D,
  BoundingBox2D,
  Transform2D,
  Dimensions2D,
} from "../geometry/engine/types";

export {
  DEFAULT_EPSILON,
  isFinitePoint,
  assertFinite,
  assertFinitePositive,
} from "../geometry/engine/types";

export {
  distance,
  midpoint,
  polylineLength,
  boundsFromPoints,
  boundsDimensions,
  boundsCentre,
  mergeBounds,
  polarAngle,
} from "../geometry/engine/measure";

export {
  IDENTITY_TRANSFORM,
  applyTransform,
  applyTransformToPoints,
  compose,
  composeAll,
  rotationAround,
  mirrorHorizontal,
  mirrorVertical,
  scaleAround,
  translation,
} from "../geometry/engine/transform";

export { degToRad, radToDeg, normalizeAngle } from "../geometry/engine/angles";

/**
 * ATELIER-FREE-CONTOUR-AREA-V1 — aire algébrique et auto-intersection, empruntées au moteur.
 *
 * Le contour libre a besoin des deux, et aucune des deux ne doit être réécrite ici : le moteur
 * les possède déjà (`engine/area.ts`, `engine/validate.ts`), il les applique aux polygones
 * paramétriques, et une seconde implémentation ferait exister deux vérités sur « quelle est la
 * surface de cette forme » — exactement ce que ce port existe pour empêcher (§34).
 *
 * `segmentSegmentIntersection` est exposée pour la même raison : `free-contour.ts` a besoin du
 * PRÉDICAT de croisement, pas d'un algorithme de croisement à lui.
 */
export { signedPolygonArea, polygonArea } from "../geometry/engine/area";
export { hasSelfIntersection } from "../geometry/engine/validate";
export { segmentSegmentIntersection } from "../geometry/engine/intersections";

import { DEFAULT_EPSILON } from "../geometry/engine/types";
import type { Point2D } from "../geometry/engine/types";

/** Distance orthogonale d'un point à la droite infinie (a, b). Renvoie 0 si a ≈ b. */
export function perpendicularDistance(pointToTest: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < DEFAULT_EPSILON) return Math.hypot(pointToTest.x - a.x, pointToTest.y - a.y);
  const cross = Math.abs(dy * (pointToTest.x - a.x) - dx * (pointToTest.y - a.y));
  return cross / Math.sqrt(lengthSquared);
}

/**
 * Simplification Douglas–Peucker (itérative, sans récursion pour éviter tout dépassement
 * de pile sur un contour photo de plusieurs milliers de points). `tolerance` est exprimée
 * dans l'unité des points fournis (px ou mm). Les extrémités sont toujours conservées.
 */
export function simplifyPolyline(points: readonly Point2D[], tolerance: number): Point2D[] {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new Error("La tolérance de simplification doit être positive.");
  if (points.length <= 2) return points.slice();
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop()!;
    let maxDistance = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const d = perpendicularDistance(points[i], points[start], points[end]);
      if (d > maxDistance) {
        maxDistance = d;
        index = i;
      }
    }
    if (index !== -1 && maxDistance > tolerance) {
      keep[index] = true;
      stack.push([start, index], [index, end]);
    }
  }
  const result: Point2D[] = [];
  for (let i = 0; i < points.length; i++) if (keep[i]) result.push(points[i]);
  return result;
}
