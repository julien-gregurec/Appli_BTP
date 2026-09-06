import { degToRad } from "./angles";
import { tangentPointsFromExternal } from "./circle-tools";
import { angleWithinArc } from "./intersections";
import { boundsFromPoints, polarAngle } from "./measure";
import { emptyPrimitives, registerShapeGenerator, type ConstructionStepGeometry, type ParametricShape } from "./model";
import { applyTransform, compose, rotationAround, scaleAround, translation } from "./transform";
import { transformGeometry } from "./geometry-ops";
import { assertFinitePositive, type Arc2D, type Point2D, type Segment2D } from "./types";

export type HeartParameters = { width: number; height: number; centre?: Point2D; rotationDegrees?: number; innerBandRatio?: number; centralCrease?: boolean };

/** Cœur constructible : deux lobes circulaires tangents, prolongés par deux tangentes convergeant vers la pointe. */
export function createHeart(params: HeartParameters): ParametricShape<HeartParameters> {
  const width = assertFinitePositive(params.width, "La largeur");
  const height = assertFinitePositive(params.height, "La hauteur");
  const lobeRadius = width / 4;
  if (height <= lobeRadius) throw new Error("La hauteur d'un cœur doit dépasser le quart de sa largeur (rayon des lobes).");
  const centre = params.centre ?? { x: 0, y: 0 };
  const rotation = degToRad(params.rotationDegrees ?? 0);
  const transform = compose(translation(centre.x, centre.y), rotationAround({ x: 0, y: 0 }, rotation));
  const localLeftCentre: Point2D = { x: -lobeRadius, y: 0 };
  const localRightCentre: Point2D = { x: lobeRadius, y: 0 };
  const localCusp: Point2D = { x: 0, y: -(height - lobeRadius) };
  const [leftOuter, leftInner] = tangentPointsFromExternal(localCusp, { centre: localLeftCentre, radius: lobeRadius });
  const [rightInner, rightOuter] = tangentPointsFromExternal(localCusp, { centre: localRightCentre, radius: lobeRadius });
  // Le point tangent "extérieur" est celui le plus éloigné de l'axe vertical (x le plus négatif/positif).
  const leftTangent = leftOuter.x < leftInner.x ? leftOuter : leftInner;
  const rightTangent = rightOuter.x > rightInner.x ? rightOuter : rightInner;
  const topAngleLeft = polarAngle(localLeftCentre, { x: 0, y: 0 });
  const tangentAngleLeft = polarAngle(localLeftCentre, leftTangent);
  const outerAngleLeft = polarAngle(localLeftCentre, { x: -lobeRadius, y: 0 });
  const candidateLeft: Arc2D = { centre: localLeftCentre, radius: lobeRadius, startAngle: topAngleLeft, endAngle: tangentAngleLeft, counterClockwise: true };
  const leftCcw = angleWithinArc(candidateLeft, outerAngleLeft);
  const topAngleRight = polarAngle(localRightCentre, { x: 0, y: 0 });
  const tangentAngleRight = polarAngle(localRightCentre, rightTangent);
  const outerAngleRight = polarAngle(localRightCentre, { x: lobeRadius, y: 0 });
  const candidateRight: Arc2D = { centre: localRightCentre, radius: lobeRadius, startAngle: tangentAngleRight, endAngle: topAngleRight, counterClockwise: true };
  const rightCcw = angleWithinArc(candidateRight, outerAngleRight);
  const localLeftArc: Arc2D = { ...candidateLeft, counterClockwise: leftCcw };
  const localRightArc: Arc2D = { ...candidateRight, counterClockwise: rightCcw };
  const worldLeftCentre = applyTransform(transform, localLeftCentre);
  const worldRightCentre = applyTransform(transform, localRightCentre);
  const leftArc: Arc2D = { centre: worldLeftCentre, radius: lobeRadius, startAngle: localLeftArc.startAngle + rotation, endAngle: localLeftArc.endAngle + rotation, counterClockwise: localLeftArc.counterClockwise };
  const rightArc: Arc2D = { centre: worldRightCentre, radius: lobeRadius, startAngle: localRightArc.startAngle + rotation, endAngle: localRightArc.endAngle + rotation, counterClockwise: localRightArc.counterClockwise };
  const cusp = applyTransform(transform, localCusp);
  const leftTangentWorld = applyTransform(transform, leftTangent);
  const rightTangentWorld = applyTransform(transform, rightTangent);
  const leftSegment: Segment2D = { start: leftTangentWorld, end: cusp };
  const rightSegment: Segment2D = { start: rightTangentWorld, end: cusp };
  const primitives = emptyPrimitives();
  primitives.points.cusp = cusp;
  primitives.points.leftLobe = worldLeftCentre;
  primitives.points.rightLobe = worldRightCentre;
  primitives.arcs.push(leftArc, rightArc);
  primitives.segments.push(leftSegment, rightSegment);
  const creaseGeometry: ConstructionStepGeometry[] = [];
  if (params.centralCrease) {
    const top = applyTransform(transform, { x: 0, y: 0 });
    const creaseSegment: Segment2D = { start: top, end: cusp };
    primitives.segments.push(creaseSegment);
    creaseGeometry.push({ kind: "segment", segment: creaseSegment });
  }
  if (params.innerBandRatio) {
    const ratio = params.innerBandRatio;
    if (ratio <= 0 || ratio >= 1) throw new Error("Le ratio de bande intérieure doit être strictement compris entre 0 et 1.");
    const scale = scaleAround(centre, ratio);
    primitives.arcs.push(transformGeometry(scale, leftArc), transformGeometry(scale, rightArc));
    primitives.segments.push(transformGeometry(scale, leftSegment), transformGeometry(scale, rightSegment));
  }
  const bounds = boundsFromPoints([cusp, { x: worldLeftCentre.x - lobeRadius, y: worldLeftCentre.y - lobeRadius }, { x: worldLeftCentre.x + lobeRadius, y: worldLeftCentre.y + lobeRadius }, { x: worldRightCentre.x - lobeRadius, y: worldRightCentre.y - lobeRadius }, { x: worldRightCentre.x + lobeRadius, y: worldRightCentre.y + lobeRadius }], 10);
  return {
    id: "heart",
    type: "heart",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation,
    metadata: { shouldBeClosed: true, lobeRadius },
    constructionSteps: [
      { id: "step-lobes", instruction: `Tracer les deux lobes tangents, cercles de rayon ${lobeRadius.toFixed(1)} mm.`, geometry: [{ kind: "arc", arc: leftArc }, { kind: "arc", arc: rightArc }] },
      { id: "step-cusp", instruction: `Placer la pointe à ${(height - lobeRadius).toFixed(1)} mm sous le point de tangence des lobes.`, geometry: [{ kind: "point", id: "cusp" }] },
      { id: "step-sides", instruction: "Tracer les deux tangentes des lobes vers la pointe.", geometry: [{ kind: "segment", segment: leftSegment }, { kind: "segment", segment: rightSegment }] },
      ...(creaseGeometry.length ? [{ id: "step-crease", instruction: "Tracer la ligne centrale de pliure.", geometry: creaseGeometry }] : []),
    ],
    quality: "exact",
  };
}

