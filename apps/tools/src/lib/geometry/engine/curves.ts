import { degToRad } from "./angles";
import { arcThroughChordAndSagitta } from "./circle-tools";
import { boundsFromPoints, distance, polarAngle } from "./measure";
import { emptyPrimitives, registerShapeGenerator, type ParametricShape } from "./model";
import { applyTransform, compose, rotationAround, translation } from "./transform";
import { assertFinitePositive, type Point2D } from "./types";

export type WaveCurveParameters = { width: number; height: number; segments: number; centre?: Point2D; rotationDegrees?: number; bulgeRatio?: number };

/**
 * Courbe en vagues constructible : alterne des arcs de flèche égale et de signe opposé (S simple
 * = 2, double S = 4). `bulgeRatio` (défaut 1, additif — C4-LOT4-CURVES-V1 §5) multiplie la flèche
 * de base `width/2` : un signe négatif inverse le sens de bombement de la courbe entière, une
 * magnitude différente de 1 change son amplitude, sans toucher la construction corde+flèche.
 */
export function createWaveCurve(params: WaveCurveParameters): ParametricShape<WaveCurveParameters> {
  if (!Number.isInteger(params.segments) || params.segments < 2) throw new Error("Une courbe en vagues exige au moins 2 segments.");
  const width = assertFinitePositive(params.width, "La largeur");
  const height = assertFinitePositive(params.height, "La hauteur");
  const centre = params.centre ?? { x: 0, y: 0 };
  const rotation = degToRad(params.rotationDegrees ?? 0);
  const bulgeRatio = params.bulgeRatio ?? 1;
  const transform = compose(translation(centre.x, centre.y), rotationAround({ x: 0, y: 0 }, rotation));
  const segmentHeight = height / params.segments;
  const localPoints: Point2D[] = Array.from({ length: params.segments + 1 }, (_, i) => ({ x: 0, y: height / 2 - i * segmentHeight }));
  const primitives = emptyPrimitives();
  const worldPoints: Point2D[] = [];
  const arcs = [];
  for (let i = 0; i < params.segments; i++) {
    const sign = i % 2 === 0 ? 1 : -1;
    const local = arcThroughChordAndSagitta(localPoints[i], localPoints[i + 1], (sign * bulgeRatio * width) / 2);
    const worldCentre = applyTransform(transform, local.centre);
    const arc = { centre: worldCentre, radius: local.radius, startAngle: local.startAngle + rotation, endAngle: local.endAngle + rotation, counterClockwise: local.counterClockwise };
    arcs.push(arc);
    primitives.arcs.push(arc);
    primitives.points[`C${i}`] = worldCentre;
  }
  localPoints.forEach((p, i) => { const world = applyTransform(transform, p); worldPoints.push(world); primitives.points[`P${i}`] = world; });
  const bounds = boundsFromPoints(worldPoints, Math.max(10, width * 0.3));
  const sagittaAbs = Math.abs(bulgeRatio * width) / 2;
  return {
    id: `wave-${params.segments}`,
    type: "waveCurve",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation,
    metadata: { segments: params.segments },
    constructionSteps: [
      { id: "step-points", title: "Placer les points de repère", instruction: `Placer ${params.segments + 1} points alignés, espacés de ${segmentHeight.toFixed(1)} mm.`, geometry: worldPoints.map((_, i) => ({ kind: "point" as const, id: `P${i}` })) },
      ...arcs.map((arc, i) => ({ id: `step-arc-${i}`, title: `Tracer l'arc ${i + 1}`, instruction: `Placer le centre C${i} et tracer l'arc ${i + 1} de flèche ${sagittaAbs.toFixed(1)} mm.`, geometry: [{ kind: "point" as const, id: `C${i}` }, { kind: "arc" as const, arc }] })),
    ],
    quality: "exact",
  };
}

registerShapeGenerator<WaveCurveParameters>("waveCurve", createWaveCurve);

export type SCurveParameters = Omit<WaveCurveParameters, "segments">;
export function createSCurve(params: SCurveParameters): ParametricShape<WaveCurveParameters> {
  const shape = createWaveCurve({ ...params, segments: 2 });
  return { ...shape, id: "s-curve", type: "sCurve" };
}
registerShapeGenerator<SCurveParameters>("sCurve", createSCurve);

