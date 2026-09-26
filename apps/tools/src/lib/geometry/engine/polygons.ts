import { degToRad, radToDeg } from "./angles";
import { divideCircle } from "./circle-tools";
import { boundsFromPoints, distance } from "./measure";
import { emptyPrimitives, registerShapeGenerator, type ParametricShape } from "./model";
import { assertFinitePositive, type Point2D } from "./types";

export type RegularPolygonParameters = {
  centre?: Point2D;
  sides: number;
  radius?: number;
  diameter?: number;
  sideLength?: number;
  rotationDegrees?: number;
};

function resolveRadius(params: RegularPolygonParameters): number {
  if (params.radius !== undefined) return assertFinitePositive(params.radius, "Le rayon");
  if (params.diameter !== undefined) return assertFinitePositive(params.diameter, "Le diamètre") / 2;
  if (params.sideLength !== undefined) {
    const side = assertFinitePositive(params.sideLength, "La longueur de côté");
    return side / (2 * Math.sin(Math.PI / params.sides));
  }
  throw new Error("Fournir un rayon, un diamètre ou une longueur de côté pour construire le polygone.");
}

export function createRegularPolygon(params: RegularPolygonParameters): ParametricShape<RegularPolygonParameters> {
  if (!Number.isInteger(params.sides) || params.sides < 3) throw new Error("Un polygone régulier exige au moins 3 côtés.");
  const centre = params.centre ?? { x: 0, y: 0 };
  const radius = resolveRadius(params);
  const rotation = degToRad(params.rotationDegrees ?? 0);
  const vertices = divideCircle({ centre, radius }, params.sides, rotation);
  const primitives = emptyPrimitives();
  primitives.points.O = centre;
  vertices.forEach((v, i) => { primitives.points[`P${i + 1}`] = v; });
  for (let i = 0; i < vertices.length; i++) primitives.segments.push({ start: vertices[i], end: vertices[(i + 1) % vertices.length] });
  primitives.circles.push({ centre, radius });
  primitives.polygons.push({ points: vertices });
  const bounds = boundsFromPoints(vertices, Math.max(20, radius * 0.05));
  const interiorAngleDegrees = ((params.sides - 2) * 180) / params.sides;
  const sideLength = distance(vertices[0], vertices[1]);
  return {
    id: `regular-polygon-${params.sides}`,
    type: "regularPolygon",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation,
    metadata: { shouldBeClosed: true, interiorAngleDegrees, sideLength, exteriorAngleDegrees: 360 / params.sides },
    constructionSteps: [
      { id: "step-centre", instruction: "Matérialiser le centre O.", geometry: [{ kind: "point", id: "O" }] },
      { id: "step-director-circle", instruction: `Tracer le cercle directeur de rayon ${radius.toFixed(1)} mm.`, geometry: [{ kind: "circle", circle: { centre, radius } }] },
      { id: "step-divide", instruction: `Diviser le cercle en ${params.sides} parts égales de ${radToDeg((2 * Math.PI) / params.sides).toFixed(2)}° à partir de ${(params.rotationDegrees ?? 0).toFixed(1)}°.`, geometry: vertices.map((_, i) => ({ kind: "point" as const, id: `P${i + 1}` })) },
      { id: "step-connect", instruction: "Relier les points consécutifs pour former le polygone.", geometry: primitives.segments.map((segment) => ({ kind: "segment" as const, segment })) },
    ],
    quality: "exact",
  };
}

registerShapeGenerator<RegularPolygonParameters>("regularPolygon", createRegularPolygon);

function fixedSided(sides: number) {
  return (params: Omit<RegularPolygonParameters, "sides">) => createRegularPolygon({ ...params, sides });
}

export const createTriangle = fixedSided(3);
export const createSquare = fixedSided(4);
export const createPentagon = fixedSided(5);
export const createHexagon = fixedSided(6);
export const createOctagon = fixedSided(8);
