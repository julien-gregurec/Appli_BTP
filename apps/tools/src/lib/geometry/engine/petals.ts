import { degToRad } from "./angles";
import { arcThroughChordAndSagitta, tangentPointsFromExternal } from "./circle-tools";
import { angleWithinArc, circleCircleIntersection } from "./intersections";
import { boundsFromPoints, distance, polarAngle } from "./measure";
import { emptyPrimitives, registerShapeGenerator, type ParametricShape } from "./model";
import { applyTransform, compose, rotationAround, translation } from "./transform";
import { assertFinitePositive, type Arc2D, type Point2D } from "./types";

export type LeafParameters = { width: number; height: number; leftBulge?: number; rightBulge?: number; centre?: Point2D; rotationDegrees?: number };

/** Feuille/pétale constructible : deux arcs passant par les mêmes deux pointes, de flèches indépendantes. */
export function createLeaf(params: LeafParameters): ParametricShape<LeafParameters> {
  const height = assertFinitePositive(params.height, "La hauteur");
  const leftBulge = assertFinitePositive(params.leftBulge ?? (params.width ?? 0) / 2, "La flèche gauche");
  const rightBulge = assertFinitePositive(params.rightBulge ?? (params.width ?? 0) / 2, "La flèche droite");
  const centre = params.centre ?? { x: 0, y: 0 };
  const transform = compose(translation(centre.x, centre.y), rotationAround({ x: 0, y: 0 }, degToRad(params.rotationDegrees ?? 0)));
  const localTop: Point2D = { x: 0, y: height / 2 };
  const localBottom: Point2D = { x: 0, y: -height / 2 };
  const rightArcLocal = arcThroughChordAndSagitta(localTop, localBottom, rightBulge);
  const leftArcLocal = arcThroughChordAndSagitta(localTop, localBottom, -leftBulge);
  const top = applyTransform(transform, localTop);
  const bottom = applyTransform(transform, localBottom);
  const rightArc: Arc2D = { centre: applyTransform(transform, rightArcLocal.centre), radius: rightArcLocal.radius, startAngle: rightArcLocal.startAngle + degToRad(params.rotationDegrees ?? 0), endAngle: rightArcLocal.endAngle + degToRad(params.rotationDegrees ?? 0), counterClockwise: rightArcLocal.counterClockwise };
  const leftArc: Arc2D = { centre: applyTransform(transform, leftArcLocal.centre), radius: leftArcLocal.radius, startAngle: leftArcLocal.startAngle + degToRad(params.rotationDegrees ?? 0), endAngle: leftArcLocal.endAngle + degToRad(params.rotationDegrees ?? 0), counterClockwise: leftArcLocal.counterClockwise };
  const primitives = emptyPrimitives();
  primitives.points.top = top;
  primitives.points.bottom = bottom;
  primitives.points.centre = centre;
  primitives.arcs.push(rightArc, leftArc);
  const samplePoints = [top, bottom, applyTransform(transform, rightArcLocal.apex), applyTransform(transform, leftArcLocal.apex)];
  const bounds = boundsFromPoints(samplePoints, 10);
  return {
    id: "leaf",
    type: "leaf",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation: degToRad(params.rotationDegrees ?? 0),
    metadata: { shouldBeClosed: true },
    constructionSteps: [
      { id: "step-tips", instruction: `Placer les deux pointes distantes de ${height.toFixed(1)} mm.`, geometry: [{ kind: "point", id: "top" }, { kind: "point", id: "bottom" }] },
      { id: "step-right", instruction: `Tracer l'arc de droite avec une flèche de ${rightBulge.toFixed(1)} mm.`, geometry: [{ kind: "arc", arc: rightArc }] },
      { id: "step-left", instruction: `Tracer l'arc de gauche avec une flèche de ${leftBulge.toFixed(1)} mm.`, geometry: [{ kind: "arc", arc: leftArc }] },
    ],
    quality: "exact",
  };
}

registerShapeGenerator<LeafParameters>("leaf", createLeaf);

export type PetalParameters = { width: number; height: number; centre?: Point2D; rotationDegrees?: number };