export function createDoubleSCurve(params: SCurveParameters): ParametricShape<WaveCurveParameters> {
  const shape = createWaveCurve({ ...params, segments: 4 });
  return { ...shape, id: "double-s-curve", type: "doubleSCurve" };
}
registerShapeGenerator<SCurveParameters>("doubleSCurve", createDoubleSCurve);

export type FigureEightParameters = { loopDiameter: number; orientation?: "vertical" | "horizontal"; centre?: Point2D };

/** Forme en 8 : deux cercles de même diamètre, tangents au centre. */
export function createFigureEight(params: FigureEightParameters): ParametricShape<FigureEightParameters> {
  const radius = assertFinitePositive(params.loopDiameter, "Le diamètre des boucles") / 2;
  const centre = params.centre ?? { x: 0, y: 0 };
  const vertical = (params.orientation ?? "vertical") === "vertical";
  const offset = vertical ? { x: 0, y: radius } : { x: radius, y: 0 };
  const c1: Point2D = { x: centre.x + offset.x, y: centre.y + offset.y };
  const c2: Point2D = { x: centre.x - offset.x, y: centre.y - offset.y };
  const primitives = emptyPrimitives();
  primitives.points.O = centre;
  primitives.circles.push({ centre: c1, radius }, { centre: c2, radius });
  const bounds = boundsFromPoints([{ x: c1.x - radius, y: c1.y - radius }, { x: c1.x + radius, y: c1.y + radius }, { x: c2.x - radius, y: c2.y - radius }, { x: c2.x + radius, y: c2.y + radius }], 10);
  return {
    id: "figure-eight",
    type: "figureEight",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation: 0,
    metadata: {},
    constructionSteps: [
      { id: "step-centre", instruction: "Matérialiser le point de tangence O.", geometry: [{ kind: "point", id: "O" }] },
      { id: "step-loops", instruction: `Tracer les deux cercles de rayon ${radius.toFixed(1)} mm, chacun tangent en O.`, geometry: [{ kind: "circle", circle: { centre: c1, radius } }, { kind: "circle", circle: { centre: c2, radius } }] },
    ],
    quality: "exact",
  };
}
registerShapeGenerator<FigureEightParameters>("figureEight", createFigureEight);

/** Point de tangence extérieur commun à deux cercles (une des deux tangentes, signe +/-1). */
function externalTangentPoints(c1: Point2D, r1: number, c2: Point2D, r2: number, sign: 1 | -1) {
  const d = distance(c1, c2);
  if (d < Math.abs(r1 - r2)) throw new Error("Construction impossible : un cercle contient l'autre, aucune tangente extérieure commune.");
  const phi = polarAngle(c1, c2);
  const beta = sign * Math.acos(Math.max(-1, Math.min(1, (r1 - r2) / d)));
  const angle = phi + beta;
  const n = { x: Math.cos(angle), y: Math.sin(angle) };
  return { t1: { x: c1.x + r1 * n.x, y: c1.y + r1 * n.y }, t2: { x: c2.x + r2 * n.x, y: c2.y + r2 * n.y } };
}

export type LinkedCirclesParameters = { diameter1: number; diameter2: number; centreDistance: number; centre?: Point2D; rotationDegrees?: number };

