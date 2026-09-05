import { degToRad } from "./angles";
import { emptyPrimitives, registerShapeGenerator, type ParametricShape } from "./model";
import { applyTransform, compose, rotationAround, translation } from "./transform";
import { assertFinitePositive, type Point2D } from "./types";

export type EllipseParameters = { width: number; height: number; centre?: Point2D; rotationDegrees?: number };

/**
 * Ellipse générique constructible par la méthode des foyers : a = demi-grand axe, b = demi-petit
 * axe, c = distance focale (c² = a² − b²). `radiusX`/`radiusY` valent toujours `width/2`/`height/2`
 * (jamais réordonnés) — une hauteur supérieure à la largeur donne naturellement une ellipse plus
 * haute que large, sans rotation. `rotationDegrees` (optionnel, défaut 0) reste générique pour un
 * usage futur ; aucun appelant actuel n'en a besoin. Cas cercle (width === height) : c = 0, les
 * deux foyers sont confondus avec le centre — un cas valide, pas une exception.
 */
export function createEllipse(params: EllipseParameters): ParametricShape<EllipseParameters> {
  const width = assertFinitePositive(params.width, "La largeur");
  const height = assertFinitePositive(params.height, "La hauteur");
  const centre = params.centre ?? { x: 0, y: 0 };
  const rotation = degToRad(params.rotationDegrees ?? 0);
  const transform = compose(translation(centre.x, centre.y), rotationAround({ x: 0, y: 0 }, rotation));

  const radiusX = width / 2;
  const radiusY = height / 2;
  const a = Math.max(radiusX, radiusY);
  const b = Math.min(radiusX, radiusY);
  // Garde contre un résidu flottant négatif infime quand a === b (cas cercle) : c doit rester
  // exactement 0, jamais NaN via sqrt d'un nombre négatif.
  const c = Math.sqrt(Math.max(0, a * a - b * b));
  const majorAlongX = radiusX >= radiusY;

  // Repère local (avant transform) : sommets sur chaque demi-axe, foyers sur le demi-axe dont le
  // rayon vaut réellement `a` (jamais supposé être radiusX par convention).
  const localPoints = {
    O: { x: 0, y: 0 },
    "Vx-": { x: -radiusX, y: 0 },
    "Vx+": { x: radiusX, y: 0 },
    "Vy-": { x: 0, y: -radiusY },
    "Vy+": { x: 0, y: radiusY },
    F1: majorAlongX ? { x: -c, y: 0 } : { x: 0, y: -c },
    F2: majorAlongX ? { x: c, y: 0 } : { x: 0, y: c },
  };
  const world = Object.fromEntries(Object.entries(localPoints).map(([id, p]) => [id, applyTransform(transform, p)])) as Record<keyof typeof localPoints, Point2D>;

  const primitives = emptyPrimitives();
  Object.assign(primitives.points, world);
  const ellipse = { centre: world.O, radiusX, radiusY, rotation, role: "shape" as const };
  primitives.ellipses.push(ellipse);

  const axisMargin = Math.max(20, a * 0.1);
  const axisX = { start: applyTransform(transform, { x: -radiusX - axisMargin, y: 0 }), end: applyTransform(transform, { x: radiusX + axisMargin, y: 0 }), role: "axis" as const };
  const axisY = { start: applyTransform(transform, { x: 0, y: -radiusY - axisMargin }), end: applyTransform(transform, { x: 0, y: radiusY + axisMargin }), role: "axis" as const };
  primitives.segments.push(axisX, axisY);

  // Enveloppe exacte (pas seulement sûre) d'une ellipse pivotée : demi-étendue le long de chaque
  // axe monde = hypot(radiusX·cos θ, radiusY·sin θ) et hypot(radiusX·sin θ, radiusY·cos θ).
  const halfWidth = Math.hypot(radiusX * Math.cos(rotation), radiusY * Math.sin(rotation));
  const halfHeight = Math.hypot(radiusX * Math.sin(rotation), radiusY * Math.cos(rotation));
  const boundingBox = { minX: centre.x - halfWidth, minY: centre.y - halfHeight, maxX: centre.x + halfWidth, maxY: centre.y + halfHeight };

  return {
    id: "ellipse",
    type: "ellipse",
    parameters: params,
    primitives,
    boundingBox,
    centre: world.O,
    width: boundingBox.maxX - boundingBox.minX,
    height: boundingBox.maxY - boundingBox.minY,
    rotation,
    metadata: { a, b, c, majorAlongX },
    constructionSteps: [
      { id: "step-axes", title: "Tracer les axes", instruction: "Tracer les deux axes perpendiculaires, centrés au même point.", geometry: [{ kind: "segment", segment: axisX }, { kind: "segment", segment: axisY }] },
      { id: "step-centre", title: "Repérer le centre", instruction: "Repérer le centre O.", geometry: [{ kind: "point", id: "O" }] },
      { id: "step-major", title: "Reporter le demi-grand axe", instruction: `Reporter le demi-grand axe a = ${a.toFixed(1)} mm de part et d'autre de O.`, geometry: majorAlongX ? [{ kind: "point", id: "Vx-" }, { kind: "point", id: "Vx+" }] : [{ kind: "point", id: "Vy-" }, { kind: "point", id: "Vy+" }] },
      { id: "step-minor", title: "Reporter le demi-petit axe", instruction: `Reporter le demi-petit axe b = ${b.toFixed(1)} mm de part et d'autre de O.`, geometry: majorAlongX ? [{ kind: "point", id: "Vy-" }, { kind: "point", id: "Vy+" }] : [{ kind: "point", id: "Vx-" }, { kind: "point", id: "Vx+" }] },
      { id: "step-foci", title: "Calculer et repérer les foyers", instruction: `c = √(a² − b²) = ${c.toFixed(1)} mm. Placer F1 et F2 à c de O sur le grand axe.`, geometry: [{ kind: "point", id: "F1" }, { kind: "point", id: "F2" }] },
      { id: "step-ellipse", title: "Tracer l'ellipse", instruction: "Tracer l'ellipse complète.", geometry: [{ kind: "ellipse", ellipse }] },
      { id: "step-check", title: "Contrôle final", instruction: "Contrôler que les deux foyers sont symétriques par rapport à O et que le contour respecte les deux demi-axes.", geometry: [{ kind: "point", id: "O" }, { kind: "point", id: "F1" }, { kind: "point", id: "F2" }] },
    ],
    quality: "exact",
  };
}

registerShapeGenerator<EllipseParameters>("ellipse", createEllipse);