/** Pétale symétrique (vesica) : cas particulier de la feuille à flèches égales. */
export function createPetal(params: PetalParameters): ParametricShape<PetalParameters> {
  const shape = createLeaf({ width: params.width, height: params.height, leftBulge: params.width / 2, rightBulge: params.width / 2, centre: params.centre, rotationDegrees: params.rotationDegrees });
  return { ...shape, id: "petal", type: "petal", parameters: params };
}

registerShapeGenerator<PetalParameters>("petal", createPetal);

/** Lentille : alias métier du pétale symétrique (même construction géométrique). */
export const createLens = createPetal;

export type DropParameters = { diameter: number; height: number; centre?: Point2D; rotationDegrees?: number };

/** Goutte constructible : cercle prolongé de deux tangentes convergeant vers une pointe. */
export function createDrop(params: DropParameters): ParametricShape<DropParameters> {
  const diameter = assertFinitePositive(params.diameter, "Le diamètre");
  const height = assertFinitePositive(params.height, "La hauteur");
  const radius = diameter / 2;
  if (height <= diameter) throw new Error("La hauteur d'une goutte doit dépasser son diamètre pour que la pointe existe hors du cercle.");
  const centre = params.centre ?? { x: 0, y: 0 };
  const rotation = degToRad(params.rotationDegrees ?? 0);
  const transform = compose(translation(centre.x, centre.y), rotationAround({ x: 0, y: 0 }, rotation));
  const localCircleCentre: Point2D = { x: 0, y: 0 };
  const localApex: Point2D = { x: 0, y: height - radius };
  const [t1Local, t2Local] = tangentPointsFromExternal(localApex, { centre: localCircleCentre, radius });
  const apex = applyTransform(transform, localApex);
  const circleCentre = applyTransform(transform, localCircleCentre);
  const t1 = applyTransform(transform, t1Local);
  const t2 = applyTransform(transform, t2Local);
  const angleT1 = polarAngle(localCircleCentre, t1Local);
  const angleT2 = polarAngle(localCircleCentre, t2Local);
  const bottomAngleLocal = polarAngle(localCircleCentre, { x: 0, y: -radius });
  const candidate: Arc2D = { centre: localCircleCentre, radius, startAngle: angleT1, endAngle: angleT2, counterClockwise: true };
  const counterClockwise = angleWithinArc(candidate, bottomAngleLocal);
  const arc: Arc2D = { centre: circleCentre, radius, startAngle: angleT1 + rotation, endAngle: angleT2 + rotation, counterClockwise };
  const primitives = emptyPrimitives();
  primitives.points.apex = apex;
  primitives.points.O = circleCentre;
  primitives.arcs.push(arc);
  primitives.segments.push({ start: apex, end: t1 }, { start: apex, end: t2 });
  const bounds = boundsFromPoints([apex, t1, t2, { x: circleCentre.x - radius, y: circleCentre.y - radius }, { x: circleCentre.x + radius, y: circleCentre.y + radius }], 10);
  return {
    id: "drop",
    type: "drop",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation,
    metadata: { shouldBeClosed: true },
    constructionSteps: [
      { id: "step-circle", instruction: `Tracer le cercle de diamètre ${diameter.toFixed(1)} mm.`, geometry: [{ kind: "circle", circle: { centre: circleCentre, radius } }] },
      { id: "step-apex", instruction: `Placer la pointe à ${(height - radius).toFixed(1)} mm du centre du cercle.`, geometry: [{ kind: "point", id: "apex" }] },
      { id: "step-tangents", instruction: "Tracer les deux tangentes depuis la pointe jusqu'au cercle.", geometry: [{ kind: "segment", segment: { start: apex, end: t1 } }, { kind: "segment", segment: { start: apex, end: t2 } }] },
    ],
    quality: "exact",
  };
}

registerShapeGenerator<DropParameters>("drop", createDrop);

export type CrescentParameters = { outerDiameter: number; innerDiameter: number; offset: number; centre?: Point2D; rotationDegrees?: number };

