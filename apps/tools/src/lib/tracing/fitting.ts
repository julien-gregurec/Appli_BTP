/**
 * §21 à §25 — Conversion d'une suite de points en géométrie constructible :
 * ligne, cercle, arc, ellipse, avec l'erreur d'ajustement **mesurée**.
 *
 * L'artisan reproduit un motif au compas et au cordeau : un rayon et un centre lui sont
 * utiles, une nuée de points ne l'est pas. Ce module propose donc la primitive la plus
 * simple qui reste sous la tolérance demandée, et refuse de proposer quoi que ce soit
 * lorsque l'écart mesuré dépasse cette tolérance (§36 : aucun score inventé, seulement des
 * erreurs calculées).
 *
 * Unités : les fonctions travaillent dans l'unité des points fournis (pixels image ou
 * millimètres chantier). C'est à l'appelant de convertir la tolérance en conséquence.
 */

import { solveLinearSystem, symmetricEigen2x2 } from "./numeric";
import {
  angularSweepOf,
  distance,
  normalizeAngle,
  pointAtPolar,
  polarAngle,
  simplifyToConstructionElements,
  type Arc2D,
  type Circle2D,
  type ConstructionElement,
  type Ellipse2D,
  type Point2D,
  type Segment2D,
} from "./geometry-port";

/** Erreur d'un ajustement, dans l'unité des points fournis. */
export type FitError = {
  /** Écart maximal entre un point d'origine et la primitive ajustée. */
  maxError: number;
  /** Écart quadratique moyen. */
  rmsError: number;
  pointCount: number;
};

export type LineFit = { kind: "line"; segment: Segment2D } & FitError;
export type CircleFit = { kind: "circle"; circle: Circle2D } & FitError;
export type ArcFit = { kind: "arc"; arc: Arc2D; sweepDeg: number } & FitError;
export type EllipseFit = { kind: "ellipse"; ellipse: Ellipse2D } & FitError;
export type PolylineFit = { kind: "polyline"; points: readonly Point2D[] } & FitError;
export type GeometryFit = LineFit | CircleFit | ArcFit | EllipseFit | PolylineFit;

const MINIMUM_POINTS: Record<GeometryFit["kind"], number> = { line: 2, circle: 3, arc: 3, ellipse: 6, polyline: 2 };

function assertPoints(points: readonly Point2D[], kind: GeometryFit["kind"]): void {
  if (points.length < MINIMUM_POINTS[kind]) {
    throw new Error(`Ajustement impossible : au moins ${MINIMUM_POINTS[kind]} points sont nécessaires.`);
  }
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error("Un point à ajuster a des coordonnées invalides.");
  }
}

function errorsFrom(deviations: readonly number[]): FitError {
  let maxError = 0;
  let sumSquares = 0;
  for (const deviation of deviations) {
    const absolute = Math.abs(deviation);
    if (absolute > maxError) maxError = absolute;
    sumSquares += deviation * deviation;
  }
  return { maxError, rmsError: Math.sqrt(sumSquares / deviations.length), pointCount: deviations.length };
}

