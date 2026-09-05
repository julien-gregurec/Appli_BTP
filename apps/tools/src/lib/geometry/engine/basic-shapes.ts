import { degToRad } from "./angles";
import { arcLength as computeArcLength, boundsFromPoints, pointAtPolar } from "./measure";
import { emptyPrimitives, registerShapeGenerator, type ParametricShape } from "./model";
import { assertFinitePositive, type Point2D } from "./types";

export type CircleParameters = { centre?: Point2D; radius?: number; diameter?: number };

export function createCircle(params: CircleParameters): ParametricShape<CircleParameters> {
  const radius = params.radius !== undefined ? assertFinitePositive(params.radius, "Le rayon") : assertFinitePositive(params.diameter ?? 0, "Le diamètre") / 2;
  const centre = params.centre ?? { x: 0, y: 0 };
  const primitives = emptyPrimitives();
  primitives.points.O = centre;
  primitives.circles.push({ centre, radius });
  const bounds = { minX: centre.x - radius, minY: centre.y - radius, maxX: centre.x + radius, maxY: centre.y + radius };
  return {
    id: "circle",
    type: "circle",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: radius * 2,
    height: radius * 2,
    rotation: 0,
    metadata: { shouldBeClosed: true },
    constructionSteps: [
      { id: "step-centre", instruction: "Matérialiser le centre O.", geometry: [{ kind: "point", id: "O" }] },
      { id: "step-circle", instruction: `Tracer le cercle de rayon ${radius.toFixed(1)} mm.`, geometry: [{ kind: "circle", circle: { centre, radius } }] },
    ],
    quality: "exact",
  };
}
registerShapeGenerator<CircleParameters>("circle", createCircle);

export type ArcParameters = { centre?: Point2D; radius: number; startAngleDegrees: number; endAngleDegrees: number; counterClockwise?: boolean };

export function createArc(params: ArcParameters): ParametricShape<ArcParameters> {
  const radius = assertFinitePositive(params.radius, "Le rayon");
  const centre = params.centre ?? { x: 0, y: 0 };
  const startAngle = degToRad(params.startAngleDegrees);
  const endAngle = degToRad(params.endAngleDegrees);
  const counterClockwise = params.counterClockwise ?? true;
  const start = pointAtPolar(centre, radius, startAngle);
  const end = pointAtPolar(centre, radius, endAngle);
  const primitives = emptyPrimitives();
  primitives.points.O = centre;
  primitives.points.start = start;
  primitives.points.end = end;
  const arc = { centre, radius, startAngle, endAngle, counterClockwise };
  primitives.arcs.push(arc);
  const bounds = boundsFromPoints([start, end, centre], radius * 0.05);
  return {
    id: "arc",
    type: "arc",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation: 0,
    metadata: { arcLength: computeArcLength(arc) },
    constructionSteps: [
      { id: "step-centre", instruction: "Matérialiser le centre O.", geometry: [{ kind: "point", id: "O" }] },
      { id: "step-arc", instruction: `Tracer l'arc de rayon ${radius.toFixed(1)} mm entre ${params.startAngleDegrees.toFixed(1)}° et ${params.endAngleDegrees.toFixed(1)}°.`, geometry: [{ kind: "arc", arc }] },
    ],
    quality: "exact",
  };
}
registerShapeGenerator<ArcParameters>("arc", createArc);
