import { mirrorAxis, applyTransform } from "./transform";
import { distance, vectorBetween } from "./measure";
import type { Circle2D, Point2D, Segment2D, Vector2D } from "./types";

/**
 * Fondations légères pour des contraintes de traçage. Ce ne sont pas un solveur CAD complet :
 * chaque fonction applique directement une contrainte simple à une géométrie donnée. Une
 * résolution itérative multi-contraintes pourra être ajoutée plus tard sans remettre en cause
 * ces briques (§23).
 */
export type ConstraintKind = "horizontal" | "vertical" | "parallel" | "perpendicular" | "concentric" | "tangent" | "equalRadius" | "symmetry";

/** Déplace `b` pour que le segment A-B devienne horizontal (conserve A et la longueur). */
export function constrainHorizontal(a: Point2D, b: Point2D): Point2D {
  return { x: a.x + Math.sign(b.x - a.x || 1) * distance(a, b), y: a.y };
}

/** Déplace `b` pour que le segment A-B devienne vertical (conserve A et la longueur). */
export function constrainVertical(a: Point2D, b: Point2D): Point2D {
  return { x: a.x, y: a.y + Math.sign(b.y - a.y || 1) * distance(a, b) };
}

/** Fait pivoter `target` autour de son point de départ pour le rendre parallèle à `reference`. */
export function constrainParallel(reference: Segment2D, target: Segment2D): Segment2D {
  const refDirection = vectorBetween(reference.start, reference.end);
  const angle = Math.atan2(refDirection.y, refDirection.x);
  const length = distance(target.start, target.end);
  return { start: target.start, end: { x: target.start.x + length * Math.cos(angle), y: target.start.y + length * Math.sin(angle) } };
}

/** Fait pivoter `target` pour le rendre perpendiculaire à `reference`. */
export function constrainPerpendicular(reference: Segment2D, target: Segment2D): Segment2D {
  const refDirection = vectorBetween(reference.start, reference.end);
  const angle = Math.atan2(refDirection.y, refDirection.x) + Math.PI / 2;
  const length = distance(target.start, target.end);
  return { start: target.start, end: { x: target.start.x + length * Math.cos(angle), y: target.start.y + length * Math.sin(angle) } };
}

/** Recentre `target` sur le centre de `reference` (même centre, rayon conservé). */
export function constrainConcentric(reference: Circle2D, target: Circle2D): Circle2D {
  return { centre: reference.centre, radius: target.radius };
}

/** Force `target` à prendre le rayon de `reference` (centre conservé). */
export function constrainEqualRadius(reference: Circle2D, target: Circle2D): Circle2D {
  return { centre: target.centre, radius: reference.radius };
}

/**
 * Ajuste le rayon de `target` pour qu'il devienne tangent extérieurement (ou intérieurement)
 * à `reference`, en conservant son centre.
 */
export function constrainTangentToCircle(reference: Circle2D, target: Circle2D, mode: "external" | "internal" = "external"): Circle2D {
  const d = distance(reference.centre, target.centre);
  const radius = mode === "external" ? Math.max(0, d - reference.radius) : Math.abs(d - reference.radius);
  return { centre: target.centre, radius };
}

/** Symétrise `point` par rapport à un axe passant par `axisPoint` de direction `axisDirection`. */
export function constrainSymmetry(point: Point2D, axisPoint: Point2D, axisDirection: Vector2D): Point2D {
  return applyTransform(mirrorAxis(axisPoint, axisDirection), point);
}
