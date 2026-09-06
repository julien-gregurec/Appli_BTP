/**
 * §26 à §29 — Symétries, répétition radiale, centre et axes.
 *
 * Cas d'usage réel : l'artisan ne vectorise qu'un pétale ou une moitié de motif, et ELSATIA
 * reconstruit le reste. C'est plus rapide ET plus juste qu'un relevé point par point, parce
 * que la régularité vient de la géométrie et non de la main.
 *
 * §28 : un centre automatique est toujours une **proposition** corrigeable, jamais imposé.
 */

import { fitCircle } from "./fitting";
import {
  applyTransform,
  applyTransformToPoints,
  boundsCentre,
  boundsFromPoints,
  distance,
  mirrorAxis,
  mirrorHorizontal,
  mirrorVertical,
  rotationAround,
  type Point2D,
  type Transform2D,
} from "./geometry-port";

export type SymmetryAxis = "verticale" | "horizontale" | "personnalisee";

export type SymmetrySpec =
  | { kind: "verticale"; axisX: number }
  | { kind: "horizontale"; axisY: number }
  | { kind: "personnalisee"; through: Point2D; direction: Point2D };

export function symmetryTransform(spec: SymmetrySpec): Transform2D {
  if (spec.kind === "verticale") return mirrorVertical(spec.axisX);
  if (spec.kind === "horizontale") return mirrorHorizontal(spec.axisY);
  if (Math.hypot(spec.direction.x, spec.direction.y) < 1e-9) throw new Error("L'axe de symétrie doit avoir une direction non nulle.");
  return mirrorAxis(spec.through, spec.direction);
}

/** Image miroir des points par rapport à l'axe demandé. */
export function mirrorPoints(points: readonly Point2D[], spec: SymmetrySpec): Point2D[] {
  return applyTransformToPoints(symmetryTransform(spec), points);
}

/**
 * §26 — Complète une demi-figure par son miroir. Les points sont parcourus à l'envers pour
 * que la moitié ajoutée referme le contour dans le bon sens. Les sommets déjà posés sur
 * l'axe (à `weldTolerance` près) ne sont pas dupliqués.
 *
 * La demi-figure doit commencer et se terminer **sur l'axe** — c'est ce qui rend le
 * recollement franc. Une moitié qui s'arrête ailleurs produit un contour ouvert, ce qui est
 * conservé tel quel plutôt que refermé arbitrairement.
 */
export function completeBySymmetry(points: readonly Point2D[], spec: SymmetrySpec, weldTolerance = 1e-6): Point2D[] {
  if (points.length < 2) throw new Error("La symétrie exige au moins deux points.");
  if (!Number.isFinite(weldTolerance) || weldTolerance < 0) throw new Error("La tolérance de recollement doit être positive.");
  const mirrored = mirrorPoints(points, spec).reverse();
  const result = points.map((point) => ({ x: point.x, y: point.y }));
  for (const point of mirrored) {
    const previous = result[result.length - 1];
    if (distance(previous, point) <= weldTolerance) continue;
    result.push(point);
  }
  if (result.length > 2 && distance(result[0], result[result.length - 1]) <= weldTolerance) result.pop();
  return result;
}

/**
 * §26 — Score de symétrie **mesuré** : écart maximal entre chaque point et le point miroir
 * le plus proche du même nuage. Un motif parfaitement symétrique donne 0. Aucun pourcentage
 * de confiance n'est inventé (§36).
 */
export function symmetryDeviation(points: readonly Point2D[], spec: SymmetrySpec): { maxDeviation: number; meanDeviation: number } {
  if (points.length < 2) throw new Error("La mesure de symétrie exige au moins deux points.");
  const mirrored = mirrorPoints(points, spec);
  let maxDeviation = 0;
  let total = 0;
  for (const candidate of mirrored) {
    let nearest = Infinity;
    for (const point of points) {
      const value = distance(candidate, point);
      if (value < nearest) nearest = value;
    }
    total += nearest;
    if (nearest > maxDeviation) maxDeviation = nearest;
  }
  return { maxDeviation, meanDeviation: total / mirrored.length };
}

/**
 * §26 — Cherche l'axe vertical de symétrie le plus probable autour du centre de l'enveloppe,
 * par balayage. Renvoie l'axe **et** son écart mesuré : à l'utilisateur de trancher.
 */
