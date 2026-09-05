import { degToRad, radToDeg } from "./angles";
import { pointAtPolar } from "./measure";
import { emptyPrimitives, registerShapeGenerator, type ParametricShape } from "./model";
import { assertFinitePositive, type Point2D, type Segment2D } from "./types";

export type CircleDivisionParameters = {
  centre?: Point2D;
  divisions: number;
  radius?: number;
  diameter?: number;
  startAngleDegrees?: number;
};

/**
 * Cercle directeur marqué de N points de division régulièrement répartis (spots de plafond,
 * ancrages de rosace, perçages). Reste géométriquement un cercle : aucun segment de contour,
 * aucun polygone — ne jamais le rendre visuellement équivalent à un polygone (C4-LOT1-V1 §3).
 */
export function createCircleDivision(params: CircleDivisionParameters): ParametricShape<CircleDivisionParameters> {
  if (!Number.isInteger(params.divisions) || params.divisions < 1) throw new Error("Le nombre de divisions doit être un entier supérieur ou égal à 1.");
  const radius = params.radius !== undefined ? assertFinitePositive(params.radius, "Le rayon") : assertFinitePositive(params.diameter ?? 0, "Le diamètre") / 2;
  const centre = params.centre ?? { x: 0, y: 0 };
  const startAngle = degToRad(params.startAngleDegrees ?? 0);
  // Pas angulaire précalculé une seule fois, puis multiplié par l'index (plutôt que
  // `(index * 2 * Math.PI) / divisions` recalculé à chaque point) : ordre d'opérations identique
  // à `primitives.ts::divideCircle` déjà éprouvé, qui évite un écart d'arrondi à la dernière
  // décimale entre le rendu serveur et l'hydratation client sur certains index/nombres de
  // divisions (constat vérifié : cet écart existe avec `circle-tools.ts::pointsOnCircle`, dont
  // l'ordre d'opérations diffère — voir C4-LOT1-V1 §36).
  const angularStep = (2 * Math.PI) / params.divisions;
  const marks: Point2D[] = Array.from({ length: params.divisions }, (_, index) => pointAtPolar(centre, radius, startAngle + index * angularStep));

  const primitives = emptyPrimitives();
  primitives.points.O = centre;
  marks.forEach((p, i) => { primitives.points[`P${i + 1}`] = p; });
  primitives.circles.push({ centre, radius });

  // Axes perpendiculaires de repérage (rôle "axis") : matérialisent O avant même de tracer le
  // cercle, comme au chantier (aucun rôle dans la géométrie du motif — jamais dans "shape").
  const axisExtent = Math.max(50, radius * 1.15);
  const axisX: Segment2D = { start: { x: centre.x - axisExtent, y: centre.y }, end: { x: centre.x + axisExtent, y: centre.y }, role: "axis" };
  const axisY: Segment2D = { start: { x: centre.x, y: centre.y - axisExtent }, end: { x: centre.x, y: centre.y + axisExtent }, role: "axis" };
  primitives.segments.push(axisX, axisY);

  const bounds = { minX: centre.x - axisExtent, minY: centre.y - axisExtent, maxX: centre.x + axisExtent, maxY: centre.y + axisExtent };
  const sectorDegrees = params.divisions >= 2 ? Number(radToDeg(angularStep).toFixed(6)) : 0;

  return {
    id: `circle-division-${params.divisions}`,
    type: "circleDivision",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation: startAngle,
    metadata: { divisions: params.divisions, sectorDegrees },
    constructionSteps: [
      {
        id: "step-centre",
        title: "Matérialiser le centre",
        instruction: "Tracez deux axes perpendiculaires et marquez leur intersection O.",
        geometry: [{ kind: "point", id: "O" }, { kind: "segment", segment: axisX }, { kind: "segment", segment: axisY }],
      },
      {
        id: "step-circle",
        title: "Tracer le cercle directeur",
        instruction: `Réglez le compas au rayon ${radius.toFixed(1)} mm et tracez le cercle depuis O.`,
        geometry: [{ kind: "circle", circle: { centre, radius } }],
      },
      {
        id: "step-divide",
        title: "Diviser régulièrement",
        instruction:
          params.divisions >= 2
            ? `Reportez ${params.divisions} divisions de ${sectorDegrees}° chacune autour de O.`
            : "Un seul point suffit ici, aucune division angulaire à reporter.",
        geometry: marks.map((_, i) => ({ kind: "point" as const, id: `P${i + 1}` })),
      },
    ],
    quality: "exact",
  };
}

registerShapeGenerator<CircleDivisionParameters>("circleDivision", createCircleDivision);
