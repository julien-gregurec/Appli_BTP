import { degToRad } from "./angles";
import { tangentPointsFromExternal } from "./circle-tools";
import { angleWithinArc } from "./intersections";
import { boundsFromPoints, polarAngle } from "./measure";
import { emptyPrimitives, registerShapeGenerator, type ConstructionStepGeometry, type ParametricShape } from "./model";
import { applyTransform, compose, rotationAround, scaleAround, translation } from "./transform";
import { transformGeometry } from "./geometry-ops";
import { assertFinitePositive, type Arc2D, type Circle2D, type Point2D, type Segment2D } from "./types";

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
  // Lobes de construction (C4-LOT1-V1 §8) : les deux cercles complets dont les arcs ne sont
  // qu'une portion — aide de tracé au compas, jamais le tracé final (rôle "construction").
  const leftCircle: Circle2D = { centre: worldLeftCentre, radius: lobeRadius, role: "construction" };
  const rightCircle: Circle2D = { centre: worldRightCentre, radius: lobeRadius, role: "construction" };
  // Axe vertical de symétrie (repère de construction, rôle "axis") : couvre la hauteur totale
  // du cœur (du sommet des lobes à la pointe), avec une marge identique de part et d'autre.
  const axisTop = applyTransform(transform, { x: 0, y: lobeRadius * 1.3 });
  const axisBottom = applyTransform(transform, { x: 0, y: -(height - lobeRadius) - lobeRadius * 1.3 });
  const axisSegment: Segment2D = { start: axisBottom, end: axisTop, role: "axis" };
  const primitives = emptyPrimitives();
  primitives.points.cusp = cusp;
  primitives.points.leftLobe = worldLeftCentre;
  primitives.points.rightLobe = worldRightCentre;
  primitives.arcs.push(leftArc, rightArc);
  primitives.segments.push(axisSegment, leftSegment, rightSegment);
  primitives.circles.push(leftCircle, rightCircle);
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
      { id: "step-axis", title: "Tracer l'axe vertical", instruction: "Tracez l'axe vertical de symétrie du cœur.", geometry: [{ kind: "segment", segment: axisSegment }] },
      { id: "step-centres", title: "Placer les centres des lobes", instruction: `Placez les deux centres à ${lobeRadius.toFixed(1)} mm de part et d'autre de l'axe.`, geometry: [{ kind: "point", id: "leftLobe" }, { kind: "point", id: "rightLobe" }] },
      { id: "step-lobes", title: "Tracer les deux lobes", instruction: `Réglez le compas au rayon ${lobeRadius.toFixed(1)} mm et tracez les deux cercles : ils se touchent sur l'axe.`, geometry: [{ kind: "circle", circle: leftCircle }, { kind: "circle", circle: rightCircle }] },
      { id: "step-cusp", title: "Placer la pointe", instruction: `Sur l'axe, placez la pointe à ${(height - lobeRadius).toFixed(1)} mm sous le point de tangence des lobes.`, geometry: [{ kind: "point", id: "cusp" }] },
      { id: "step-sides", title: "Tracer les deux tangentes", instruction: "Depuis la pointe, tracez les deux droites tangentes aux cercles pour fermer le contour.", geometry: [{ kind: "arc", arc: leftArc }, { kind: "arc", arc: rightArc }, { kind: "segment", segment: leftSegment }, { kind: "segment", segment: rightSegment }] },
      ...(creaseGeometry.length ? [{ id: "step-crease", title: "Tracer la pliure centrale", instruction: "Tracez la ligne centrale de pliure.", geometry: creaseGeometry }] : []),
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
