import { normalizeAngle } from "./angles";
import { cross, distance, polarAngle, vectorBetween } from "./measure";
import { DEFAULT_EPSILON, type Arc2D, type Circle2D, type IntersectionResult, type Line2D, type Point2D, type Segment2D } from "./types";

const NONE: IntersectionResult = { kind: "none", points: [] };

function segmentToLine(segment: Segment2D): Line2D {
  return { point: segment.start, direction: vectorBetween(segment.start, segment.end) };
}

function withinUnitInterval(t: number, epsilon = DEFAULT_EPSILON): boolean {
  return t >= -epsilon && t <= 1 + epsilon;
}

/** Intersection de deux droites infinies. */
export function lineLineIntersection(first: Line2D, second: Line2D, tolerance = DEFAULT_EPSILON): IntersectionResult {
  const denom = cross(first.direction, second.direction);
  const p = first.point, r = first.direction, q = second.point, s = second.direction;
  if (Math.abs(denom) < tolerance) {
    // Droites parallèles : confondues si Q est sur la droite (P, r).
    const qMinusP = vectorBetween(p, q);
    const isCollinear = Math.abs(cross(qMinusP, r)) < tolerance;
    return isCollinear ? { kind: "coincident", points: [] } : NONE;
  }
  const t = cross(vectorBetween(p, q), s) / denom;
  return { kind: "one", points: [{ x: p.x + t * r.x, y: p.y + t * r.y }] };
}

/** Intersection de deux segments bornés. */
export function segmentSegmentIntersection(first: Segment2D, second: Segment2D, tolerance = DEFAULT_EPSILON): IntersectionResult {
  const r = vectorBetween(first.start, first.end);
  const s = vectorBetween(second.start, second.end);
  const denom = cross(r, s);
  const qp = vectorBetween(first.start, second.start);
  if (Math.abs(denom) < tolerance) {
    if (Math.abs(cross(qp, r)) < tolerance) return { kind: "coincident", points: [] };
    return NONE;
  }
  const t = cross(qp, s) / denom;
  const u = cross(qp, r) / denom;
  if (!withinUnitInterval(t, tolerance) || !withinUnitInterval(u, tolerance)) return NONE;
  return { kind: "one", points: [{ x: first.start.x + t * r.x, y: first.start.y + t * r.y }] };
}

function circleIntersectionsWithLine(line: Line2D, circle: Circle2D, tolerance: number, clampToSegment: Segment2D | null): IntersectionResult {
  const d = line.direction;
  const f = vectorBetween(circle.centre, line.point);
  const a = d.x ** 2 + d.y ** 2;
  if (a < tolerance) throw new Error("Intersection impossible avec une ligne de direction nulle.");
  const b = 2 * (f.x * d.x + f.y * d.y);
  const c = f.x ** 2 + f.y ** 2 - circle.radius ** 2;
  const discriminant = b ** 2 - 4 * a * c;
  if (discriminant < -tolerance) return NONE;
  const collect = (values: number[]): Point2D[] => values.map((t) => ({ x: line.point.x + t * d.x, y: line.point.y + t * d.y }));
  let ts: number[];
  let kind: IntersectionResult["kind"];
  if (Math.abs(discriminant) <= tolerance) {
    ts = [-b / (2 * a)];
    kind = "tangent";
  } else {
    const root = Math.sqrt(discriminant);
    ts = [(-b - root) / (2 * a), (-b + root) / (2 * a)];
    kind = "two";
  }
  if (clampToSegment) ts = ts.filter((t) => withinUnitInterval(t, tolerance));
  if (ts.length === 0) return NONE;
  if (ts.length === 1 && kind === "two") kind = "one";
  return { kind, points: collect(ts) };
}

export function lineCircleIntersection(line: Line2D, circle: Circle2D, tolerance = DEFAULT_EPSILON): IntersectionResult {
  return circleIntersectionsWithLine(line, circle, tolerance, null);
}

export function segmentCircleIntersection(segment: Segment2D, circle: Circle2D, tolerance = DEFAULT_EPSILON): IntersectionResult {
  return circleIntersectionsWithLine(segmentToLine(segment), circle, tolerance, segment);
}

