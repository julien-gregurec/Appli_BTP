import { circleFromThreePoints } from "./circle-tools";
import { angleWithinArc } from "./intersections";
import { distance, polarAngle, projectOntoLine } from "./measure";
import type { Arc2D, Point2D, Segment2D } from "./types";

function perpendicularDistance(point: Point2D, lineStart: Point2D, lineEnd: Point2D): number {
  if (distance(lineStart, lineEnd) < 1e-9) return distance(point, lineStart);
  const projected = projectOntoLine(point, { point: lineStart, direction: { x: lineEnd.x - lineStart.x, y: lineEnd.y - lineStart.y } });
  return distance(point, projected);
}

function douglasPeuckerIndices(points: readonly Point2D[], tolerance: number): number[] {
  if (points.length < 3) return points.map((_, i) => i);
  let maxDist = 0;
  let splitIndex = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) { maxDist = d; splitIndex = i; }
  }
  if (maxDist > tolerance) {
    const left = douglasPeuckerIndices(points.slice(0, splitIndex + 1), tolerance);
    const right = douglasPeuckerIndices(points.slice(splitIndex), tolerance).map((i) => i + splitIndex);
    return [...left.slice(0, -1), ...right];
  }
  return [0, points.length - 1];
}

/** Réduit une ligne brisée par l'algorithme de Douglas-Peucker (tolérance en mm). */
export function simplifyPolylineDouglasPeucker(points: readonly Point2D[], tolerance: number): Point2D[] {
  if (points.length < 3) return [...points];
  return douglasPeuckerIndices(points, tolerance).map((i) => points[i]);
}

export type SimplificationMode = "precise" | "balanced" | "site";
const MODE_MULTIPLIER: Record<SimplificationMode, number> = { precise: 1, balanced: 2.5, site: 5 };

export type ConstructionElement = { kind: "segment"; segment: Segment2D } | { kind: "arc"; arc: Arc2D };
export type SimplificationResult = { elements: ConstructionElement[]; estimatedMaxError: number; mode: SimplificationMode; quality: "approximated" };

function maxDeviationFromArc(originalPoints: readonly Point2D[], circle: { centre: Point2D; radius: number }): number {
  let worst = 0;
  for (const p of originalPoints) {
    const deviation = Math.abs(distance(p, circle.centre) - circle.radius);
    if (deviation > worst) worst = deviation;
  }
  return worst;
}

function maxDeviationFromSegment(originalPoints: readonly Point2D[], segment: Segment2D): number {
  let worst = 0;
  for (const p of originalPoints) {
    const d = perpendicularDistance(p, segment.start, segment.end);
    if (d > worst) worst = d;
  }
  return worst;
}

function arcFromThreePoints(start: Point2D, mid: Point2D, end: Point2D) {
  const circle = circleFromThreePoints(start, mid, end);
  const startAngle = polarAngle(circle.centre, start);
  const endAngle = polarAngle(circle.centre, end);
  const midAngle = polarAngle(circle.centre, mid);
  const candidate: Arc2D = { ...circle, startAngle, endAngle, counterClockwise: true };
  const counterClockwise = angleWithinArc(candidate, midAngle);
  return { ...circle, startAngle, endAngle, counterClockwise };
}

/**
 * Simplifie une courbe/polyligne en éléments traçables (segments, arcs) selon un mode chantier.
 * Balayage glouton : à chaque point de départ, étend au maximum un segment ET un arc tant que
 * l'erreur reste sous la tolérance, puis retient celui qui couvre le plus de points (l'arc en cas
 * d'égalité, car il représente mieux une courbe qu'une suite de cordes). Ne prétend jamais
 * respecter une tolérance non vérifiée : l'erreur maximale réellement mesurée est renvoyée.
 */
export function simplifyToConstructionElements(points: readonly Point2D[], tolerance: number, mode: SimplificationMode = "balanced"): SimplificationResult {
  if (points.length < 2) throw new Error("La simplification exige au moins deux points.");
  const effectiveTolerance = tolerance * MODE_MULTIPLIER[mode];
  const elements: ConstructionElement[] = [];
  let estimatedMaxError = 0;
  let startIndex = 0;
  while (startIndex < points.length - 1) {
    let segEnd = startIndex + 1;
    let segError = 0;
    while (segEnd + 1 < points.length) {
      const candidateEnd = segEnd + 1;
      const err = maxDeviationFromSegment(points.slice(startIndex, candidateEnd + 1), { start: points[startIndex], end: points[candidateEnd] });
      if (err > effectiveTolerance) break;
      segEnd = candidateEnd;
      segError = err;
    }
    let arcEnd = -1;
    let arcError = 0;
    let bestArc: Arc2D | null = null;
    if (points.length - startIndex >= 3) {
      let candidateEnd = startIndex + 2;
      while (candidateEnd < points.length) {
        const midIndex = Math.floor((startIndex + candidateEnd) / 2);
        let circle: { centre: Point2D; radius: number };
        try {
          circle = circleFromThreePoints(points[startIndex], points[midIndex], points[candidateEnd]);
        } catch {
          break;
        }
        const err = maxDeviationFromArc(points.slice(startIndex, candidateEnd + 1), circle);
        if (err > effectiveTolerance) break;
        arcEnd = candidateEnd;
        arcError = err;
        bestArc = arcFromThreePoints(points[startIndex], points[Math.floor((startIndex + arcEnd) / 2)], points[arcEnd]);
        candidateEnd++;
      }
    }
    if (bestArc && arcEnd >= segEnd) {
      elements.push({ kind: "arc", arc: bestArc });
      estimatedMaxError = Math.max(estimatedMaxError, arcError);
      startIndex = arcEnd;
    } else {
      elements.push({ kind: "segment", segment: { start: points[startIndex], end: points[segEnd] } });
      estimatedMaxError = Math.max(estimatedMaxError, segError);
      startIndex = segEnd;
    }
  }
  return { elements, estimatedMaxError, mode, quality: "approximated" };
}
