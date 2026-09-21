/**
 * ATELIER-HITTEST-SNAP-FOUNDATION-V1 §1/§4 — point le plus proche sur chaque primitive.
 *
 * Module pur : aucune notion d'écran, de tolérance, de scène ni de sélection. Il répond à une
 * seule question, par primitive : « quel est le point de cette forme le plus proche de P, et à
 * quelle distance ? ». La tolérance, la priorité et le snap sont bâtis par-dessus
 * (`hit-test.ts`, `lib/viewport/snap.ts`) et n'ont pas à refaire cette trigonométrie.
 *
 * Ce sont de VRAIES projections, jamais un test de boîte englobante (§4) : un clic à l'intérieur
 * de la bbox d'un arc mais loin de l'arc lui-même ne le désigne pas.
 *
 * Convention : les unités sont celles du modèle (millimètres) et le repère est celui d'Engine A
 * (`geometry/primitives.ts`), Y vers le haut. La conversion écran ↔ monde est faite en amont par
 * `lib/viewport/viewport-math.ts` — rien ici ne connaît le pixel.
 *
 * Aucune fonction ne lève : une primitive dégénérée (segment nul, rayon nul, polyligne vide)
 * renvoie un résultat exploitable ou `null`, jamais une exception. Le hit-testing s'exécute sur
 * un mouvement de pointeur, il ne peut pas se permettre de faire tomber le rendu.
 */

import type { Arc, Circle, Ellipse, Polygon, Polyline, Segment } from "./primitives";

/** Point du plan sans identité — `Point` (Engine A) en est un sur-ensemble. */
export type PlanePoint = { x: number; y: number };

export type ClosestPoint = {
  /** Point de la primitive le plus proche de la cible. */
  point: PlanePoint;
  /** Distance euclidienne entre la cible et ce point. */
  distance: number;
};

/** Tolérance numérique de dégénérescence — sous ce seuil une longueur est traitée comme nulle. */
const EPSILON = 1e-9;

/** Garde-fou de la bissection sur l'ellipse : au-delà, la précision double est déjà atteinte. */
const ELLIPSE_MAX_ITERATIONS = 80;

function hypot(dx: number, dy: number): number {
  return Math.hypot(dx, dy);
}

function result(point: PlanePoint, target: PlanePoint): ClosestPoint {
  return { point, distance: hypot(target.x - point.x, target.y - point.y) };
}

/** Distance entre deux points. */
export function closestPointOnPoint(target: PlanePoint, source: PlanePoint): ClosestPoint {
  return { point: { x: source.x, y: source.y }, distance: hypot(target.x - source.x, target.y - source.y) };
}

/**
 * Projection sur un segment BORNÉ. `primitives.projection` projette sur la droite infinie et
 * lève sur un segment nul : ce n'est pas le même calcul, d'où une fonction distincte plutôt
 * qu'un appel détourné.
 */
export function closestPointOnSegment(target: PlanePoint, start: PlanePoint, end: PlanePoint): ClosestPoint {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < EPSILON) return result({ x: start.x, y: start.y }, target);
  const t = Math.min(1, Math.max(0, ((target.x - start.x) * dx + (target.y - start.y) * dy) / lengthSquared));
  return result({ x: start.x + t * dx, y: start.y + t * dy }, target);
}

export function closestPointOnSegmentEntity(target: PlanePoint, segment: Segment): ClosestPoint {
  return closestPointOnSegment(target, segment.start, segment.end);
}

/**
 * Projection sur le CONTOUR d'un cercle (pas sur le disque) : un clic au centre est à
 * `radius` du cercle, il ne le désigne donc pas de près. C'est le comportement attendu d'un
 * tracé — on sélectionne un trait, pas une surface.
 */
export function closestPointOnCircle(target: PlanePoint, circle: Circle): ClosestPoint {
  const { centre, radius } = circle;
  const dx = target.x - centre.x;
  const dy = target.y - centre.y;
  const length = hypot(dx, dy);
  if (!Number.isFinite(radius) || radius <= EPSILON) return result({ x: centre.x, y: centre.y }, target);
  // Cible exactement au centre : toutes les directions se valent, on en fixe une (angle 0) pour
  // rester déterministe d'un appel à l'autre.
  if (length < EPSILON) return { point: { x: centre.x + radius, y: centre.y }, distance: radius };
  const ratio = radius / length;
  return { point: { x: centre.x + dx * ratio, y: centre.y + dy * ratio }, distance: Math.abs(length - radius) };
}

