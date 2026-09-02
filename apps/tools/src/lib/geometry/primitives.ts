export type Point = { id: string; x: number; y: number; label?: string; role?: "reference" | "construction" | "control" };
export type Vector = { x: number; y: number };
export type Segment = { id: string; start: Point; end: Point; role?: "shape" | "construction" | "axis" };
export type Circle = { id: string; centre: Point; radius: number; role?: "shape" | "construction" };
export type Ellipse = { id: string; centre: Point; radiusX: number; radiusY: number; rotation?: number; role?: "shape" | "construction" };
export type Arc = { id: string; centre: Point; radius: number; startAngle: number; endAngle: number; counterClockwise?: boolean; role?: "shape" | "construction" };
export type Axis = { id: string; origin: Point; direction: Vector; label: string };
export type BoundingBox = { minX: number; minY: number; maxX: number; maxY: number };
export type Angle = { radians: number; degrees: number };
export type ConstructionPoint = Point & { role: "construction" | "control" };
export type Dimension = {
  id: string;
  kind: "linear" | "radius" | "diameter" | "angle";
  from: Point;
  to: Point;
  label: string;
  value: number;
  unit: "mm" | "°";
  offset?: number;
};

const EPSILON = 1e-9;

export function assertFinitePositive(value: number, label: string) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} doit être supérieur à 0.`);
  return value;
}

export function point(id: string, x: number, y: number, label = id, role: Point["role"] = "reference"): Point {
  if (![x, y].every(Number.isFinite)) throw new Error(`Coordonnées invalides pour le point ${id}.`);
  return { id, x, y, label, role };
}

export function distance(a: Point, b: Point) { return Math.hypot(b.x - a.x, b.y - a.y); }
export function midpoint(a: Point, b: Point, id = `${a.id}${b.id}-mid`) { return point(id, (a.x + b.x) / 2, (a.y + b.y) / 2); }
export function vector(a: Point, b: Point): Vector { return { x: b.x - a.x, y: b.y - a.y }; }
export function vectorLength(value: Vector) { return Math.hypot(value.x, value.y); }
export function normalize(value: Vector): Vector {
  const length = vectorLength(value);
  if (length < EPSILON) throw new Error("Impossible de normaliser un vecteur nul.");
  return { x: value.x / length, y: value.y / length };
}
export function translate(source: Point, movement: Vector, id = source.id) { return point(id, source.x + movement.x, source.y + movement.y, source.label, source.role); }
export function rotate(source: Point, centre: Point, radians: number, id = source.id) {
  const cosine = Math.cos(radians); const sine = Math.sin(radians);
  const x = source.x - centre.x; const y = source.y - centre.y;
  return point(id, centre.x + x * cosine - y * sine, centre.y + x * sine + y * cosine, source.label, source.role);
}
export function polar(centre: Point, radius: number, angleRadians: number, id: string) {
  return point(id, centre.x + radius * Math.cos(angleRadians), centre.y + radius * Math.sin(angleRadians));
}
export function projection(source: Point, line: Segment, id = `${source.id}-projection`) {
  const direction = vector(line.start, line.end); const lengthSquared = direction.x ** 2 + direction.y ** 2;
  if (lengthSquared < EPSILON) throw new Error("Projection impossible sur un segment nul.");
  const t = ((source.x - line.start.x) * direction.x + (source.y - line.start.y) * direction.y) / lengthSquared;
  return point(id, line.start.x + t * direction.x, line.start.y + t * direction.y);
}
export function angleBetween(first: Vector, second: Vector): Angle {
  const denominator = vectorLength(first) * vectorLength(second);
  if (denominator < EPSILON) throw new Error("Angle impossible avec un vecteur nul.");
  const radians = Math.acos(Math.max(-1, Math.min(1, (first.x * second.x + first.y * second.y) / denominator)));
  return { radians, degrees: radians * 180 / Math.PI };
}
export function lineIntersection(first: Segment, second: Segment, id = "I"): Point | null {
  const p = first.start; const r = vector(first.start, first.end); const q = second.start; const s = vector(second.start, second.end);
  const cross = r.x * s.y - r.y * s.x;
  if (Math.abs(cross) < EPSILON) return null;
  const t = ((q.x - p.x) * s.y - (q.y - p.y) * s.x) / cross;
  return point(id, p.x + t * r.x, p.y + t * r.y);
}
export function lineCircleIntersections(line: Segment, circle: Circle, prefix = "I"): Point[] {
  const d = vector(line.start, line.end); const f = vector(circle.centre, line.start);
  const a = d.x ** 2 + d.y ** 2; const b = 2 * (f.x * d.x + f.y * d.y); const c = f.x ** 2 + f.y ** 2 - circle.radius ** 2;
  if (a < EPSILON) throw new Error("Intersection impossible avec une ligne nulle.");
  const discriminant = b ** 2 - 4 * a * c;
  if (discriminant < -EPSILON) return [];
  if (Math.abs(discriminant) <= EPSILON) { const t = -b / (2 * a); return [point(`${prefix}1`, line.start.x + t * d.x, line.start.y + t * d.y)]; }
  const root = Math.sqrt(discriminant); const t1 = (-b - root) / (2 * a); const t2 = (-b + root) / (2 * a);
  return [point(`${prefix}1`, line.start.x + t1 * d.x, line.start.y + t1 * d.y), point(`${prefix}2`, line.start.x + t2 * d.x, line.start.y + t2 * d.y)];
}
export function circleCircleIntersections(first: Circle, second: Circle, prefix = "I"): Point[] {
  const d = distance(first.centre, second.centre);
  if (d < EPSILON || d > first.radius + second.radius + EPSILON || d < Math.abs(first.radius - second.radius) - EPSILON) return [];
  const a = (first.radius ** 2 - second.radius ** 2 + d ** 2) / (2 * d);
  const hSquared = first.radius ** 2 - a ** 2;
  const h = Math.sqrt(Math.max(0, hSquared));
  const x = first.centre.x + a * (second.centre.x - first.centre.x) / d;
  const y = first.centre.y + a * (second.centre.y - first.centre.y) / d;
  const rx = -(second.centre.y - first.centre.y) * h / d; const ry = (second.centre.x - first.centre.x) * h / d;
  if (h < EPSILON) return [point(`${prefix}1`, x, y)];
  return [point(`${prefix}1`, x + rx, y + ry), point(`${prefix}2`, x - rx, y - ry)];
}
export function tangentPoints(external: Point, circle: Circle, prefix = "T"): Point[] {
  const d = distance(external, circle.centre);
  if (d < circle.radius - EPSILON) return [];
  if (Math.abs(d - circle.radius) < EPSILON) return [point(`${prefix}1`, external.x, external.y)];
  const base = Math.atan2(external.y - circle.centre.y, external.x - circle.centre.x);
  const delta = Math.acos(circle.radius / d);
  return [polar(circle.centre, circle.radius, base + delta, `${prefix}1`), polar(circle.centre, circle.radius, base - delta, `${prefix}2`)];
}
export function arcLength(radius: number, angleRadians: number) { return Math.abs(radius * angleRadians); }
export function chordLength(radius: number, angleRadians: number) { return 2 * radius * Math.sin(Math.abs(angleRadians) / 2); }
export function sagitta(radius: number, chord: number) {
  assertFinitePositive(radius, "Le rayon"); assertFinitePositive(chord, "La corde");
  if (chord > radius * 2) throw new Error("La corde ne peut pas dépasser le diamètre.");
  return radius - Math.sqrt(radius ** 2 - (chord / 2) ** 2);
}
export function boundsFromPoints(points: readonly Point[], padding = 0): BoundingBox {
  if (!points.length) throw new Error("Une bounding box exige au moins un point.");
  return { minX: Math.min(...points.map((p) => p.x)) - padding, minY: Math.min(...points.map((p) => p.y)) - padding, maxX: Math.max(...points.map((p) => p.x)) + padding, maxY: Math.max(...points.map((p) => p.y)) + padding };
}
