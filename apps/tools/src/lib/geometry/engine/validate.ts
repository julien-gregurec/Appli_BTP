import { distance } from "./measure";
import { angularSweepOf } from "./measure";
import { segmentSegmentIntersection } from "./intersections";
import type { ParametricShape } from "./model";
import type { Point2D, Segment2D } from "./types";

export type GeometryValidationError = { code: string; message: string; context?: Record<string, unknown> };

const DUPLICATE_TOLERANCE = 1e-6;

function pushNonFiniteErrors(errors: GeometryValidationError[], shape: ParametricShape): void {
  const serialized = JSON.stringify(shape.primitives);
  if (/NaN|Infinity|null/.test(serialized)) {
    errors.push({ code: "non-finite-value", message: "La géométrie contient une valeur non finie (NaN/Infinity) ou manquante." });
  }
}

function pushInvalidRadiusErrors(errors: GeometryValidationError[], shape: ParametricShape): void {
  for (const circle of shape.primitives.circles) {
    if (!Number.isFinite(circle.radius) || circle.radius <= 0) errors.push({ code: "invalid-radius", message: "Un cercle possède un rayon nul ou négatif.", context: { circle } });
  }
  for (const arc of shape.primitives.arcs) {
    if (!Number.isFinite(arc.radius) || arc.radius <= 0) errors.push({ code: "invalid-radius", message: "Un arc possède un rayon nul ou négatif.", context: { arc } });
    if (Math.abs(angularSweepOf(arc)) < 1e-9) errors.push({ code: "incoherent-arc", message: "Un arc a un balayage angulaire nul : angles de départ et de fin identiques.", context: { arc } });
  }
  for (const ellipse of shape.primitives.ellipses) {
    if (!Number.isFinite(ellipse.radiusX) || ellipse.radiusX <= 0 || !Number.isFinite(ellipse.radiusY) || ellipse.radiusY <= 0) errors.push({ code: "invalid-radius", message: "Une ellipse possède un demi-axe nul ou négatif.", context: { ellipse } });
  }
}

function pushDuplicatePointErrors(errors: GeometryValidationError[], shape: ParametricShape): void {
  const entries = Object.entries(shape.primitives.points);
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      if (distance(entries[i][1], entries[j][1]) < DUPLICATE_TOLERANCE) {
        errors.push({ code: "duplicate-points", message: `Les points "${entries[i][0]}" et "${entries[j][0]}" sont confondus.`, context: { a: entries[i][0], b: entries[j][0] } });
      }
    }
  }
}

function pushOutOfBoundsErrors(errors: GeometryValidationError[], shape: ParametricShape): void {
  const margin = 1e-3;
  for (const [id, p] of Object.entries(shape.primitives.points)) {
    if (p.x < shape.boundingBox.minX - margin || p.x > shape.boundingBox.maxX + margin || p.y < shape.boundingBox.minY - margin || p.y > shape.boundingBox.maxY + margin) {
      errors.push({ code: "out-of-bounds", message: `Le point "${id}" se situe hors de la bounding box déclarée.`, context: { id, point: p } });
    }
  }
}

/** Détecte l'auto-intersection d'une ligne brisée (arêtes non adjacentes qui se croisent). */
export function hasSelfIntersection(points: readonly Point2D[], closed: boolean): boolean {
  const segments: Segment2D[] = [];
  for (let i = 0; i < points.length - 1; i++) segments.push({ start: points[i], end: points[i + 1] });
  if (closed && points.length > 2) segments.push({ start: points[points.length - 1], end: points[0] });
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const adjacent = j === i + 1 || (closed && i === 0 && j === segments.length - 1);
      if (adjacent) continue;
      if (segmentSegmentIntersection(segments[i], segments[j]).kind !== "none") return true;
    }
  }
  return false;
}

function pushSelfIntersectionErrors(errors: GeometryValidationError[], shape: ParametricShape): void {
  for (const polygon of shape.primitives.polygons) {
    if (hasSelfIntersection(polygon.points, true)) errors.push({ code: "self-intersection", message: "Un polygone déclaré est auto-intersecté." });
  }
  for (const polyline of shape.primitives.polylines) {
    if (hasSelfIntersection(polyline.points, polyline.closed === true)) errors.push({ code: "self-intersection", message: "Une ligne brisée déclarée est auto-intersectée." });
  }
}

function pushShouldBeClosedErrors(errors: GeometryValidationError[], shape: ParametricShape): void {
  if (shape.metadata.shouldBeClosed === true) {
    for (const polyline of shape.primitives.polylines) {
      if (!polyline.closed) errors.push({ code: "should-be-closed", message: "Une forme censée être fermée contient une ligne brisée ouverte." });
    }
  }
}

function pushOffsetErrors(errors: GeometryValidationError[], shape: ParametricShape): void {
  if (shape.metadata.offsetImpossible) {
    errors.push({ code: "impossible-offset", message: String(shape.metadata.offsetImpossible) });
  }
}

/** Vérification géométrique générique d'une forme paramétrique. Ne retourne jamais silencieusement un résultat faux. */
export function validateGeometry(shape: ParametricShape): GeometryValidationError[] {
  const errors: GeometryValidationError[] = [];
  pushNonFiniteErrors(errors, shape);
  pushInvalidRadiusErrors(errors, shape);
  pushDuplicatePointErrors(errors, shape);
  pushOutOfBoundsErrors(errors, shape);
  pushSelfIntersectionErrors(errors, shape);
  pushShouldBeClosedErrors(errors, shape);
  pushOffsetErrors(errors, shape);
  return errors;
}