registerShapeGenerator<HeartParameters>("heart", createHeart);

export type DoubleHeartParameters = HeartParameters & { gap?: number };

/** Deux cœurs identiques placés côte à côte, séparés par un jeu donné. */
export function createDoubleHeart(params: DoubleHeartParameters): ParametricShape<DoubleHeartParameters> {
  const gap = params.gap ?? params.width * 0.2;
  const centre = params.centre ?? { x: 0, y: 0 };
  const offset = (params.width + gap) / 2;
  const left = createHeart({ ...params, centre: { x: centre.x - offset, y: centre.y } });
  const right = createHeart({ ...params, centre: { x: centre.x + offset, y: centre.y } });
  const primitives = emptyPrimitives();
  Object.assign(primitives.points, { ...prefixed(left.primitives.points, "L"), ...prefixed(right.primitives.points, "R") });
  primitives.arcs.push(...left.primitives.arcs, ...right.primitives.arcs);
  primitives.segments.push(...left.primitives.segments, ...right.primitives.segments);
  const bounds = { minX: Math.min(left.boundingBox.minX, right.boundingBox.minX), minY: Math.min(left.boundingBox.minY, right.boundingBox.minY), maxX: Math.max(left.boundingBox.maxX, right.boundingBox.maxX), maxY: Math.max(left.boundingBox.maxY, right.boundingBox.maxY) };
  return {
    id: "double-heart",
    type: "doubleHeart",
    parameters: params,
    primitives,
    boundingBox: bounds,
    centre,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
    rotation: degToRad(params.rotationDegrees ?? 0),
    metadata: { gap },
    constructionSteps: [...left.constructionSteps, ...right.constructionSteps],
    quality: "exact",
  };
}

function prefixed(points: Record<string, Point2D>, prefix: string): Record<string, Point2D> {
  return Object.fromEntries(Object.entries(points).map(([id, p]) => [`${prefix}-${id}`, p]));
}

registerShapeGenerator<DoubleHeartParameters>("doubleHeart", createDoubleHeart);