export function findVerticalSymmetryAxis(points: readonly Point2D[], searchRadius?: number, steps = 40): { axisX: number; maxDeviation: number } {
  if (points.length < 2) throw new Error("La recherche de symétrie exige au moins deux points.");
  if (!Number.isInteger(steps) || steps < 2) throw new Error("Le nombre de pas de recherche doit être un entier ≥ 2.");
  const bounds = boundsFromPoints(points);
  const centre = boundsCentre(bounds);
  const radius = searchRadius ?? (bounds.maxX - bounds.minX) / 10;
  let best = { axisX: centre.x, maxDeviation: Infinity };
  for (let index = 0; index <= steps; index++) {
    const axisX = centre.x - radius + (2 * radius * index) / steps;
    const { maxDeviation } = symmetryDeviation(points, { kind: "verticale", axisX });
    if (maxDeviation < best.maxDeviation) best = { axisX, maxDeviation };
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/*  §27 — Répétition radiale                                                  */
/* -------------------------------------------------------------------------- */

export type RadialRepeatInput = {
  /** Motif de base : un pétale, une branche, un ajour. */
  points: readonly Point2D[];
  centre: Point2D;
  /** Nombre total d'exemplaires, motif d'origine compris. */
  count: number;
  /** Décalage angulaire du premier exemplaire, en degrés. */
  startAngleDeg?: number;
};

/**
 * §27 — Répète un motif autour d'un centre (rosace, fleur, hélice). Le pas angulaire est
 * exact : `360 / count`. Chaque exemplaire est une copie transformée, pas un relevé.
 */
export function repeatRadially(input: RadialRepeatInput): Point2D[][] {
  if (input.points.length < 2) throw new Error("La répétition radiale exige un motif d'au moins deux points.");
  if (!Number.isInteger(input.count) || input.count < 1 || input.count > 360) {
    throw new Error("Le nombre d'éléments doit être un entier entre 1 et 360.");
  }
  if (!Number.isFinite(input.centre.x) || !Number.isFinite(input.centre.y)) throw new Error("Le centre de répétition est invalide.");
  const startAngle = ((input.startAngleDeg ?? 0) * Math.PI) / 180;
  const step = (2 * Math.PI) / input.count;
  const copies: Point2D[][] = [];
  for (let index = 0; index < input.count; index++) {
    const transform = rotationAround(input.centre, startAngle + step * index);
    copies.push(applyTransformToPoints(transform, input.points));
  }
  return copies;
}

/* -------------------------------------------------------------------------- */
/*  §28 — Centre                                                              */
/* -------------------------------------------------------------------------- */

export type CentreProposalMethod = "cercle-ajuste" | "enveloppe" | "manuel";

export type CentreProposal = {
  centre: Point2D;
  method: CentreProposalMethod;
  /** Rayon moyen et écart mesuré au rayon — vides pour un centre d'enveloppe. */
  radius?: number;
  radiusDeviation?: number;
  /** §28 — un centre proposé reste corrigeable. */
  editable: true;
  notice: string;
};

/**
 * §28 — Propose un centre pour un motif circulaire : d'abord par ajustement de cercle
 * (le plus juste sur une rosace), à défaut par le centre de l'enveloppe. Jamais imposé.
 */
export function proposeCentre(points: readonly Point2D[]): CentreProposal {
  if (points.length < 3) {
    const centre = boundsCentre(boundsFromPoints(points));
    return { centre, method: "enveloppe", editable: true, notice: "Centre proposé d'après l'encombrement — à corriger si nécessaire." };
  }
  try {
    const fit = fitCircle(points);
    return {
      centre: fit.circle.centre,
      method: "cercle-ajuste",
      radius: fit.circle.radius,
      radiusDeviation: fit.maxError,
      editable: true,
      notice: "Centre proposé par ajustement de cercle — à corriger si nécessaire.",
    };
  } catch {
    const centre = boundsCentre(boundsFromPoints(points));
    return { centre, method: "enveloppe", editable: true, notice: "Centre proposé d'après l'encombrement — à corriger si nécessaire." };
  }
}

/** Centre saisi par l'utilisateur : prioritaire sur toute proposition automatique (§28). */
export function manualCentre(centre: Point2D): CentreProposal {
  if (!Number.isFinite(centre.x) || !Number.isFinite(centre.y)) throw new Error("Le centre saisi est invalide.");
  return { centre: { x: centre.x, y: centre.y }, method: "manuel", editable: true, notice: "" };
}

/* -------------------------------------------------------------------------- */
/*  §29 — Axes                                                                */
/* -------------------------------------------------------------------------- */

export type TracingAxis = {
  id: string;
  kind: SymmetryAxis;
  origin: Point2D;
  /** Vecteur directeur unitaire. */
  direction: Point2D;
};

export function createAxis(id: string, kind: SymmetryAxis, origin: Point2D, directionDeg = 0): TracingAxis {
  if (!id.trim()) throw new Error("Un axe doit porter un identifiant.");
  if (!Number.isFinite(origin.x) || !Number.isFinite(origin.y)) throw new Error("L'origine de l'axe est invalide.");
  const angle =
    kind === "horizontale" ? 0 : kind === "verticale" ? Math.PI / 2 : (directionDeg * Math.PI) / 180;
  return { id, kind, origin: { x: origin.x, y: origin.y }, direction: { x: Math.cos(angle), y: Math.sin(angle) } };
}

/** Projette un point sur l'axe (aide au tracé et au report chantier). */
export function projectOnAxis(axis: TracingAxis, point: Point2D): Point2D {
  const dx = point.x - axis.origin.x;
  const dy = point.y - axis.origin.y;
  const along = dx * axis.direction.x + dy * axis.direction.y;
  return { x: axis.origin.x + axis.direction.x * along, y: axis.origin.y + axis.direction.y * along };
}

/** Symétrie définie par un axe posé par l'utilisateur (§29). */
export function symmetryFromAxis(axis: TracingAxis): SymmetrySpec {
  return { kind: "personnalisee", through: axis.origin, direction: axis.direction };
}

/** Point transformé par une matrice — réexport pratique pour la couche interface. */
export function transformPoint(transform: Transform2D, point: Point2D): Point2D {
  return applyTransform(transform, point);
}