/** Croissant : grand arc extérieur et arc intérieur d'un second cercle décalé. */
export function createCrescent(params: CrescentParameters): ParametricShape<CrescentParameters> {
  const outerRadius = assertFinitePositive(params.outerDiameter, "Le diamètre extérieur") / 2;
  const innerRadius = assertFinitePositive(params.innerDiameter, "Le diamètre intérieur") / 2;
  const offset = assertFinitePositive(params.offset, "Le décalage");
  const centre = params.centre ?? { x: 0, y: 0 };
  const rotation = degToRad(params.rotationDegrees ?? 0);
  const outerLocal = { centre: { x: 0, y: 0 }, radius: outerRadius };
  const innerLocal = { centre: { x: offset, y: 0 }, radius: innerRadius };
  const result = circleCircleIntersection(outerLocal, innerLocal);
  if (result.kind !== "two") throw new Error("Construction impossible : ces deux cercles ne se croisent pas en deux points (ajuster le décalage ou les diamètres).");
  const [p1, p2] = result.points;
  const outerFarAngle = polarAngle(outerLocal.centre, { x: -outerRadius, y: 0 });
  const outerCandidate: Arc2D = { centre: outerLocal.centre, radius: outerRadius, startAngle: polarAngle(outerLocal.centre, p1), endAngle: polarAngle(outerLocal.centre, p2), counterClockwise: true };
  const outerCcw = angleWithinArc(outerCandidate, outerFarAngle);
  const innerNearAngle = polarAngle(innerLocal.centre, { x: 0, y: 0 });
  const innerCandidate: Arc2D = { centre: innerLocal.centre, radius: innerRadius, startAngle: polarAngle(innerLocal.centre, p1), endAngle: polarAngle(innerLocal.centre, p2), counterClockwise: true };
  const innerCcw = angleWithinArc(innerCandidate, innerNearAngle);
  const transform = compose(translation(centre.x, centre.y), rotationAround({ x: 0, y: 0 }, rotation));
  const outerArc: Arc2D = { centre: applyTransform(transform, outerLocal.centre), radius: outerRadius, startAngle: outerCandidate.startAngle + rotation, endAngle: outerCandidate.endAngle + rotation, counterClockwise: outerCcw };
  const innerArc: Arc2D = { centre: applyTransform(transform, innerLocal.centre), radius: innerRadius, startAngle: innerCandidate.startAngle + rotation, endAngle: innerCandidate.endAngle + rotation, counterClockwise: innerCcw };
  const tip1 = applyTransform(transform, p1);
  const tip2 = applyTransform(transform, p2);
  const primitives = emptyPrimitives();
  primitives.points.tip1 = tip1;
  primitives.points.tip2 = tip2;
  primitives.arcs.push(outerArc, innerArc);
  const bounds = boundsFromPoints([tip1, tip2, { x: outerArc.centre.x - outerRadius, y: outerArc.centre.y - outerRadius }, { x: outerArc.centre.x + outerRadius, y: outerArc.centre.y + outerRadius }], 10);
  return {
    id: "crescent",
    type: "crescent",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation,
    metadata: { shouldBeClosed: true, tipDistance: distance(p1, p2) },
    constructionSteps: [
      { id: "step-circles", instruction: `Tracer le cercle extérieur (Ø ${params.outerDiameter.toFixed(1)} mm) et le cercle intérieur (Ø ${params.innerDiameter.toFixed(1)} mm) décalé de ${offset.toFixed(1)} mm.`, geometry: [{ kind: "circle", circle: { centre: applyTransform(transform, outerLocal.centre), radius: outerRadius } }, { kind: "circle", circle: { centre: applyTransform(transform, innerLocal.centre), radius: innerRadius } }] },
      { id: "step-trace", instruction: "Conserver le grand arc extérieur et l'arc intérieur entre les deux points d'intersection.", geometry: [{ kind: "arc", arc: outerArc }, { kind: "arc", arc: innerArc }] },
    ],
    quality: "exact",
  };
}

registerShapeGenerator<CrescentParameters>("crescent", createCrescent);