export function circleCircleIntersection(first: Circle2D, second: Circle2D, tolerance = DEFAULT_EPSILON): IntersectionResult {
  const d = distance(first.centre, second.centre);
  if (d < tolerance) {
    return Math.abs(first.radius - second.radius) < tolerance ? { kind: "coincident", points: [] } : NONE;
  }
  if (d > first.radius + second.radius + tolerance || d < Math.abs(first.radius - second.radius) - tolerance) return NONE;
  const a = (first.radius ** 2 - second.radius ** 2 + d ** 2) / (2 * d);
  const hSquared = first.radius ** 2 - a ** 2;
  const h = Math.sqrt(Math.max(0, hSquared));
  const x = first.centre.x + (a * (second.centre.x - first.centre.x)) / d;
  const y = first.centre.y + (a * (second.centre.y - first.centre.y)) / d;
  const rx = (-(second.centre.y - first.centre.y) * h) / d;
  const ry = ((second.centre.x - first.centre.x) * h) / d;
  if (h < tolerance) return { kind: "tangent", points: [{ x, y }] };
  return { kind: "two", points: [{ x: x + rx, y: y + ry }, { x: x - rx, y: y - ry }] };
}

/** Vrai si l'angle (radians) appartient au balayage de l'arc, dans son sens de parcours. */
export function angleWithinArc(arc: Arc2D, angleRadians: number, tolerance = 1e-7): boolean {
  const ccw = arc.counterClockwise !== false;
  const start = normalizeAngle(arc.startAngle);
  const twoPi = Math.PI * 2;
  let sweep = normalizeAngle(arc.endAngle) - start;
  if (!ccw) sweep = -sweep;
  sweep = ((sweep % twoPi) + twoPi) % twoPi;
  let delta = normalizeAngle(angleRadians) - start;
  if (!ccw) delta = -delta;
  delta = ((delta % twoPi) + twoPi) % twoPi;
  return delta <= sweep + tolerance || delta >= twoPi - tolerance;
}

function filterPointsOnArc(points: Point2D[], arc: Arc2D): Point2D[] {
  return points.filter((p) => angleWithinArc(arc, polarAngle(arc.centre, p)));
}

function classify(points: Point2D[], baseKind: IntersectionResult["kind"]): IntersectionResult {
  if (points.length === 0) return NONE;
  if (points.length === 1) return { kind: baseKind === "coincident" ? "coincident" : "one", points };
  return { kind: baseKind, points };
}

export function arcLineIntersection(arc: Arc2D, line: Line2D, tolerance = DEFAULT_EPSILON): IntersectionResult {
  const result = lineCircleIntersection(line, { centre: arc.centre, radius: arc.radius }, tolerance);
  if (result.kind === "none" || result.kind === "coincident") return result;
  const onArc = filterPointsOnArc(result.points, arc);
  return classify(onArc, result.kind === "tangent" ? "tangent" : "two");
}

export function arcSegmentIntersection(arc: Arc2D, segment: Segment2D, tolerance = DEFAULT_EPSILON): IntersectionResult {
  const result = segmentCircleIntersection(segment, { centre: arc.centre, radius: arc.radius }, tolerance);
  if (result.kind === "none" || result.kind === "coincident") return result;
  const onArc = filterPointsOnArc(result.points, arc);
  return classify(onArc, result.kind === "tangent" ? "tangent" : "two");
}

export function arcCircleIntersection(arc: Arc2D, circle: Circle2D, tolerance = DEFAULT_EPSILON): IntersectionResult {
  const result = circleCircleIntersection({ centre: arc.centre, radius: arc.radius }, circle, tolerance);
  if (result.kind === "none" || result.kind === "coincident") return result;
  const onArc = filterPointsOnArc(result.points, arc);
  return classify(onArc, result.kind === "tangent" ? "tangent" : "two");
}

export function arcArcIntersection(first: Arc2D, second: Arc2D, tolerance = DEFAULT_EPSILON): IntersectionResult {
  const result = circleCircleIntersection({ centre: first.centre, radius: first.radius }, { centre: second.centre, radius: second.radius }, tolerance);
  if (result.kind === "none" || result.kind === "coincident") return result;
  const onBoth = result.points.filter((p) => angleWithinArc(first, polarAngle(first.centre, p)) && angleWithinArc(second, polarAngle(second.centre, p)));
  return classify(onBoth, result.kind === "tangent" ? "tangent" : "two");
}
