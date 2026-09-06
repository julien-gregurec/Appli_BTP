import { degToRad } from "./angles";
import { boundsFromPoints, pointAtPolar } from "./measure";
import { emptyPrimitives, registerShapeGenerator, type ParametricShape } from "./model";
import { assertFinitePositive, type Point2D } from "./types";

export type StarParameters = {
  centre?: Point2D;
  points: number;
  outerRadius: number;
  innerRadius: number;
  rotationDegrees?: number;
};

/** Étoile simple à N branches, alternant sommets extérieurs et intérieurs (polygone étoilé {N/2} implicite). */
export function createStar(params: StarParameters): ParametricShape<StarParameters> {
  if (!Number.isInteger(params.points) || params.points < 3) throw new Error("Une étoile exige au moins 3 branches.");
  const centre = params.centre ?? { x: 0, y: 0 };
  const outerRadius = assertFinitePositive(params.outerRadius, "Le rayon extérieur");
  const innerRadius = assertFinitePositive(params.innerRadius, "Le rayon intérieur");
  if (innerRadius >= outerRadius) throw new Error("Le rayon intérieur doit être inférieur au rayon extérieur.");
  const rotation = degToRad(params.rotationDegrees ?? -90);
  const vertexCount = params.points * 2;
  const vertices: Point2D[] = Array.from({ length: vertexCount }, (_, i) => {
    const radius = i % 2 === 0 ? outerRadius : innerRadius;
    return pointAtPolar(centre, radius, rotation + (i * Math.PI) / params.points);
  });
  const primitives = emptyPrimitives();
  primitives.points.O = centre;
  vertices.forEach((v, i) => { primitives.points[i % 2 === 0 ? `T${i / 2 + 1}` : `V${(i - 1) / 2 + 1}`] = v; });
  for (let i = 0; i < vertices.length; i++) primitives.segments.push({ start: vertices[i], end: vertices[(i + 1) % vertices.length] });
  primitives.circles.push({ centre, radius: outerRadius }, { centre, radius: innerRadius });
  primitives.polygons.push({ points: vertices });
  const bounds = boundsFromPoints(vertices, Math.max(20, outerRadius * 0.05));
  const outerPointIds = Array.from({ length: params.points }, (_, i) => `T${i + 1}`);
  const innerPointIds = Array.from({ length: params.points }, (_, i) => `V${i + 1}`);
  return {
    id: `star-${params.points}`,
    type: "star",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation,
    metadata: { shouldBeClosed: true, branches: params.points },
    constructionSteps: [
      { id: "step-centre", instruction: "Matérialiser le centre O.", geometry: [{ kind: "point", id: "O" }] },
      { id: "step-outer-circle", instruction: `Tracer le cercle directeur extérieur de rayon ${outerRadius.toFixed(1)} mm et y reporter les ${params.points} pointes.`, geometry: [{ kind: "circle", circle: { centre, radius: outerRadius } }, ...outerPointIds.map((id) => ({ kind: "point" as const, id }))] },
      { id: "step-inner-circle", instruction: `Tracer le cercle directeur intérieur de rayon ${innerRadius.toFixed(1)} mm et y reporter les ${params.points} creux, décalés d'une demi-pointe.`, geometry: [{ kind: "circle", circle: { centre, radius: innerRadius } }, ...innerPointIds.map((id) => ({ kind: "point" as const, id }))] },
      { id: "step-connect", instruction: "Relier alternativement pointes et creux pour former l'étoile.", geometry: primitives.segments.map((segment) => ({ kind: "segment" as const, segment })) },
    ],
    quality: "exact",
  };
}

registerShapeGenerator<StarParameters>("star", createStar);
