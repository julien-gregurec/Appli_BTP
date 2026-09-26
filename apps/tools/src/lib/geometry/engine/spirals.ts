import { degToRad } from "./angles";
import { boundsFromPoints, pointAtPolar } from "./measure";
import { emptyPrimitives, registerShapeGenerator, type ParametricShape } from "./model";
import { assertFinite, assertFinitePositive, type Arc2D, type Point2D, type Segment2D } from "./types";

/** Un rayon de départ nul est une spirale valide (elle part du centre) — seul un rayon négatif est refusé. */
function assertFiniteNonNegative(value: number, label: string): number {
  const finite = assertFinite(value, label);
  if (finite < 0) throw new Error(`${label} doit être positif ou nul.`);
  return finite;
}

export type SpiralParameters = { centre?: Point2D; startRadius: number; growthPerTurn: number; turns: number; startAngleDegrees?: number; samplesPerTurn?: number };

/** Rayon de la spirale d'Archimède exacte r(θ) = startRadius + growthPerTurn·θ/2π. */
export function archimedeanSpiralRadius(params: SpiralParameters, thetaRadians: number): number {
  return params.startRadius + (params.growthPerTurn * thetaRadians) / (2 * Math.PI);
}

/**
 * Spirale mathématique exacte : la formule r(θ) est la source de vérité (`quality: exact`).
 * La polyligne renvoyée n'est qu'un échantillonnage dense pour l'affichage, jamais une
 * dimension de chantier — voir `approximateSpiralWithArcs` pour la version constructible.
 */
export function createMathematicalSpiral(params: SpiralParameters): ParametricShape<SpiralParameters> {
  assertFiniteNonNegative(params.startRadius, "Le rayon de départ");
  assertFinitePositive(params.turns, "Le nombre de tours");
  const centre = params.centre ?? { x: 0, y: 0 };
  const startAngle = degToRad(params.startAngleDegrees ?? 0);
  const samplesPerTurn = params.samplesPerTurn ?? 90;
  const totalSamples = Math.max(2, Math.round(params.turns * samplesPerTurn));
  const points: Point2D[] = Array.from({ length: totalSamples + 1 }, (_, i) => {
    const theta = (params.turns * 2 * Math.PI * i) / totalSamples;
    const radius = archimedeanSpiralRadius(params, theta);
    return pointAtPolar(centre, radius, startAngle + theta);
  });
  const primitives = emptyPrimitives();
  primitives.points.O = centre;
  primitives.points.start = points[0];
  primitives.points.end = points[points.length - 1];
  primitives.polylines.push({ points, closed: false });
  const endRadius = archimedeanSpiralRadius(params, params.turns * 2 * Math.PI);
  const bounds = boundsFromPoints(points, 10);
  return {
    id: "spiral-mathematical",
    type: "spiralMathematical",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation: startAngle,
    metadata: { curveEquation: "r(θ) = startRadius + growthPerTurn·θ/2π", samplingOnly: true, endRadius },
    constructionSteps: [
      { id: "step-centre", title: "Repérer le centre", instruction: "Marquer le centre O et l'angle de départ.", geometry: [{ kind: "point", id: "O" }] },
      { id: "step-start", title: "Définir le rayon initial", instruction: `Reporter le premier point à ${params.startRadius.toFixed(1)} mm du centre.`, geometry: [{ kind: "point", id: "start" }] },
      { id: "step-progress", title: "Reporter la progression", instruction: `Reporter des points à intervalles angulaires réguliers, à rayon croissant de ${params.growthPerTurn.toFixed(1)} mm par tour.`, geometry: [] },
      // Ne pas référencer la polyligne ici (kind:"polyline") : l'adaptateur la rematérialiserait
      // systématiquement comme une seconde entité "construction" distincte (jamais dédupliquée
      // par valeur, contrairement aux segments/cercles/arcs) — coûteux pour ~480 points et inutile
      // puisque la polyligne "shape" est déjà visible dans le tracé final.
      { id: "step-turns", title: "Construire les tours", instruction: `Relier les points par une courbe continue sur ${params.turns} tour${params.turns > 1 ? "s" : ""}.`, geometry: [] },
      { id: "step-end", title: "Contrôler le rayon final", instruction: `Contrôler que le dernier point est à ${endRadius.toFixed(1)} mm du centre.`, geometry: [{ kind: "point", id: "end" }] },
    ],
    quality: "exact",
  };
}