/** Deux cercles reliés par leurs deux tangentes extérieures communes (forme "haltère"). */
export function createLinkedCircles(params: LinkedCirclesParameters): ParametricShape<LinkedCirclesParameters> {
  const r1 = assertFinitePositive(params.diameter1, "Le premier diamètre") / 2;
  const r2 = assertFinitePositive(params.diameter2, "Le second diamètre") / 2;
  const centreDistance = assertFinitePositive(params.centreDistance, "La distance entre centres");
  const centre = params.centre ?? { x: 0, y: 0 };
  const rotation = degToRad(params.rotationDegrees ?? 0);
  const transform = compose(translation(centre.x, centre.y), rotationAround({ x: 0, y: 0 }, rotation));
  const localC1: Point2D = { x: -centreDistance / 2, y: 0 };
  const localC2: Point2D = { x: centreDistance / 2, y: 0 };
  const upper = externalTangentPoints(localC1, r1, localC2, r2, 1);
  const lower = externalTangentPoints(localC1, r1, localC2, r2, -1);
  const c1 = applyTransform(transform, localC1);
  const c2 = applyTransform(transform, localC2);
  const primitives = emptyPrimitives();
  primitives.circles.push({ centre: c1, radius: r1 }, { centre: c2, radius: r2 });
  primitives.segments.push({ start: applyTransform(transform, upper.t1), end: applyTransform(transform, upper.t2) }, { start: applyTransform(transform, lower.t1), end: applyTransform(transform, lower.t2) });
  const bounds = boundsFromPoints([{ x: c1.x - r1, y: c1.y - r1 }, { x: c1.x + r1, y: c1.y + r1 }, { x: c2.x - r2, y: c2.y - r2 }, { x: c2.x + r2, y: c2.y + r2 }], 10);
  return {
    id: "linked-circles",
    type: "linkedCircles",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation,
    metadata: {},
    constructionSteps: [
      { id: "step-circles", instruction: `Tracer les deux cercles (Ø ${params.diameter1.toFixed(1)} et Ø ${params.diameter2.toFixed(1)} mm), centres distants de ${centreDistance.toFixed(1)} mm.`, geometry: [{ kind: "circle", circle: { centre: c1, radius: r1 } }, { kind: "circle", circle: { centre: c2, radius: r2 } }] },
      { id: "step-tangents", instruction: "Tracer les deux tangentes extérieures communes reliant les cercles.", geometry: primitives.segments.map((segment) => ({ kind: "segment" as const, segment })) },
    ],
    quality: "exact",
  };
}
registerShapeGenerator<LinkedCirclesParameters>("linkedCircles", createLinkedCircles);

export type LinkedRingsParameters = { outerDiameter1: number; innerDiameter1: number; outerDiameter2: number; innerDiameter2: number; gap?: number; centre?: Point2D; rotationDegrees?: number };

/** Deux anneaux (couronnes) reliés, tangents extérieurement ou séparés d'un jeu donné. */
export function createLinkedRings(params: LinkedRingsParameters): ParametricShape<LinkedRingsParameters> {
  const outerR1 = assertFinitePositive(params.outerDiameter1, "Le diamètre extérieur 1") / 2;
  const innerR1 = assertFinitePositive(params.innerDiameter1, "Le diamètre intérieur 1") / 2;
  const outerR2 = assertFinitePositive(params.outerDiameter2, "Le diamètre extérieur 2") / 2;
  const innerR2 = assertFinitePositive(params.innerDiameter2, "Le diamètre intérieur 2") / 2;
  if (innerR1 >= outerR1 || innerR2 >= outerR2) throw new Error("Chaque diamètre intérieur doit être inférieur à son diamètre extérieur.");
  const gap = params.gap ?? 0;
  const centreDistance = outerR1 + outerR2 + gap;
  const centre = params.centre ?? { x: 0, y: 0 };
  const rotation = degToRad(params.rotationDegrees ?? 0);
  const transform = compose(translation(centre.x, centre.y), rotationAround({ x: 0, y: 0 }, rotation));
  const c1 = applyTransform(transform, { x: -centreDistance / 2, y: 0 });
  const c2 = applyTransform(transform, { x: centreDistance / 2, y: 0 });
  const primitives = emptyPrimitives();
  primitives.circles.push({ centre: c1, radius: outerR1 }, { centre: c1, radius: innerR1 }, { centre: c2, radius: outerR2 }, { centre: c2, radius: innerR2 });
  const bounds = boundsFromPoints([{ x: c1.x - outerR1, y: c1.y - outerR1 }, { x: c1.x + outerR1, y: c1.y + outerR1 }, { x: c2.x - outerR2, y: c2.y - outerR2 }, { x: c2.x + outerR2, y: c2.y + outerR2 }], 10);
  return {
    id: "linked-rings",
    type: "linkedRings",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation,
    metadata: { centreDistance },
    constructionSteps: [
      { id: "step-centres", instruction: `Placer les deux centres distants de ${centreDistance.toFixed(1)} mm.`, geometry: [] },
      { id: "step-rings", instruction: "Tracer chaque couronne (cercle extérieur puis intérieur).", geometry: primitives.circles.map((circle) => ({ kind: "circle" as const, circle })) },
    ],
    quality: "exact",
  };
}
registerShapeGenerator<LinkedRingsParameters>("linkedRings", createLinkedRings);
