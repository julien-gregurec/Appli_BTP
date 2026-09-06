import { degToRad, radToDeg } from "./angles";
import { transformGeometry, type AnyGeometry } from "./geometry-ops";
import { boundsFromPoints } from "./measure";
import { emptyPrimitives, registerShapeGenerator, type ParametricShape, type ShapePrimitives } from "./model";
import { rotationAround } from "./transform";
import type { Arc2D, Circle2D, Ellipse2D, Point2D, Polygon2D, Polyline2D, Segment2D } from "./types";

export type RadialPatternParameters = {
  source: AnyGeometry | readonly AnyGeometry[];
  centre?: Point2D;
  count: number;
  totalAngleDegrees?: number;
  startAngleDegrees?: number;
  clockwise?: boolean;
};

function sortIntoPrimitives(primitives: ShapePrimitives, geometry: AnyGeometry, index: number, instanceIndex: number): void {
  if ("x" in geometry && "y" in geometry && !("centre" in geometry)) { primitives.points[`I${instanceIndex}-P${index}`] = geometry as Point2D; return; }
  if ("start" in geometry && "end" in geometry) { primitives.segments.push(geometry as Segment2D); return; }
  if ("startAngle" in geometry) { primitives.arcs.push(geometry as Arc2D); return; }
  if ("radiusX" in geometry) { primitives.ellipses.push(geometry as Ellipse2D); return; }
  if ("radius" in geometry) { primitives.circles.push(geometry as Circle2D); return; }
  if ("points" in geometry && "closed" in geometry) { primitives.polylines.push(geometry as Polyline2D); return; }
  primitives.polygons.push(geometry as Polygon2D);
}

/** Répétition circulaire générique d'un élément (ou d'un ensemble d'éléments) source autour d'un centre. */
export function createRadialPattern(params: RadialPatternParameters): ParametricShape<RadialPatternParameters> {
  if (!Number.isInteger(params.count) || params.count < 1) throw new Error("Le nombre d'instances doit être un entier supérieur ou égal à 1.");
  const centre = params.centre ?? { x: 0, y: 0 };
  const totalAngleDegrees = params.totalAngleDegrees ?? 360;
  const startAngleDegrees = params.startAngleDegrees ?? 0;
  const isFullCircle = Math.abs(totalAngleDegrees - 360) < 1e-9;
  const stepDegrees = isFullCircle || params.count === 1 ? totalAngleDegrees / params.count : totalAngleDegrees / (params.count - 1);
  const sources = Array.isArray(params.source) ? params.source : [params.source as AnyGeometry];
  const primitives = emptyPrimitives();
  const allPointsForBounds: Point2D[] = [];
  for (let instance = 0; instance < params.count; instance++) {
    const angleDegrees = startAngleDegrees + instance * stepDegrees * (params.clockwise ? -1 : 1);
    const transform = rotationAround(centre, degToRad(angleDegrees));
    sources.forEach((source, sourceIndex) => {
      const transformed = transformGeometry(transform, source);
      sortIntoPrimitives(primitives, transformed, sourceIndex, instance);
      allPointsForBounds.push(...collectPoints(transformed));
    });
  }
  primitives.points.O = centre;
  const bounds = allPointsForBounds.length ? boundsFromPoints([...allPointsForBounds, centre], 20) : boundsFromPoints([centre], 20);
  return {
    id: "radial-pattern",
    type: "radialPattern",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation: degToRad(startAngleDegrees),
    metadata: { count: params.count, stepDegrees },
    constructionSteps: [
      { id: "step-centre", instruction: "Matérialiser le centre de rotation O.", geometry: [{ kind: "point", id: "O" }] },
      { id: "step-divide", instruction: `Répartir ${params.count} instances tous les ${radToDeg(degToRad(stepDegrees)).toFixed(2)}° à partir de ${startAngleDegrees.toFixed(1)}°, dans le sens ${params.clockwise ? "horaire" : "antihoraire"}.`, geometry: [] },
      { id: "step-place", instruction: "Reporter l'élément source à chaque position angulaire.", geometry: [...primitives.segments.map((segment) => ({ kind: "segment" as const, segment })), ...primitives.circles.map((circle) => ({ kind: "circle" as const, circle })), ...primitives.arcs.map((arc) => ({ kind: "arc" as const, arc }))] },
    ],
    quality: "exact",
  };
}

function collectPoints(geometry: AnyGeometry): Point2D[] {
  if ("x" in geometry && "y" in geometry && !("centre" in geometry)) return [geometry as Point2D];
  if ("start" in geometry && "end" in geometry) { const s = geometry as Segment2D; return [s.start, s.end]; }
  if ("centre" in geometry && "radius" in geometry) { const c = geometry as Circle2D | Arc2D; return [{ x: c.centre.x - c.radius, y: c.centre.y - c.radius }, { x: c.centre.x + c.radius, y: c.centre.y + c.radius }]; }
  if ("radiusX" in geometry) { const e = geometry as Ellipse2D; const r = Math.max(e.radiusX, e.radiusY); return [{ x: e.centre.x - r, y: e.centre.y - r }, { x: e.centre.x + r, y: e.centre.y + r }]; }
  if ("points" in geometry) return [...(geometry as Polyline2D | Polygon2D).points];
  return [];
}

registerShapeGenerator<RadialPatternParameters>("radialPattern", createRadialPattern);