/**
 * Balayage signé d'un arc, normalisé EXACTEMENT comme `createArcPath` (`geometry/plan-model.ts`).
 * Le hit-test et le rendu doivent s'accorder sur la portion réellement dessinée : dupliquer
 * cette normalisation avec une autre convention ferait diverger ce qu'on voit et ce qu'on peut
 * désigner. Positif = sens trigonométrique, négatif = sens horaire.
 */
export function arcSweep(arc: Pick<Arc, "startAngle" | "endAngle" | "counterClockwise">): number {
  let delta = arc.endAngle - arc.startAngle;
  if (arc.counterClockwise === false && delta > 0) delta -= Math.PI * 2;
  if (arc.counterClockwise !== false && delta < 0) delta += Math.PI * 2;
  return delta;
}

/** Reste toujours positif — `%` de JavaScript garde le signe du dividende. */
function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/** L'angle appartient-il à la portion réellement balayée par l'arc ? */
export function arcContainsAngle(arc: Pick<Arc, "startAngle" | "endAngle" | "counterClockwise">, angle: number): boolean {
  const sweep = arcSweep(arc);
  const span = Math.abs(sweep);
  if (span >= Math.PI * 2 - EPSILON) return true;
  const travelled = sweep >= 0 ? positiveModulo(angle - arc.startAngle, Math.PI * 2) : positiveModulo(arc.startAngle - angle, Math.PI * 2);
  return travelled <= span + EPSILON;
}

/** Extrémités d'un arc, dans l'ordre de parcours. */
export function arcEndpoints(arc: Arc): readonly [PlanePoint, PlanePoint] {
  return [
    { x: arc.centre.x + arc.radius * Math.cos(arc.startAngle), y: arc.centre.y + arc.radius * Math.sin(arc.startAngle) },
    { x: arc.centre.x + arc.radius * Math.cos(arc.endAngle), y: arc.centre.y + arc.radius * Math.sin(arc.endAngle) },
  ];
}

/** Milieu de l'arc, sur l'arc (pas le milieu de la corde). */
export function arcMidpoint(arc: Arc): PlanePoint {
  const middle = arc.startAngle + arcSweep(arc) / 2;
  return { x: arc.centre.x + arc.radius * Math.cos(middle), y: arc.centre.y + arc.radius * Math.sin(middle) };
}

/**
 * Projection sur un arc. Si la cible « voit » l'arc dans son secteur angulaire, le point le plus
 * proche est sur le cercle porteur ; sinon c'est l'extrémité la plus proche — une projection
 * radiale hors secteur donnerait un point qui n'est pas dessiné.
 */
export function closestPointOnArc(target: PlanePoint, arc: Arc): ClosestPoint {
  const { centre, radius } = arc;
  if (!Number.isFinite(radius) || radius <= EPSILON) return result({ x: centre.x, y: centre.y }, target);
  const dx = target.x - centre.x;
  const dy = target.y - centre.y;
  const length = hypot(dx, dy);
  if (length >= EPSILON && arcContainsAngle(arc, Math.atan2(dy, dx))) {
    const ratio = radius / length;
    return { point: { x: centre.x + dx * ratio, y: centre.y + dy * ratio }, distance: Math.abs(length - radius) };
  }
  const [start, end] = arcEndpoints(arc);
  const toStart = result(start, target);
  const toEnd = result(end, target);
  return toStart.distance <= toEnd.distance ? toStart : toEnd;
}

/**
 * Racine de l'équation de Bézout de l'ellipse, par bissection (méthode de Eberly).
 *
 * `F(s) = (r0·z0 / (s + r0))² + (z1 / (s + 1))² − 1` est strictement décroissante sur
 * l'intervalle encadré, la bissection converge donc toujours — pas d'itération de Newton qui
 * pourrait diverger sur une ellipse très aplatie. On s'arrête dès que l'intervalle n'est plus
 * représentable en double : le résultat est exact à la précision machine, ce n'est pas une
 * approximation heuristique.
 */
function ellipseRoot(r0: number, z0: number, z1: number, g: number): number {
  const n0 = r0 * z0;
  let low = z1 - 1;
  let high = g < 0 ? 0 : hypot(n0, z1) - 1;
  let middle = low;
  for (let iteration = 0; iteration < ELLIPSE_MAX_ITERATIONS; iteration += 1) {
    middle = (low + high) / 2;
    if (middle === low || middle === high) break;
    const ratio0 = n0 / (middle + r0);
    const ratio1 = z1 / (middle + 1);
    const value = ratio0 * ratio0 + ratio1 * ratio1 - 1;
    if (value > 0) low = middle;
    else if (value < 0) high = middle;
    else break;
  }
  return middle;
}