registerShapeGenerator<SpiralParameters>("spiralMathematical", createMathematicalSpiral);

export type SiteSpiralParameters = SpiralParameters & { maxErrorMm?: number; segmentsPerTurn?: number };

/**
 * Version chantier : approxime la spirale par des arcs de rayon constant par paliers
 * (méthode simplifiée à paliers), reliés par de courts segments radiaux. L'erreur maximale
 * réellement observée est renvoyée — jamais une tolérance simplement supposée respectée.
 */
export function approximateSpiralWithArcs(params: SiteSpiralParameters): ParametricShape<SiteSpiralParameters> {
  assertFinitePositive(params.startRadius, "Le rayon de départ");
  assertFinitePositive(params.turns, "Le nombre de tours");
  const centre = params.centre ?? { x: 0, y: 0 };
  const startAngle = degToRad(params.startAngleDegrees ?? 0);
  const maxErrorMm = params.maxErrorMm ?? 5;
  const findSegmentation = (segmentsPerTurn: number) => {
    const totalSegments = Math.max(1, Math.round(params.turns * segmentsPerTurn));
    const dTheta = (params.turns * 2 * Math.PI) / totalSegments;
    let worstError = 0;
    const elements: (Arc2D | Segment2D)[] = [];
    for (let k = 0; k < totalSegments; k++) {
      const theta0 = k * dTheta;
      const theta1 = (k + 1) * dTheta;
      const thetaMid = (theta0 + theta1) / 2;
      const radiusMid = archimedeanSpiralRadius(params, thetaMid);
      for (let s = 0; s <= 8; s++) {
        const sampleTheta = theta0 + (dTheta * s) / 8;
        const error = Math.abs(archimedeanSpiralRadius(params, sampleTheta) - radiusMid);
        if (error > worstError) worstError = error;
      }
      const arc: Arc2D = { centre, radius: radiusMid, startAngle: startAngle + theta0, endAngle: startAngle + theta1, counterClockwise: true };
      elements.push(arc);
      if (k < totalSegments - 1) {
        const nextRadiusMid = archimedeanSpiralRadius(params, thetaMid + dTheta);
        elements.push({ start: pointAtPolar(centre, radiusMid, startAngle + theta1), end: pointAtPolar(centre, nextRadiusMid, startAngle + theta1) });
      }
    }
    return { elements, worstError, totalSegments, dTheta };
  };
  let segmentsPerTurn = params.segmentsPerTurn ?? 12;
  let result = findSegmentation(segmentsPerTurn);
  if (!params.segmentsPerTurn) {
    let guard = 0;
    while (result.worstError > maxErrorMm && guard < 12) {
      segmentsPerTurn *= 2;
      result = findSegmentation(segmentsPerTurn);
      guard++;
    }
  }
  const primitives = emptyPrimitives();
  primitives.points.O = centre;
  for (const element of result.elements) {
    if ("radius" in element) primitives.arcs.push(element);
    else primitives.segments.push(element);
  }
  const samplePoints = result.elements.flatMap((element) => ("radius" in element ? [{ x: element.centre.x + element.radius, y: element.centre.y + element.radius }, { x: element.centre.x - element.radius, y: element.centre.y - element.radius }] : [element.start, element.end]));
  const bounds = boundsFromPoints(samplePoints, 10);
  return {
    id: "spiral-site",
    type: "spiralSite",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation: startAngle,
    metadata: { segmentsPerTurn, totalSegments: result.totalSegments },
    constructionSteps: [
      { id: "step-arcs", instruction: `Tracer ${result.totalSegments} arcs de rayon constant par palier, reliés par un léger décalage radial à chaque changement.`, geometry: primitives.arcs.map((arc) => ({ kind: "arc" as const, arc })) },
    ],
    quality: "approximated",
    errorTolerance: result.worstError,
  };
}

registerShapeGenerator<SiteSpiralParameters>("spiralSite", approximateSpiralWithArcs);
