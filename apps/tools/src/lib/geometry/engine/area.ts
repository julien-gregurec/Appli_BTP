import { angularSweepOf } from "./measure";
import type { Arc2D, Circle2D, Ellipse2D, Point2D, Polygon2D } from "./types";

export function circleArea(circle: Circle2D): number {
  return Math.PI * circle.radius ** 2;
}

export function ellipseArea(ellipse: Ellipse2D): number {
  return Math.PI * ellipse.radiusX * ellipse.radiusY;
}

/** Aire d'un polygone simple (non auto-intersecté) par la formule du lacet. Signée : positive en sens trigonométrique. */
export function signedPolygonArea(points: readonly Point2D[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return sum / 2;
}

export function polygonArea(polygon: Polygon2D): number {
  return Math.abs(signedPolygonArea(polygon.points));
}

/** Aire du secteur circulaire délimité par un arc et son centre (portion de disque, pas le segment). */
export function circularSectorArea(arc: Arc2D): number {
  return 0.5 * arc.radius ** 2 * angularSweepOf(arc);
}

/** Aire du segment circulaire (entre la corde et l'arc). */
export function circularSegmentArea(arc: Arc2D): number {
  const sweep = angularSweepOf(arc);
  return 0.5 * arc.radius ** 2 * (sweep - Math.sin(sweep));
}
