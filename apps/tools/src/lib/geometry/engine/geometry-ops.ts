import { boundsFromPoints, mergeBounds } from "./measure";
import { applyTransform, applyTransformToVector } from "./transform";
import type { Arc2D, BoundingBox2D, Circle2D, Ellipse2D, Point2D, Polygon2D, Polyline2D, Segment2D, Transform2D } from "./types";
import type { ShapePrimitives } from "./model";

export type AnyGeometry = Point2D | Segment2D | Circle2D | Arc2D | Ellipse2D | Polyline2D | Polygon2D;

function isSegment(g: AnyGeometry): g is Segment2D { return "start" in g && "end" in g; }
function isCircle(g: AnyGeometry): g is Circle2D { return "centre" in g && "radius" in g && !("startAngle" in g); }
function isArc(g: AnyGeometry): g is Arc2D { return "centre" in g && "radius" in g && "startAngle" in g; }
function isEllipse(g: AnyGeometry): g is Ellipse2D { return "centre" in g && "radiusX" in g; }
function isPolylineOrPolygon(g: AnyGeometry): g is Polyline2D | Polygon2D { return "points" in g; }
function isPoint(g: AnyGeometry): g is Point2D { return "x" in g && "y" in g; }

function axisScaleFactors(transform: Transform2D): { scaleX: number; scaleY: number; rotationOffset: number } {
  const ex = applyTransformToVector(transform, { x: 1, y: 0 });
  const ey = applyTransformToVector(transform, { x: 0, y: 1 });
  return { scaleX: Math.hypot(ex.x, ex.y), scaleY: Math.hypot(ey.x, ey.y), rotationOffset: Math.atan2(ex.y, ex.x) };
}

/**
 * Applique une transformation affine à n'importe quelle primitive géométrique du moteur.
 * Un cercle/arc ne peut représenter une mise à l'échelle non uniforme : le rayon suit alors
 * l'échelle X (utiliser une ellipse pour une déformation X/Y indépendante).
 */
export function transformGeometry<T extends AnyGeometry>(transform: Transform2D, geometry: T): T {
  if (isPoint(geometry)) return applyTransform(transform, geometry) as T;
  if (isSegment(geometry)) return { start: applyTransform(transform, geometry.start), end: applyTransform(transform, geometry.end) } as T;
  const { scaleX, scaleY, rotationOffset } = axisScaleFactors(transform);
  if (isArc(geometry)) {
    const centre = applyTransform(transform, geometry.centre);
    return { ...geometry, centre, radius: geometry.radius * scaleX, startAngle: geometry.startAngle + rotationOffset, endAngle: geometry.endAngle + rotationOffset } as T;
  }
  if (isEllipse(geometry)) {
    const centre = applyTransform(transform, geometry.centre);
    return { ...geometry, centre, radiusX: geometry.radiusX * scaleX, radiusY: geometry.radiusY * scaleY, rotation: (geometry.rotation ?? 0) + rotationOffset } as T;
  }
  if (isCircle(geometry)) return { centre: applyTransform(transform, geometry.centre), radius: geometry.radius * scaleX } as T;
  if (isPolylineOrPolygon(geometry)) return { ...geometry, points: geometry.points.map((p) => applyTransform(transform, p)) } as T;
  throw new Error("Type de géométrie non pris en charge par transformGeometry.");
}

/**
 * Recalcule une bounding box englobante depuis toutes les primitives d'une forme.
 * Conservatrice pour les arcs (englobe le cercle complet, pas seulement le balayage) :
 * une bounding box légèrement large n'est jamais une géométrie fausse, contrairement à une trop étroite.
 */
export function computeBoundsFromPrimitives(primitives: ShapePrimitives, padding = 0): BoundingBox2D {
  const boxes: BoundingBox2D[] = [];
  const namedPoints = Object.values(primitives.points);
  if (namedPoints.length) boxes.push(boundsFromPoints(namedPoints));
  for (const s of primitives.segments) boxes.push(boundsFromPoints([s.start, s.end]));
  for (const c of primitives.circles) boxes.push({ minX: c.centre.x - c.radius, minY: c.centre.y - c.radius, maxX: c.centre.x + c.radius, maxY: c.centre.y + c.radius });
  for (const a of primitives.arcs) boxes.push({ minX: a.centre.x - a.radius, minY: a.centre.y - a.radius, maxX: a.centre.x + a.radius, maxY: a.centre.y + a.radius });
  for (const e of primitives.ellipses) { const r = Math.max(e.radiusX, e.radiusY); boxes.push({ minX: e.centre.x - r, minY: e.centre.y - r, maxX: e.centre.x + r, maxY: e.centre.y + r }); }
  for (const p of primitives.polylines) if (p.points.length) boxes.push(boundsFromPoints(p.points));
  for (const p of primitives.polygons) if (p.points.length) boxes.push(boundsFromPoints(p.points));
  if (!boxes.length) throw new Error("Impossible de calculer une bounding box : aucune primitive géométrique.");
  const merged = boxes.reduce((acc, box) => mergeBounds(acc, box));
  return { minX: merged.minX - padding, minY: merged.minY - padding, maxX: merged.maxX + padding, maxY: merged.maxY + padding };
}
