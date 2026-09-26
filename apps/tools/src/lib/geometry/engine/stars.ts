import { degToRad } from "./angles";
import { boundsFromPoints, pointAtPolar } from "./measure";
import { emptyPrimitives, registerShapeGenerator, type ParametricShape } from "./model";
import { assertFinitePositive, type Circle2D, type Point2D } from "./types";

export type StarParameters = {
  centre?: Point2D;
  points: number;
  outerRadius: number;
  innerRadius: number;
  rotationDegrees?: number;
  /**
   * Décalage angulaire (au centre, en degrés) de chaque sommet intérieur par rapport à son
   * sommet extérieur apparié. Absent = demi-secteur (180/points) : étoile régulière classique,
   * comportement historique inchangé au flottant près. Renseigné : motif "vrillé" (turbine) —
   * la valeur est directement l'angle à reporter au rapporteur depuis le sommet extérieur,
   * jamais un paramètre visuel arbitraire (C4-LOT1-V1 §2).
   */
  innerAngleOffsetDegrees?: number;
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
    // Sommet extérieur, ou sommet intérieur par défaut (demi-secteur) : formule historique
    // inchangée au flottant près, aucune dérive numérique introduite par l'extension ci-dessous.
    if (i % 2 === 0 || params.innerAngleOffsetDegrees === undefined) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      return pointAtPolar(centre, radius, rotation + (i * Math.PI) / params.points);
    }
    // Sommet intérieur décalé explicitement : rapporté à l'angle du sommet extérieur apparié.
    const pairedOuterAngle = rotation + ((i - 1) * Math.PI) / params.points;
    return pointAtPolar(centre, innerRadius, pairedOuterAngle + degToRad(params.innerAngleOffsetDegrees));
  });
  const primitives = emptyPrimitives();
  primitives.points.O = centre;
  vertices.forEach((v, i) => { primitives.points[i % 2 === 0 ? `T${i / 2 + 1}` : `V${(i - 1) / 2 + 1}`] = v; });
  // Contour tracé = segments alternés, classés "construction" : le tracé final exploitable est
  // le polygone fermé ci-dessous (les segments matérialisent le geste "relier", pas la forme).
  for (let i = 0; i < vertices.length; i++) primitives.segments.push({ start: vertices[i], end: vertices[(i + 1) % vertices.length], role: "construction" });
  const outerCircle: Circle2D = { centre, radius: outerRadius, role: "construction" };
  const innerCircle: Circle2D = { centre, radius: innerRadius, role: "construction" };
  primitives.circles.push(outerCircle, innerCircle);
  primitives.polygons.push({ points: vertices });
  const bounds = boundsFromPoints(vertices, Math.max(20, outerRadius * 0.05));
  const outerPointIds = Array.from({ length: params.points }, (_, i) => `T${i + 1}`);
  const innerPointIds = Array.from({ length: params.points }, (_, i) => `V${i + 1}`);
  const outerAngle = Number((360 / params.points).toFixed(2));
  const innerAngle = Number((180 / params.points).toFixed(2));
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
      {
        id: "step-outer-circle",
        title: "Tracer le cercle extérieur",
        instruction: `Tracez le cercle directeur extérieur de rayon ${outerRadius.toFixed(1)} mm depuis O.`,
        geometry: [{ kind: "circle", circle: outerCircle }],
      },
      {
        id: "step-outer-divide",
        title: "Répartir les pointes",
        instruction: `Reportez les ${params.points} sommets extérieurs sur le cercle, espacés de ${outerAngle}°.`,
        geometry: [{ kind: "circle", circle: outerCircle }, ...outerPointIds.map((id) => ({ kind: "point" as const, id }))],
      },
      {
        id: "step-inner-circle",
        title: "Tracer le cercle intérieur",
        instruction: `Tracez le cercle directeur intérieur de rayon ${innerRadius.toFixed(1)} mm depuis O.`,
        geometry: [{ kind: "circle", circle: innerCircle }],
      },
      {
        id: "step-inner-divide",
        title: "Placer les creux",
        instruction: `Reportez les ${params.points} sommets intérieurs, décalés de ${innerAngle}° par rapport aux sommets extérieurs.`,
        geometry: [{ kind: "circle", circle: innerCircle }, ...innerPointIds.map((id) => ({ kind: "point" as const, id }))],
      },
      {
        id: "step-connect",
        title: "Relier alternativement",
        instruction: "Reliez chaque sommet extérieur au sommet intérieur voisin, en alternant sur tout le tour.",
        geometry: primitives.segments.map((segment) => ({ kind: "segment" as const, segment })),
      },
      {
        id: "step-symmetry",
        title: "Vérifier la symétrie",
        instruction: `Contrôlez que les ${params.points} branches se superposent par rotation de ${outerAngle}° autour de O.`,
        geometry: outerPointIds.map((id) => ({ kind: "point" as const, id })),
      },
    ],
    quality: "exact",
  };
}

registerShapeGenerator<StarParameters>("star", createStar);
