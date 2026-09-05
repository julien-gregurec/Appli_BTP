import { radToDeg } from "./angles";
import { distance, polarAngle } from "./measure";
import type { ParametricShape } from "./model";
import type { Point2D } from "./types";

export type ReportPointRow = { id: string; x: number; y: number; distanceFromOrigin: number; angleFromOriginDegrees: number };

/** Table de report chantier : chaque point nommé avec ses coordonnées et sa position depuis l'origine. */
export function buildReportPointsTable(points: Record<string, Point2D>, origin: Point2D = { x: 0, y: 0 }): ReportPointRow[] {
  return Object.entries(points).map(([id, p]) => ({
    id,
    x: p.x,
    y: p.y,
    distanceFromOrigin: distance(origin, p),
    angleFromOriginDegrees: radToDeg(polarAngle(origin, p)),
  }));
}

export function getReportPoints(shape: ParametricShape, origin?: Point2D): ReportPointRow[] {
  return buildReportPointsTable(shape.primitives.points, origin ?? shape.centre);
}