function centroidOf(points: readonly Point2D[]): Point2D {
  let x = 0;
  let y = 0;
  for (const point of points) {
    x += point.x;
    y += point.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/* -------------------------------------------------------------------------- */
/*  §22 — Droite                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Droite des moindres carrés totaux (axe principal du nuage) : contrairement à une
 * régression `y = ax + b`, elle traite les segments verticaux sans exploser.
 */
export function fitLine(points: readonly Point2D[]): LineFit {
  assertPoints(points, "line");
  const centre = centroidOf(points);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const point of points) {
    const dx = point.x - centre.x;
    const dy = point.y - centre.y;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  const { vectors } = symmetricEigen2x2(sxx, sxy, syy);
  const direction = vectors[0];
  if (!Number.isFinite(direction.x) || !Number.isFinite(direction.y) || Math.hypot(direction.x, direction.y) < 1e-12) {
    throw new Error("Ajustement de droite impossible : tous les points sont confondus.");
  }
  let minimum = Infinity;
  let maximum = -Infinity;
  const deviations: number[] = [];
  for (const point of points) {
    const dx = point.x - centre.x;
    const dy = point.y - centre.y;
    const along = dx * direction.x + dy * direction.y;
    deviations.push(dx * -direction.y + dy * direction.x);
    if (along < minimum) minimum = along;
    if (along > maximum) maximum = along;
  }
  return {
    kind: "line",
    segment: {
      start: { x: centre.x + direction.x * minimum, y: centre.y + direction.y * minimum },
      end: { x: centre.x + direction.x * maximum, y: centre.y + direction.y * maximum },
    },
    ...errorsFrom(deviations),
  };
}

/* -------------------------------------------------------------------------- */
/*  §24 — Cercle                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Cercle des moindres carrés (méthode algébrique de Kåsa, données recentrées pour la
 * stabilité numérique). L'erreur renvoyée est **géométrique** : |distance au centre − rayon|.
 */
export function fitCircle(points: readonly Point2D[]): CircleFit {
  assertPoints(points, "circle");
  const centre = centroidOf(points);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  let sx = 0;
  let sy = 0;
  let sxz = 0;
  let syz = 0;
  let sz = 0;
  for (const point of points) {
    const x = point.x - centre.x;
    const y = point.y - centre.y;
    const z = x * x + y * y;
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
    sx += x;
    sy += y;
    sxz += x * z;
    syz += y * z;
    sz += z;
  }
  const count = points.length;
  let solution: number[];
  try {
    solution = solveLinearSystem(
      [
        [sxx, sxy, sx],
        [sxy, syy, sy],
        [sx, sy, count],
      ],
      [-sxz, -syz, -sz],
    );
  } catch {
    throw new Error("Ajustement de cercle impossible : les points sont alignés ou confondus.");
  }
  const [d, e, f] = solution;
  const localCentre = { x: -d / 2, y: -e / 2 };
  const squaredRadius = localCentre.x * localCentre.x + localCentre.y * localCentre.y - f;
  if (!Number.isFinite(squaredRadius) || squaredRadius <= 0) {
    throw new Error("Ajustement de cercle impossible : les points sont alignés ou confondus.");
  }
  const circle: Circle2D = { centre: { x: localCentre.x + centre.x, y: localCentre.y + centre.y }, radius: Math.sqrt(squaredRadius) };
  const deviations = points.map((point) => distance(point, circle.centre) - circle.radius);
  return { kind: "circle", circle, ...errorsFrom(deviations) };
}

/* -------------------------------------------------------------------------- */
/*  §22 — Arc                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Arc des moindres carrés : le cercle est ajusté sur tous les points, puis les bornes
 * angulaires sont prises sur le premier et le dernier point, le sens étant décidé par un
 * point intermédiaire. L'erreur est celle du cercle sous-jacent.
 */
export function fitArc(points: readonly Point2D[]): ArcFit {
  assertPoints(points, "arc");
  const circleFit = fitCircle(points);
  const startAngle = polarAngle(circleFit.circle.centre, points[0]);
  const endAngle = polarAngle(circleFit.circle.centre, points[points.length - 1]);
  const midAngle = polarAngle(circleFit.circle.centre, points[Math.floor(points.length / 2)]);
  const sweepCounterClockwise = normalizeAngle(midAngle - startAngle) <= normalizeAngle(endAngle - startAngle);
  const arc: Arc2D = { ...circleFit.circle, startAngle, endAngle, counterClockwise: sweepCounterClockwise };
  return {
    kind: "arc",
    arc,
    sweepDeg: (angularSweepOf(arc) * 180) / Math.PI,
    maxError: circleFit.maxError,
    rmsError: circleFit.rmsError,
    pointCount: circleFit.pointCount,
  };
}

/* -------------------------------------------------------------------------- */
/*  §25 — Ellipse                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Ellipse des moindres carrés par ajustement de conique (`Ax² + Bxy + Cy² + Dx + Ey = 1`),
 * puis diagonalisation de la forme quadratique. Rejette explicitement les coniques qui ne
 * sont pas des ellipses (parabole, hyperbole) : mieux vaut ne rien proposer.
 */
export function fitEllipse(points: readonly Point2D[]): EllipseFit {
  assertPoints(points, "ellipse");
  const origin = centroidOf(points);
  const scale = Math.max(
    1e-9,
    Math.sqrt(points.reduce((sum, point) => sum + (point.x - origin.x) ** 2 + (point.y - origin.y) ** 2, 0) / points.length),
  );
  const normalized = points.map((point) => ({ x: (point.x - origin.x) / scale, y: (point.y - origin.y) / scale }));

  const design = normalized.map((point) => [point.x * point.x, point.x * point.y, point.y * point.y, point.x, point.y]);
  const normal: number[][] = Array.from({ length: 5 }, () => new Array<number>(5).fill(0));
  const rhs = new Array<number>(5).fill(0);
  for (const row of design) {
    for (let i = 0; i < 5; i++) {
      for (let j = 0; j < 5; j++) normal[i][j] += row[i] * row[j];
      rhs[i] += row[i];
    }
  }
  let conic: number[];
  try {
    conic = solveLinearSystem(normal, rhs);
  } catch {
    throw new Error("Ajustement d'ellipse impossible : les points sont dégénérés.");
  }
  const [a, b, c, d, e] = conic;
  const f = -1;
  const discriminant = b * b - 4 * a * c;
  if (!(discriminant < 0)) throw new Error("Ajustement d'ellipse impossible : les points ne décrivent pas une ellipse.");

  const centreX = (2 * c * d - b * e) / discriminant;
  const centreY = (2 * a * e - b * d) / discriminant;
  const constant = f + (d * centreX + e * centreY) / 2;
  const { values, vectors } = symmetricEigen2x2(a, b / 2, c);
  if (values[0] <= 0 || values[1] <= 0 || constant >= 0) {
    throw new Error("Ajustement d'ellipse impossible : les points ne décrivent pas une ellipse.");
  }
  const radiusX = Math.sqrt(-constant / values[0]) * scale;
  const radiusY = Math.sqrt(-constant / values[1]) * scale;
  const ellipse: Ellipse2D = {
    centre: { x: centreX * scale + origin.x, y: centreY * scale + origin.y },
    radiusX,
    radiusY,
    rotation: Math.atan2(vectors[0].y, vectors[0].x),
  };
  const deviations = points.map((point) => distanceToEllipse(point, ellipse));
  return { kind: "ellipse", ellipse, ...errorsFrom(deviations) };
}

/** Point de l'ellipse le plus proche de `point` (échantillonnage puis raffinement dichotomique). */
export function closestPointOnEllipse(point: Point2D, ellipse: Ellipse2D): Point2D {
  const rotation = ellipse.rotation ?? 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const dx = point.x - ellipse.centre.x;
  const dy = point.y - ellipse.centre.y;
  const local = { x: dx * cos + dy * sin, y: -dx * sin + dy * cos };
  const at = (t: number) => ({ x: ellipse.radiusX * Math.cos(t), y: ellipse.radiusY * Math.sin(t) });
  const squaredTo = (t: number) => {
    const p = at(t);
    return (p.x - local.x) ** 2 + (p.y - local.y) ** 2;
  };
  const samples = 128;
  let bestIndex = 0;
  let best = Infinity;
  for (let index = 0; index < samples; index++) {
    const value = squaredTo((index / samples) * 2 * Math.PI);
    if (value < best) {
      best = value;
      bestIndex = index;
    }
  }
  let low = ((bestIndex - 1) / samples) * 2 * Math.PI;
  let high = ((bestIndex + 1) / samples) * 2 * Math.PI;
  for (let iteration = 0; iteration < 40; iteration++) {
    const firstThird = low + (high - low) / 3;
    const secondThird = high - (high - low) / 3;
    if (squaredTo(firstThird) < squaredTo(secondThird)) high = secondThird;
    else low = firstThird;
  }
  const localBest = at((low + high) / 2);
  return {
    x: ellipse.centre.x + localBest.x * cos - localBest.y * sin,
    y: ellipse.centre.y + localBest.x * sin + localBest.y * cos,
  };
}

export function distanceToEllipse(point: Point2D, ellipse: Ellipse2D): number {
  return distance(point, closestPointOnEllipse(point, ellipse));
}

/** Échantillonne une ellipse en polyligne fermée (pour l'affichage ou la simplification). */
export function sampleEllipse(ellipse: Ellipse2D, segments = 180): Point2D[] {
  if (!Number.isInteger(segments) || segments < 8) throw new Error("Une ellipse s'échantillonne en 8 segments minimum.");
  const rotation = ellipse.rotation ?? 0;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const points: Point2D[] = [];
  for (let index = 0; index <= segments; index++) {
    const t = (index / segments) * 2 * Math.PI;
    const x = ellipse.radiusX * Math.cos(t);
    const y = ellipse.radiusY * Math.sin(t);
    points.push({ x: ellipse.centre.x + x * cos - y * sin, y: ellipse.centre.y + x * sin + y * cos });
  }
  return points;
}

export type EllipseSiteApproximation = {
  elements: ConstructionElement[];
  /** Écart maximal **mesuré** entre l'ellipse et son approximation, dans l'unité des points. */
  maxError: number;
  /** Message à afficher : une ellipse ne se trace pas au compas (§25). */
  notice: string;
};

/**
 * §25 — « Simplifier pour chantier » : remplace une ellipse par une suite de segments et
 * d'arcs de cercle réellement traçables au compas, en s'appuyant sur le simplificateur du
 * moteur. L'écart est mesuré, jamais promis.
 */
export function approximateEllipseForSite(ellipse: Ellipse2D, tolerance: number): EllipseSiteApproximation {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error("La tolérance d'approximation doit être supérieure à 0.");
  const samples = sampleEllipse(ellipse, 360);
  const result = simplifyToConstructionElements(samples, tolerance, "precise");
  return {
    elements: result.elements,
    maxError: result.estimatedMaxError,
    notice: "Une ellipse ne se trace pas au compas : elle est remplacée par des arcs de cercle raccordés.",
  };
}

/* -------------------------------------------------------------------------- */
/*  §21, §22 — Choix de la primitive                                          */
/* -------------------------------------------------------------------------- */

export type FitProposalStatus = "proposition";

export type GeometryProposal = {
  /** §17, §18 — toujours une proposition : rien n'entre en construction sans validation. */
  status: FitProposalStatus;
  fit: GeometryFit;
  /** Tolérance demandée, dans l'unité des points. */
  tolerance: number;
  /** Vrai si l'écart mesuré tient sous la tolérance. */
  withinTolerance: boolean;
  /** Phrase affichable, construite sur l'erreur mesurée (§36). */
  label: string;
  /** Primitives essayées et écartées, avec leur erreur — pour expliquer le choix. */
  rejected: readonly { kind: GeometryFit["kind"]; maxError: number }[];
};

export type FitOptions = {
  /** Autorise la proposition d'une ellipse (plus difficile à reproduire à la main). */
  allowEllipse?: boolean;
  /** Contour fermé : une ellipse ou un cercle complet devient plausible. */
  closed?: boolean;
};

/**
 * §21, §22 — Essaie la primitive la plus simple d'abord (droite, puis cercle/arc, puis
 * ellipse) et retient la première dont l'écart **mesuré** tient sous la tolérance. Si aucune
 * ne convient, renvoie la polyligne d'origine : la courbe est conservée, pas déformée.
 */
export function fitGeometry(points: readonly Point2D[], tolerance: number, options: FitOptions = {}): GeometryProposal {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error("La tolérance d'ajustement doit être supérieure à 0.");
  assertPoints(points, "polyline");
  const rejected: { kind: GeometryFit["kind"]; maxError: number }[] = [];

  const candidates: Array<() => GeometryFit> = [];
  candidates.push(() => fitLine(points));
  if (points.length >= 3) {
    candidates.push(() => {
      const arc = fitArc(points);
      const closedSweep = options.closed === true || arc.sweepDeg >= 350;
      if (closedSweep) {
        const circle = fitCircle(points);
        return circle;
      }
      return arc;
    });
  }
  if (options.allowEllipse !== false && points.length >= MINIMUM_POINTS.ellipse) {
    candidates.push(() => fitEllipse(points));
  }

  for (const candidate of candidates) {
    let fit: GeometryFit;
    try {
      fit = candidate();
    } catch {
      continue;
    }
    if (fit.maxError <= tolerance) {
      return {
        status: "proposition",
        fit,
        tolerance,
        withinTolerance: true,
        label: describeFit(fit),
        rejected,
      };
    }
    rejected.push({ kind: fit.kind, maxError: fit.maxError });
  }

  const polyline: PolylineFit = { kind: "polyline", points: points.map((point) => ({ x: point.x, y: point.y })), maxError: 0, rmsError: 0, pointCount: points.length };
  return {
    status: "proposition",
    fit: polyline,
    tolerance,
    withinTolerance: true,
    label: describeFit(polyline),
    rejected,
  };
}

/** Libellé d'une proposition : la primitive et son écart mesuré, jamais un pourcentage inventé. */
export function describeFit(fit: GeometryFit): string {
  const error = `écart max ${round(fit.maxError)}`;
  switch (fit.kind) {
    case "line":
      return `Droite proposée (${error}) — à valider.`;
    case "circle":
      return `Cercle proposé : centre (${round(fit.circle.centre.x)} ; ${round(fit.circle.centre.y)}), rayon ${round(fit.circle.radius)} (${error}) — à valider.`;
    case "arc":
      return `Arc proposé : rayon ${round(fit.arc.radius)}, ouverture ${round(fit.sweepDeg)}° (${error}) — à valider.`;
    case "ellipse":
      return `Ellipse proposée : demi-axes ${round(fit.ellipse.radiusX)} et ${round(fit.ellipse.radiusY)} (${error}) — plus difficile à tracer à la main qu'un arc.`;
    case "polyline":
      return `Aucune primitive simple sous la tolérance : polyligne conservée (${fit.points.length} points).`;
  }
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/* -------------------------------------------------------------------------- */
/*  §23 — Points de tangence                                                  */
/* -------------------------------------------------------------------------- */

export type TangencyKind = "externe" | "interne" | "aucune";

export type TangencyResult = {
  kind: TangencyKind;
  /** Point de tangence si les deux cercles se raccordent, sinon `null`. */
  point: Point2D | null;
  /** Écart entre la distance des centres et la tangence parfaite, dans l'unité des points. */
  gap: number;
  /** Message affichable — vide si la tangence est franche. */
  notice: string;
};

/**
 * §23 — Point de raccordement tangentiel de deux cercles. C'est ce point que l'artisan
 * repère au cordeau pour enchaîner deux coups de compas sans cassure visible.
 */
export function tangencyBetweenCircles(first: Circle2D, second: Circle2D, tolerance: number): TangencyResult {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error("La tolérance de tangence doit être supérieure à 0.");
  const centreDistance = distance(first.centre, second.centre);
  const externalGap = Math.abs(centreDistance - (first.radius + second.radius));
  const internalGap = Math.abs(centreDistance - Math.abs(first.radius - second.radius));
  const angle = polarAngle(first.centre, second.centre);
  if (externalGap <= tolerance && externalGap <= internalGap) {
    return { kind: "externe", point: pointAtPolar(first.centre, first.radius, angle), gap: externalGap, notice: "" };
  }
  if (internalGap <= tolerance && centreDistance > 1e-9) {
    const direction = first.radius >= second.radius ? angle : angle + Math.PI;
    return { kind: "interne", point: pointAtPolar(first.centre, first.radius, direction), gap: internalGap, notice: "" };
  }
  return {
    kind: "aucune",
    point: null,
    gap: Math.min(externalGap, internalGap),
    notice: `Les deux arcs ne se raccordent pas tangentiellement (écart ${round(Math.min(externalGap, internalGap))}).`,
  };
}

/** §23 — Tangence de deux arcs : le point doit en plus tomber sur les deux arcs. */
export function tangencyBetweenArcs(first: Arc2D, second: Arc2D, tolerance: number): TangencyResult {
  const result = tangencyBetweenCircles(first, second, tolerance);
  if (!result.point) return result;
  const onArc = (arc: Arc2D, point: Point2D) => {
    const angle = polarAngle(arc.centre, point);
    const sweep = normalizeAngle(arc.counterClockwise === false ? arc.startAngle - arc.endAngle : arc.endAngle - arc.startAngle);
    const offset = normalizeAngle(arc.counterClockwise === false ? arc.startAngle - angle : angle - arc.startAngle);
    return offset <= sweep + 1e-6;
  };
  if (onArc(first, result.point) && onArc(second, result.point)) return result;
  return {
    kind: "aucune",
    point: null,
    gap: result.gap,
    notice: "Les cercles porteurs sont tangents, mais le point de tangence est hors des deux arcs tracés.",
  };
}