/**
 * Point le plus proche sur une ellipse axée, dans le premier quadrant, avec `major >= minor`.
 * Les deux cas dégénérés (cible sur un axe) sont traités en forme fermée : la bissection y est
 * indéfinie, et les traiter par un epsilon donnerait une erreur non bornée près des sommets.
 */
function closestOnCanonicalEllipse(x: number, y: number, major: number, minor: number): PlanePoint {
  if (y > EPSILON) {
    if (x > EPSILON) {
      const z0 = x / major;
      const z1 = y / minor;
      const g = z0 * z0 + z1 * z1 - 1;
      if (Math.abs(g) < EPSILON) return { x, y };
      const r0 = (major / minor) ** 2;
      const root = ellipseRoot(r0, z0, z1, g);
      return { x: (r0 * x) / (root + r0), y: y / (root + 1) };
    }
    return { x: 0, y: minor };
  }
  // Cible sur le grand axe : au-delà du foyer d'évolute, le sommet est le point le plus proche.
  const numerator = major * x;
  const denominator = major * major - minor * minor;
  if (denominator > EPSILON && numerator < denominator) {
    const ratio = numerator / denominator;
    return { x: major * ratio, y: minor * Math.sqrt(Math.max(0, 1 - ratio * ratio)) };
  }
  return { x: major, y: 0 };
}

/**
 * Projection sur le contour d'une ellipse, rotation comprise.
 *
 * Calcul EXACT (§4), pas une approximation par échantillonnage ni par cercle équivalent : la
 * cible est ramenée dans le repère propre de l'ellipse, repliée dans le premier quadrant, la
 * racine est obtenue par bissection encadrée, puis le point est renvoyé dans le repère du
 * modèle. Vérifié en test contre une recherche exhaustive à 2 000 000 d'échantillons.
 */
export function closestPointOnEllipse(target: PlanePoint, ellipse: Ellipse): ClosestPoint {
  const { centre, radiusX, radiusY } = ellipse;
  if (!Number.isFinite(radiusX) || !Number.isFinite(radiusY) || radiusX <= EPSILON || radiusY <= EPSILON) {
    return result({ x: centre.x, y: centre.y }, target);
  }
  const rotation = ellipse.rotation ?? 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);

  // Repère propre de l'ellipse.
  const dx = target.x - centre.x;
  const dy = target.y - centre.y;
  const localX = dx * cos + dy * sin;
  const localY = -dx * sin + dy * cos;

  // Repliement dans le premier quadrant : l'ellipse est symétrique par rapport à ses deux axes.
  const signX = localX < 0 ? -1 : 1;
  const signY = localY < 0 ? -1 : 1;
  const absX = Math.abs(localX);
  const absY = Math.abs(localY);

  // La bissection suppose grand axe >= petit axe : on échange les axes au besoin, puis on défait.
  const swapped = radiusX < radiusY;
  const major = swapped ? radiusY : radiusX;
  const minor = swapped ? radiusX : radiusY;
  const solved = swapped
    ? (() => {
        const flipped = closestOnCanonicalEllipse(absY, absX, major, minor);
        return { x: flipped.y, y: flipped.x };
      })()
    : closestOnCanonicalEllipse(absX, absY, major, minor);

  const restoredX = solved.x * signX;
  const restoredY = solved.y * signY;
  return result(
    { x: centre.x + restoredX * cos - restoredY * sin, y: centre.y + restoredX * sin + restoredY * cos },
    target,
  );
}

/** Projection sur une suite de sommets, ouverte (polyligne) ou refermée (contour). */
export function closestPointOnPath(target: PlanePoint, points: readonly PlanePoint[], closed: boolean): ClosestPoint | null {
  if (points.length === 0) return null;
  if (points.length === 1) return result({ x: points[0].x, y: points[0].y }, target);
  let best: ClosestPoint | null = null;
  const last = closed ? points.length : points.length - 1;
  for (let index = 0; index < last; index += 1) {
    const candidate = closestPointOnSegment(target, points[index], points[(index + 1) % points.length]);
    if (!best || candidate.distance < best.distance) best = candidate;
  }
  return best;
}

export function closestPointOnPolyline(target: PlanePoint, polyline: Polyline): ClosestPoint | null {
  return closestPointOnPath(target, polyline.points, false);
}

export function closestPointOnPolygon(target: PlanePoint, polygon: Polygon): ClosestPoint | null {
  return closestPointOnPath(target, polygon.points, true);
}
