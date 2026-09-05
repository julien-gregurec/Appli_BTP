import { radToDeg } from "./angles";
import { angleAtVertex, distance } from "./measure";
import type { Circle2D, Point2D } from "./types";

export type DimensionKind = "linear-horizontal" | "linear-vertical" | "linear-aligned" | "radius" | "diameter" | "angle" | "centre-distance" | "coordinate";

export type DimensionResult = {
  kind: DimensionKind;
  value: number;
  unit: "mm" | "°";
  anchors: { from: Point2D; to: Point2D; offsetPoint?: Point2D };
};

export function createHorizontalDimension(a: Point2D, b: Point2D, offset = 0): DimensionResult {
  return { kind: "linear-horizontal", value: Math.abs(b.x - a.x), unit: "mm", anchors: { from: a, to: b, offsetPoint: { x: (a.x + b.x) / 2, y: Math.max(a.y, b.y) + offset } } };
}

export function createVerticalDimension(a: Point2D, b: Point2D, offset = 0): DimensionResult {
  return { kind: "linear-vertical", value: Math.abs(b.y - a.y), unit: "mm", anchors: { from: a, to: b, offsetPoint: { x: Math.max(a.x, b.x) + offset, y: (a.y + b.y) / 2 } } };
}

/** Cote alignée : distance réelle entre A et B, quelle que soit leur orientation. */
export function createAlignedDimension(a: Point2D, b: Point2D, offset = 0): DimensionResult {
  const direction = { x: b.x - a.x, y: b.y - a.y };
  const length = Math.hypot(direction.x, direction.y) || 1;
  const normal = { x: -direction.y / length, y: direction.x / length };
  const mid = { x: (a.x + b.x) / 2 + normal.x * offset, y: (a.y + b.y) / 2 + normal.y * offset };
  return { kind: "linear-aligned", value: distance(a, b), unit: "mm", anchors: { from: a, to: b, offsetPoint: mid } };
}

export function createRadiusDimension(circle: Circle2D, anglePointDegrees = 45): DimensionResult {
  const angle = (anglePointDegrees * Math.PI) / 180;
  const to = { x: circle.centre.x + circle.radius * Math.cos(angle), y: circle.centre.y + circle.radius * Math.sin(angle) };
  return { kind: "radius", value: circle.radius, unit: "mm", anchors: { from: circle.centre, to } };
}

export function createDiameterDimension(circle: Circle2D, anglePointDegrees = 0): DimensionResult {
  const angle = (anglePointDegrees * Math.PI) / 180;
  const from = { x: circle.centre.x - circle.radius * Math.cos(angle), y: circle.centre.y - circle.radius * Math.sin(angle) };
  const to = { x: circle.centre.x + circle.radius * Math.cos(angle), y: circle.centre.y + circle.radius * Math.sin(angle) };
  return { kind: "diameter", value: circle.radius * 2, unit: "mm", anchors: { from, to } };
}

export function createAngleDimension(vertex: Point2D, a: Point2D, b: Point2D): DimensionResult {
  const angle = angleAtVertex(a, vertex, b);
  return { kind: "angle", value: radToDeg(angle.radians), unit: "°", anchors: { from: a, to: b, offsetPoint: vertex } };
}

export function createCentreDistanceDimension(a: Point2D, b: Point2D): DimensionResult {
  return { kind: "centre-distance", value: distance(a, b), unit: "mm", anchors: { from: a, to: b } };
}

/** Renvoie les deux cotes X/Y d'un point par rapport à une origine. */
export function createCoordinateDimensions(point: Point2D, origin: Point2D = { x: 0, y: 0 }): [DimensionResult, DimensionResult] {
  return [
    { kind: "coordinate", value: point.x - origin.x, unit: "mm", anchors: { from: origin, to: { x: point.x, y: origin.y } } },
    { kind: "coordinate", value: point.y - origin.y, unit: "mm", anchors: { from: origin, to: { x: origin.x, y: point.y } } },
  ];
}
