import { degToRad, radToDeg } from "./angles";
import { createLeaf } from "./petals";
import { createRadialPattern } from "./radial-pattern";
import { boundsFromPoints, mergeBounds } from "./measure";
import { emptyPrimitives, registerShapeGenerator, type ParametricShape } from "./model";
import { assertFinitePositive, type Circle2D, type Point2D } from "./types";

export type RosetteParameters = {
  centre?: Point2D;
  outerDiameter: number;
  innerDiameter: number;
  count: number;
  rotationDegrees?: number;
  elementType?: "circle" | "petal";
  elementWidth?: number;
};

/** Générateur générique de rosace : N éléments répartis régulièrement entre un diamètre intérieur et extérieur. */
export function createRosette(params: RosetteParameters): ParametricShape<RosetteParameters> {
  if (!Number.isInteger(params.count) || params.count < 2) throw new Error("Une rosace exige au moins 2 éléments.");
  const outerRadius = assertFinitePositive(params.outerDiameter, "Le diamètre extérieur") / 2;
  const innerRadius = assertFinitePositive(params.innerDiameter, "Le diamètre intérieur") / 2;
  if (innerRadius >= outerRadius) throw new Error("Le diamètre intérieur doit être inférieur au diamètre extérieur.");
  const centre = params.centre ?? { x: 0, y: 0 };
  const rotation = degToRad(params.rotationDegrees ?? -90);
  const elementType = params.elementType ?? "circle";
  const directorRadius = (outerRadius + innerRadius) / 2;
  const primitives = emptyPrimitives();
  primitives.points.O = centre;
  let bounds = boundsFromPoints([centre], Math.max(20, outerRadius * 0.1));
  let elementSummary: { kind: "circle"; radius: number } | { kind: "petal"; width: number; height: number };
  if (elementType === "circle") {
    const elementRadius = (outerRadius - innerRadius) / 2;
    const source: Circle2D = { centre: { x: centre.x + directorRadius, y: centre.y }, radius: elementRadius };
    const pattern = createRadialPattern({ source, centre, count: params.count, startAngleDegrees: radToDeg(rotation) });
    primitives.circles.push(...pattern.primitives.circles);
    primitives.circles.push({ centre, radius: innerRadius });
    bounds = mergeBounds(bounds, pattern.boundingBox);
    elementSummary = { kind: "circle", radius: elementRadius };
  } else {
    const height = outerRadius - innerRadius;
    const width = params.elementWidth ?? 2 * directorRadius * Math.sin(Math.PI / params.count) * 0.85;
    const elementCentre = { x: centre.x + directorRadius, y: centre.y };
    const petalRotation = radToDeg(rotation) + 90;
    const petalArcs = buildLocalPetalArcs(width, height, elementCentre, petalRotation);
    const pattern = createRadialPattern({ source: petalArcs, centre, count: params.count, startAngleDegrees: radToDeg(rotation) });
    primitives.arcs.push(...pattern.primitives.arcs);
    primitives.circles.push({ centre, radius: innerRadius });
    bounds = mergeBounds(bounds, pattern.boundingBox);
    elementSummary = { kind: "petal", width, height };
  }
  return {
    id: `rosette-${params.count}`,
    type: "rosette",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation,
    metadata: { count: params.count, element: elementSummary },
    constructionSteps: [
      { id: "step-centre", instruction: "Matérialiser le centre O.", geometry: [{ kind: "point", id: "O" }] },
      { id: "step-director-circle", instruction: `Tracer le cercle directeur de rayon ${directorRadius.toFixed(1)} mm.`, geometry: [{ kind: "circle", circle: { centre, radius: directorRadius } }] },
      { id: "step-divide", instruction: `Diviser en ${params.count} secteurs de ${(360 / params.count).toFixed(2)}°.`, geometry: [] },
      { id: "step-elements", instruction: `Tracer un élément (${elementType}) sur chaque division.`, geometry: [...primitives.circles.map((circle) => ({ kind: "circle" as const, circle })), ...primitives.arcs.map((arc) => ({ kind: "arc" as const, arc }))] },
      { id: "step-centre-circle", instruction: `Tracer le cercle central de rayon ${innerRadius.toFixed(1)} mm.`, geometry: [{ kind: "circle", circle: { centre, radius: innerRadius } }] },
    ],
    quality: "exact",
  };
}

function buildLocalPetalArcs(width: number, height: number, elementCentre: Point2D, rotationDegrees: number) {
  // Réutilise la construction de la feuille (deux arcs symétriques) centrée sur l'élément.
  return createLeaf({ width, height, centre: elementCentre, rotationDegrees }).primitives.arcs;
}

registerShapeGenerator<RosetteParameters>("rosette", createRosette);
