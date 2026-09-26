/**
 * API publique du moteur géométrique, utilisable par l'interface de l'Atelier de traçage.
 * Adapte les noms demandés (§28) aux conventions du projet (types `*2D`, champ `centre`, mm).
 */
import { circleArea, ellipseArea, polygonArea } from "./area";
import { computeBoundsFromPrimitives, transformGeometry } from "./geometry-ops";
import { emptyPrimitives, type ParametricShape } from "./model";
import { offsetArc, offsetCircle, offsetPolyline, offsetSegment } from "./offset";
import { rotationAround, scaleAround } from "./transform";
import { totalLength } from "./measure";
import type { Point2D } from "./types";

// createCircle, createArc, createRegularPolygon, createStar, createArch, createPetal,
// createRadialPattern, getReportPoints et validateGeometry sont republiés tels quels par
// `index.ts` depuis leurs modules respectifs (voir §28) : pas de réexport dupliqué ici.

/** Décale toutes les primitives d'une forme (mm, positif = extérieur pour un contour direct). */
export function offsetShape<T>(shape: ParametricShape<T>, distance: number): ParametricShape<T> {
  const primitives = emptyPrimitives();
  primitives.points = { ...shape.primitives.points };
  primitives.segments = shape.primitives.segments.map((s) => offsetSegment(s, distance));
  primitives.circles = shape.primitives.circles.map((c) => offsetCircle(c, distance));
  primitives.arcs = shape.primitives.arcs.map((a) => offsetArc(a, distance));
  primitives.ellipses = [...shape.primitives.ellipses];
  primitives.polylines = shape.primitives.polylines.map((p) => offsetPolyline(p, distance));
  primitives.polygons = shape.primitives.polygons.map((p) => ({ points: offsetPolyline({ points: p.points, closed: true }, distance).points }));
  const boundingBox = computeBoundsFromPrimitives(primitives);
  return { ...shape, id: `${shape.id}-offset`, primitives, boundingBox, width: boundingBox.maxX - boundingBox.minX, height: boundingBox.maxY - boundingBox.minY, metadata: { ...shape.metadata, offsetDistance: distance } };
}

/** Met à l'échelle une forme entière autour d'un centre (par défaut son propre centre). */
export function scaleShape<T>(shape: ParametricShape<T>, factor: number, centre: Point2D = shape.centre): ParametricShape<T> {
  const transform = scaleAround(centre, factor);
  return applyTransformToShape(shape, transform);
}

/** Fait pivoter une forme entière (degrés) autour d'un centre (par défaut son propre centre). */
export function rotateShape<T>(shape: ParametricShape<T>, angleDegrees: number, centre: Point2D = shape.centre): ParametricShape<T> {
  const transform = rotationAround(centre, (angleDegrees * Math.PI) / 180);
  return applyTransformToShape(shape, transform);
}

function applyTransformToShape<T>(shape: ParametricShape<T>, transform: ReturnType<typeof scaleAround>): ParametricShape<T> {
  const primitives = emptyPrimitives();
  primitives.points = Object.fromEntries(Object.entries(shape.primitives.points).map(([id, p]) => [id, transformGeometry(transform, p)]));
  primitives.segments = shape.primitives.segments.map((s) => transformGeometry(transform, s));
  primitives.circles = shape.primitives.circles.map((c) => transformGeometry(transform, c));
  primitives.arcs = shape.primitives.arcs.map((a) => transformGeometry(transform, a));
  primitives.ellipses = shape.primitives.ellipses.map((e) => transformGeometry(transform, e));
  primitives.polylines = shape.primitives.polylines.map((p) => transformGeometry(transform, p));
  primitives.polygons = shape.primitives.polygons.map((p) => transformGeometry(transform, p));
  const boundingBox = computeBoundsFromPrimitives(primitives);
  return {
    ...shape,
    primitives,
    centre: transformGeometry(transform, shape.centre),
    boundingBox,
    width: boundingBox.maxX - boundingBox.minX,
    height: boundingBox.maxY - boundingBox.minY,
  };
}

/** Longueur totale des primitives linéaires d'une forme (segments, arcs, polylignes, cercles). */
export function calculateLength(shape: ParametricShape): number {
  return totalLength([...shape.primitives.segments, ...shape.primitives.arcs, ...shape.primitives.circles, ...shape.primitives.polylines]);
}

/** Aire totale des primitives fermées d'une forme (cercles, ellipses, polygones). */
export function calculateArea(shape: ParametricShape): number {
  const circles = shape.primitives.circles.reduce((sum, c) => sum + circleArea(c), 0);
  const ellipses = shape.primitives.ellipses.reduce((sum, e) => sum + ellipseArea(e), 0);
  const polygons = shape.primitives.polygons.reduce((sum, p) => sum + polygonArea(p), 0);
  return circles + ellipses + polygons;
}

export function generateConstructionSteps(shape: ParametricShape) {
  return shape.constructionSteps;
}
