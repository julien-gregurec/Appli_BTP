import type { Point2D, Transform2D, Vector2D } from "./types";

export const IDENTITY_TRANSFORM: Transform2D = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function translation(dx: number, dy: number): Transform2D {
  return { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy };
}

export function translationByVector(vector: Vector2D): Transform2D {
  return translation(vector.x, vector.y);
}

/** Rotation autour de l'origine (radians). */
export function rotation(radians: number): Transform2D {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
}

/** Rotation autour d'un point arbitraire. */
export function rotationAround(centre: Point2D, radians: number): Transform2D {
  return compose(compose(translation(centre.x, centre.y), rotation(radians)), translation(-centre.x, -centre.y));
}

/** Mise à l'échelle uniforme autour de l'origine. */
export function scaleUniform(factor: number): Transform2D {
  return { a: factor, b: 0, c: 0, d: factor, e: 0, f: 0 };
}

/** Mise à l'échelle X/Y indépendante autour de l'origine. */
export function scaleXY(factorX: number, factorY: number): Transform2D {
  return { a: factorX, b: 0, c: 0, d: factorY, e: 0, f: 0 };
}

/** Mise à l'échelle (uniforme ou X/Y) autour d'un point arbitraire. */
export function scaleAround(centre: Point2D, factorX: number, factorY = factorX): Transform2D {
  return compose(compose(translation(centre.x, centre.y), scaleXY(factorX, factorY)), translation(-centre.x, -centre.y));
}

/** Symétrie par rapport à l'axe horizontal (y = 0), ou à une droite horizontale y = axisY. */
export function mirrorHorizontal(axisY = 0): Transform2D {
  return compose(compose(translation(0, axisY), { a: 1, b: 0, c: 0, d: -1, e: 0, f: 0 }), translation(0, -axisY));
}

/** Symétrie par rapport à l'axe vertical (x = 0), ou à une droite verticale x = axisX. */
export function mirrorVertical(axisX = 0): Transform2D {
  return compose(compose(translation(axisX, 0), { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 }), translation(-axisX, 0));
}

/** Symétrie par rapport à une droite arbitraire passant par `point` et de direction `direction`. */
export function mirrorAxis(point: Point2D, direction: Vector2D): Transform2D {
  const length = Math.hypot(direction.x, direction.y);
  if (length < 1e-9) throw new Error("Impossible de construire une symétrie avec un axe de direction nulle.");
  const ux = direction.x / length;
  const uy = direction.y / length;
  // Réflexion par rapport à une droite passant par l'origine de direction (ux, uy), puis translation.
  const reflect: Transform2D = { a: 2 * ux * ux - 1, b: 2 * ux * uy, c: 2 * ux * uy, d: 2 * uy * uy - 1, e: 0, f: 0 };
  return compose(compose(translation(point.x, point.y), reflect), translation(-point.x, -point.y));
}

/** Composition de transformations : applique `second` puis `first` (ordre mathématique first ∘ second). */
export function compose(first: Transform2D, second: Transform2D): Transform2D {
  return {
    a: first.a * second.a + first.c * second.b,
    b: first.b * second.a + first.d * second.b,
    c: first.a * second.c + first.c * second.d,
    d: first.b * second.c + first.d * second.d,
    e: first.a * second.e + first.c * second.f + first.e,
    f: first.b * second.e + first.d * second.f + first.f,
  };
}

/** Composition d'une liste ordonnée de transformations, appliquées de gauche à droite sur un point. */
export function composeAll(transforms: readonly Transform2D[]): Transform2D {
  return transforms.reduce((acc, t) => compose(t, acc), IDENTITY_TRANSFORM);
}

export function applyTransform(transform: Transform2D, point: Point2D): Point2D {
  return { x: transform.a * point.x + transform.c * point.y + transform.e, y: transform.b * point.x + transform.d * point.y + transform.f };
}

export function applyTransformToVector(transform: Transform2D, vector: Vector2D): Vector2D {
  return { x: transform.a * vector.x + transform.c * vector.y, y: transform.b * vector.x + transform.d * vector.y };
}

export function applyTransformToPoints(transform: Transform2D, points: readonly Point2D[]): Point2D[] {
  return points.map((p) => applyTransform(transform, p));
}
