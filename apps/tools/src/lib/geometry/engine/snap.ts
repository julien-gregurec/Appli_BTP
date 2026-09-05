import { tangentPointsFromExternal, cardinalPoints } from "./circle-tools";
import { circleCircleIntersection, lineCircleIntersection, segmentSegmentIntersection } from "./intersections";
import { distance, midpoint, projectOntoSegment, vectorBetween } from "./measure";
import type { Circle2D, Point2D, Segment2D } from "./types";

export type SnapKind = "grid" | "endpoint" | "midpoint" | "centre" | "intersection" | "quadrant" | "perpendicular" | "tangent";
export type SnapCandidate = { kind: SnapKind; point: Point2D; distance: number };

export type SnapContext = {
  gridSize?: number;
  points?: readonly Point2D[];
  segments?: readonly Segment2D[];
  circles?: readonly Circle2D[];
  /** Point de référence pour les accroches perpendiculaire/tangente (ex : origine du trait en cours). */
  referencePoint?: Point2D;
};

/**
 * Calcule les candidats d'accrochage autour du curseur, en unités métier (mm).
 * La tolérance écran est convertie en tolérance métier par l'appelant avant l'appel.
 */
export function findSnapCandidates(cursor: Point2D, context: SnapContext, toleranceWorld: number): SnapCandidate[] {
  const candidates: SnapCandidate[] = [];
  const push = (kind: SnapKind, point: Point2D) => {
    const d = distance(cursor, point);
    if (d <= toleranceWorld) candidates.push({ kind, point, distance: d });
  };

  if (context.gridSize && context.gridSize > 0) {
    push("grid", { x: Math.round(cursor.x / context.gridSize) * context.gridSize, y: Math.round(cursor.y / context.gridSize) * context.gridSize });
  }
  for (const p of context.points ?? []) push("endpoint", p);
  for (const segment of context.segments ?? []) {
    push("endpoint", segment.start);
    push("endpoint", segment.end);
    push("midpoint", midpoint(segment.start, segment.end));
    if (context.referencePoint) push("perpendicular", projectOntoSegment(context.referencePoint, segment));
  }
  for (const circle of context.circles ?? []) {
    push("centre", circle.centre);
    const cardinal = cardinalPoints(circle);
    push("quadrant", cardinal.north);
    push("quadrant", cardinal.east);
    push("quadrant", cardinal.south);
    push("quadrant", cardinal.west);
    if (context.referencePoint) {
      for (const t of tangentPointsFromExternal(context.referencePoint, circle)) push("tangent", t);
    }
  }
  const segments = context.segments ?? [];
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const result = segmentSegmentIntersection(segments[i], segments[j]);
      if (result.kind === "one") push("intersection", result.points[0]);
    }
    for (const circle of context.circles ?? []) {
      const result = lineCircleIntersection({ point: segments[i].start, direction: vectorBetween(segments[i].start, segments[i].end) }, circle);
      for (const p of result.points) push("intersection", p);
    }
  }
  const circles = context.circles ?? [];
  for (let i = 0; i < circles.length; i++) {
    for (let j = i + 1; j < circles.length; j++) {
      const result = circleCircleIntersection(circles[i], circles[j]);
      for (const p of result.points) push("intersection", p);
    }
  }
  return candidates.sort((a, b) => a.distance - b.distance);
}

export function bestSnapCandidate(cursor: Point2D, context: SnapContext, toleranceWorld: number): SnapCandidate | null {
  const candidates = findSnapCandidates(cursor, context, toleranceWorld);
  return candidates[0] ?? null;
}
