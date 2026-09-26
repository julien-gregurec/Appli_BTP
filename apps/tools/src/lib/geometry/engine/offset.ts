import { lineLineIntersection } from "./intersections";
import { dot, normalizeVector, vectorBetween } from "./measure";
import { hasSelfIntersection } from "./validate";
import type { Arc2D, Circle2D, Point2D, Polyline2D, Segment2D } from "./types";

/** Décale un segment perpendiculairement à sa direction (positif = vers la gauche du sens start→end). */
export function offsetSegment(segment: Segment2D, distance: number): Segment2D {
  const direction = normalizeVector(vectorBetween(segment.start, segment.end));
  const normal = { x: -direction.y, y: direction.x };
  const shift = { x: normal.x * distance, y: normal.y * distance };
  return { start: { x: segment.start.x + shift.x, y: segment.start.y + shift.y }, end: { x: segment.end.x + shift.x, y: segment.end.y + shift.y } };
}

export function offsetCircle(circle: Circle2D, distance: number): Circle2D {
  const radius = circle.radius + distance;
  if (!Number.isFinite(radius) || radius <= 0) throw new Error("Offset impossible : le rayon résultant serait nul ou négatif.");
  return { centre: circle.centre, radius };
}

export function offsetArc(arc: Arc2D, distance: number): Arc2D {
  const radius = arc.radius + distance;
  if (!Number.isFinite(radius) || radius <= 0) throw new Error("Offset impossible : le rayon résultant serait nul ou négatif.");
  return { ...arc, radius };
}

/**
 * Décale une ligne brisée d'une distance constante (positif = vers la gauche de chaque segment).
 * Les sommets sont recalculés par intersection des supports des arêtes voisines (jonction en onglet).
 * Lève une erreur explicite si le résultat s'auto-intersecte : jamais de contour faux silencieux.
 */
export function offsetPolyline(polyline: Polyline2D, distance: number): Polyline2D {
  const points = polyline.points;
  if (points.length < 2) throw new Error("Une ligne brisée à décaler exige au moins deux points.");
  const closed = polyline.closed === true;
  const edgeCount = closed ? points.length : points.length - 1;
  if (closed && distance > 0) {
    // Pour un contour fermé, un décalage positif ("vers l'intérieur" par construction) ne peut
    // jamais dépasser la distance de chaque arête au centroïde : au-delà, l'arête franchirait le
    // centre et produirait un contour faux sans que les arêtes ne se croisent forcément (cas d'un
    // rectangle symétrique). On le détecte donc explicitement, en plus de l'auto-intersection.
    const centroid = points.reduce((acc, p) => ({ x: acc.x + p.x / points.length, y: acc.y + p.y / points.length }), { x: 0, y: 0 });
    for (let i = 0; i < points.length; i++) {
      const start = points[i];
      const end = points[(i + 1) % points.length];
      const direction = normalizeVector(vectorBetween(start, end));
      const normal = { x: -direction.y, y: direction.x };
      const centroidDistance = dot(normal, { x: centroid.x - start.x, y: centroid.y - start.y });
      if (distance > centroidDistance) {
        throw new Error("Offset impossible : la distance dépasse le rayon intérieur constructible de ce contour (l'arête franchirait le centre).");
      }
    }
  }
  const offsetEdges: Segment2D[] = Array.from({ length: edgeCount }, (_, i) => offsetSegment({ start: points[i], end: points[(i + 1) % points.length] }, distance));
  const resultPoints: Point2D[] = [];
  const vertexCount = closed ? points.length : points.length;
  for (let i = 0; i < vertexCount; i++) {
    if (!closed && i === 0) { resultPoints.push(offsetEdges[0].start); continue; }
    if (!closed && i === vertexCount - 1) { resultPoints.push(offsetEdges[offsetEdges.length - 1].end); continue; }
    const previousEdge = offsetEdges[(i - 1 + offsetEdges.length) % offsetEdges.length];
    const nextEdge = offsetEdges[i % offsetEdges.length];
    const intersection = lineLineIntersection({ point: previousEdge.start, direction: vectorBetween(previousEdge.start, previousEdge.end) }, { point: nextEdge.start, direction: vectorBetween(nextEdge.start, nextEdge.end) });
    resultPoints.push(intersection.kind === "one" ? intersection.points[0] : previousEdge.end);
  }
  const result: Polyline2D = { points: resultPoints, closed };
  if (hasSelfIntersection(result.points, closed)) {
    throw new Error("Offset impossible : le contour décalé s'auto-intersecte (distance trop grande pour cette géométrie).");
  }
  return result;
}
