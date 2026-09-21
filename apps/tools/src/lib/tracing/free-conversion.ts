/**
 * IMAGE-VECTORIZATION-CANONICAL-RECONCILIATION-V1 §11 — la vectorisation confirmée devient
 * un tracé libre canonique.
 *
 * ## Pourquoi ce module existe, et pourquoi il est court
 *
 * Le lot image produisait sa propre `GeometricShape` : des sommets en millimètres portant une
 * origine de mesure. Le canon, lui, possède déjà la géométrie SOURCE de l'utilisateur —
 * `FreeGeometry` (`free-geometry.ts`) — que l'atelier édite, historise, projette en scène et
 * exporte. Faire vivre les deux côte à côte aurait créé une quatrième vérité géométrique, après
 * Engine B, le tracé libre et les contours bruts.
 *
 * Ce module est donc le seul point de passage : ce qui sort de la photo n'entre dans le projet
 * qu'en tant qu'entité libre, et emprunte ensuite exactement les mêmes rails que ce que
 * l'utilisateur aurait dessiné à la main — édition de sommets (classe C), annulation, scène,
 * cotations, SVG / DXF / PDF / PNG / mosaïque / impression. Aucun export ne connaît la photo.
 *
 * ## Ce que la conversion ne peut pas promettre
 *
 * Le tracé libre n'a que quatre natures : point, segment, polyligne, contour. Il n'a **pas** de
 * cercle, d'arc ni d'ellipse. Un ajustement de cercle ou d'ellipse (`fitting.ts`) reste donc un
 * RÉSULTAT DE MESURE — un centre, un rayon, une erreur — utile à l'artisan et à la fiche
 * chantier, mais sa conversion en tracé libre est une approximation polygonale, dont l'écart
 * est mesuré et annoncé (`sampleFitForFreeGeometry`). Prétendre le contraire ferait croire à un
 * arc là où le document ne contient qu'une suite de cordes.
 *
 * ## Les trois refus
 *
 * 1. Un contour non confirmé n'arrive jamais ici : `contourToGeometricShape` lève avant (§18).
 * 2. Un projet portant un `modelId` refuse le tracé libre — invariant du canon, deux sources de
 *    vérité géométrique ne coexistent pas (`project.ts`, `free-geometry.ts`).
 * 3. Une forme trop dense est refusée avec la conduite à tenir, pas tronquée en silence : le
 *    tracé libre plafonne à 500 sommets par entité, et un contour photo en compte des milliers.
 *    `fitShapeToFreeLimits` simplifie jusqu'à passer sous le plafond et rend l'écart mesuré.
 */

import {
  addFreeEntity,
  createFreeEntity,
  nextFreeEntityId,
  sameFreeVertex,
  EMPTY_FREE_GEOMETRY,
  FREE_COORDINATE_LIMIT_MM,
  MAX_FREE_POLYLINE_VERTICES,
  MIN_FREE_CONTOUR_VERTICES,
  type FreeEntity,
  type FreeEntityKind,
  type FreeGeometry,
  type FreeVertex,
} from "./free-geometry";
import { sampleEllipse, type GeometryFit } from "./fitting";
import { simplifyPolyline, pointAtPolar, type Point2D } from "./geometry-port";
import { maxDeviationBetweenPolylines, type GeometricShape } from "./vectorization";
import { isRealWorldTrusted, type MeasurementOrigin } from "./measurement-origin";

/* -------------------------------------------------------------------------- */
/*  Préparation des sommets                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Retire les sommets qui ne disent rien de neuf : un sommet confondu avec le précédent, et,
 * sur un contour, le sommet final confondu avec le premier — le tracé libre ferme
 * IMPLICITEMENT et refuse un côté de longueur nulle, fermeture comprise.
 *
 * Un contour issu d'un suivi de frontière produit exactement ces deux cas, et sans ce nettoyage
 * la conversion échouerait sur une règle que l'utilisateur n'a pas enfreinte.
 */
export function dedupeVerticesForFreeGeometry(points: readonly Point2D[], closed: boolean): FreeVertex[] {
  const result: FreeVertex[] = [];
  for (const point of points) {
    const vertex = { x: point.x, y: point.y };
    if (result.length && sameFreeVertex(result[result.length - 1], vertex)) continue;
    result.push(vertex);
  }
  while (closed && result.length > 1 && sameFreeVertex(result[0], result[result.length - 1])) result.pop();
  return result;
}

/** Nature libre correspondant à une forme vectorisée. */
export function freeKindForShape(shape: Pick<GeometricShape, "kind" | "closed">): FreeEntityKind {
  return shape.closed || shape.kind === "polygon" ? "polygon" : "polyline";
}

export type FreeConversionRefusal = {
  code: "trop-de-sommets" | "pas-assez-de-sommets" | "hors-limites" | "modele-parametrique";
  message: string;
};

export type FreeConversionCheck = { ok: true } | ({ ok: false } & FreeConversionRefusal);

/**
 * Dit si une forme peut devenir une entité libre, et sinon pourquoi — avec la conduite à tenir.
 * Vérifier avant de convertir permet à l'interface de proposer la simplification au lieu de
 * présenter une erreur sèche.
 */
export function checkShapeForFreeGeometry(shape: GeometricShape): FreeConversionCheck {
  const kind = freeKindForShape(shape);
  const vertices = dedupeVerticesForFreeGeometry(shape.vertices, kind === "polygon");
  const minimum = kind === "polygon" ? MIN_FREE_CONTOUR_VERTICES : 2;
  if (vertices.length < minimum) {
    return {
      ok: false,
      code: "pas-assez-de-sommets",
      message:
        kind === "polygon"
          ? "Ce contour n'a pas trois sommets distincts : il n'enferme aucune surface."
          : "Cette forme n'a pas deux sommets distincts.",
    };
  }
  if (vertices.length > MAX_FREE_POLYLINE_VERTICES) {
    return {
      ok: false,
      code: "trop-de-sommets",
      message: `Relevé trop dense pour le tracé (${vertices.length} sommets, maximum ${MAX_FREE_POLYLINE_VERTICES}). Simplifiez d'abord : l'écart introduit vous sera indiqué.`,
    };
  }
  for (const vertex of vertices) {
    if (Math.abs(vertex.x) > FREE_COORDINATE_LIMIT_MM || Math.abs(vertex.y) > FREE_COORDINATE_LIMIT_MM) {
      return { ok: false, code: "hors-limites", message: "Cette forme sort des limites du tracé (±1 km). Vérifiez la calibration." };
    }
  }
  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/*  Passage sous le plafond de sommets                                        */
/* -------------------------------------------------------------------------- */

export type FreeLimitFit = {
  vertices: FreeVertex[];
  /** Écart maximal mesuré entre le relevé d'origine et la version réduite, en millimètres. */
  maxDeviationMm: number;
  /** Tolérance de simplification retenue, en millimètres. `0` si aucune réduction n'a été nécessaire. */
  toleranceMm: number;
  reduced: boolean;
};

/** Tolérances essayées, en millimètres, de la plus fidèle à la plus grossière. */
const FREE_LIMIT_TOLERANCES_MM: readonly number[] = [0.5, 1, 2, 3, 5, 8, 12, 20, 30, 50, 80, 120, 200];

/**
 * Réduit une forme jusqu'à tenir sous le plafond de sommets du tracé libre, en retenant la
 * tolérance la plus fidèle qui y parvient, et renvoie l'écart RÉELLEMENT mesuré.
 *
 * On n'invente pas de tolérance « qui devrait suffire » : on essaie, on mesure, on rend le
 * chiffre. Si même la plus grossière ne suffit pas, on lève plutôt que de tronquer le relevé.
 */
export function fitShapeToFreeLimits(
  points: readonly Point2D[],
  closed: boolean,
  maxVertices: number = MAX_FREE_POLYLINE_VERTICES,
): FreeLimitFit {
  const direct = dedupeVerticesForFreeGeometry(points, closed);
  if (direct.length <= maxVertices) return { vertices: direct, maxDeviationMm: 0, toleranceMm: 0, reduced: false };
  for (const toleranceMm of FREE_LIMIT_TOLERANCES_MM) {
    const simplified = dedupeVerticesForFreeGeometry(simplifyPolyline(points, toleranceMm), closed);
    if (simplified.length <= maxVertices && simplified.length >= (closed ? MIN_FREE_CONTOUR_VERTICES : 2)) {
      return {
        vertices: simplified,
        maxDeviationMm: maxDeviationBetweenPolylines(points, simplified),
        toleranceMm,
        reduced: true,
      };
    }
  }
  throw new Error("Relevé trop dense pour le tracé libre, même après simplification. Découpez-le en plusieurs tracés.");
}

/* -------------------------------------------------------------------------- */
/*  Conversion                                                                */
/* -------------------------------------------------------------------------- */

export type FreeConversionResult = {
  geometry: FreeGeometry;
  entity: FreeEntity;
  /** Écart introduit par la réduction éventuelle, en millimètres. */
  maxDeviationMm: number;
  /** §35 — la provenance de la mesure ne disparaît pas au passage en tracé libre. */
  origin: MeasurementOrigin;
  /** Mention affichable ; chaîne vide si rien à signaler. */
  notice: string;
};

export type ShapeToFreeOptions = {
  /** Simplifie automatiquement si la forme dépasse le plafond de sommets. Défaut : `false`. */
  simplifyIfNeeded?: boolean;
  /** Identifiant imposé ; sinon la numérotation du tracé libre continue. */
  id?: string;
};

/**
 * §11 — ajoute une géométrie CONFIRMÉE au tracé libre du projet.
 *
 * La confirmation est vérifiée en amont : `contourToGeometricShape` refuse un contour qui n'est
 * pas passé par la validation de l'utilisateur, et c'est la seule fabrique de `GeometricShape`.
 */
export function addShapeToFreeGeometry(
  geometry: FreeGeometry,
  shape: GeometricShape,
  options: ShapeToFreeOptions = {},
): FreeConversionResult {
  const kind = freeKindForShape(shape);
  const closed = kind === "polygon";
  let vertices = dedupeVerticesForFreeGeometry(shape.vertices, closed);
  let maxDeviationMm = 0;
  let reduced = false;

  if (vertices.length > MAX_FREE_POLYLINE_VERTICES) {
    if (!options.simplifyIfNeeded) {
      const refusal = checkShapeForFreeGeometry(shape);
      throw new Error(refusal.ok ? "Relevé trop dense pour le tracé libre." : refusal.message);
    }
    const fitted = fitShapeToFreeLimits(shape.vertices, closed);
    vertices = fitted.vertices;
    maxDeviationMm = fitted.maxDeviationMm;
    reduced = fitted.reduced;
  }

  const id = options.id ?? nextFreeEntityId(geometry, kind);
  const entity = createFreeEntity(kind, vertices, id);
  const notices: string[] = [];
  if (reduced) notices.push(`Relevé réduit pour le tracé : écart maximal ${round(maxDeviationMm)} mm.`);
  if (!isRealWorldTrusted(shape.origin)) notices.push("Cotes indicatives : la provenance de cette forme n'est pas une mesure fiable.");
  return {
    geometry: addFreeEntity(geometry, entity),
    entity,
    maxDeviationMm,
    origin: shape.origin,
    notice: notices.join(" "),
  };
}

/** Tracé libre neuf portant la seule forme confirmée — cas du projet qui démarre d'une photo. */
export function freeGeometryFromShape(shape: GeometricShape, options: ShapeToFreeOptions = {}): FreeConversionResult {
  return addShapeToFreeGeometry(EMPTY_FREE_GEOMETRY, shape, options);
}

/* -------------------------------------------------------------------------- */
/*  §13 — ajustements : le cercle reste une mesure, pas une primitive libre   */
/* -------------------------------------------------------------------------- */

export type SampledFit = {
  points: Point2D[];
  closed: boolean;
  /** Écart maximal, en millimètres, entre la primitive ajustée et son échantillonnage. */
  maxSagittaMm: number;
  notice: string;
};

/**
 * §13 — échantillonne un ajustement en une suite de sommets utilisable comme tracé libre.
 *
 * Décision de réconciliation : un cercle, un arc ou une ellipse issus d'une photo restent des
 * RÉSULTATS DE MESURE (centre, rayon, erreur), affichés et exportés comme tels. Ils ne
 * deviennent pas un modèle Engine B : rien ne garantit qu'un contour photographié soit
 * réellement le modèle paramétrique qu'il évoque, et le promouvoir ferait passer une
 * ressemblance pour une identité. Le document ne reçoit donc que des sommets, avec la flèche
 * maximale annoncée.
 *
 * `toleranceMm` est la flèche visée entre la corde et l'arc ; le nombre de segments en découle.
 */
export function sampleFitForFreeGeometry(fit: GeometryFit, toleranceMm = 1): SampledFit {
  if (!Number.isFinite(toleranceMm) || toleranceMm <= 0) throw new Error("La flèche d'échantillonnage doit être supérieure à 0.");
  switch (fit.kind) {
    case "line":
      return { points: [fit.segment.start, fit.segment.end], closed: false, maxSagittaMm: 0, notice: "" };
    case "polyline":
      return { points: fit.points.map((point) => ({ x: point.x, y: point.y })), closed: false, maxSagittaMm: 0, notice: "" };
    case "circle": {
      const segments = segmentsForSagitta(fit.circle.radius, 2 * Math.PI, toleranceMm);
      const points: Point2D[] = [];
      for (let index = 0; index < segments; index++) {
        points.push(pointAtPolar(fit.circle.centre, fit.circle.radius, (index / segments) * 2 * Math.PI));
      }
      return {
        points,
        closed: true,
        maxSagittaMm: sagittaOf(fit.circle.radius, (2 * Math.PI) / segments),
        notice: `Cercle de rayon ${round(fit.circle.radius)} mm conservé comme mesure ; le tracé en reçoit une approximation polygonale (flèche ≤ ${round(sagittaOf(fit.circle.radius, (2 * Math.PI) / segments))} mm).`,
      };
    }
    case "arc": {
      const sweep = (fit.sweepDeg * Math.PI) / 180;
      const segments = segmentsForSagitta(fit.arc.radius, sweep, toleranceMm);
      const direction = fit.arc.counterClockwise === false ? -1 : 1;
      const points: Point2D[] = [];
      for (let index = 0; index <= segments; index++) {
        points.push(pointAtPolar(fit.arc.centre, fit.arc.radius, fit.arc.startAngle + direction * sweep * (index / segments)));
      }
      return {
        points,
        closed: false,
        maxSagittaMm: sagittaOf(fit.arc.radius, sweep / segments),
        notice: `Arc de rayon ${round(fit.arc.radius)} mm conservé comme mesure ; le tracé en reçoit une approximation polygonale (flèche ≤ ${round(sagittaOf(fit.arc.radius, sweep / segments))} mm).`,
      };
    }
    case "ellipse": {
      const largest = Math.max(fit.ellipse.radiusX, fit.ellipse.radiusY);
      const segments = Math.min(MAX_FREE_POLYLINE_VERTICES - 1, segmentsForSagitta(largest, 2 * Math.PI, toleranceMm));
      const sampled = sampleEllipse(fit.ellipse, segments);
      sampled.pop(); // la fermeture est implicite : le premier sommet n'est jamais répété
      return {
        points: sampled,
        closed: true,
        maxSagittaMm: sagittaOf(largest, (2 * Math.PI) / segments),
        notice: "Ellipse conservée comme mesure ; elle ne se trace pas au compas et le tracé en reçoit une approximation polygonale.",
      };
    }
  }
}

/** Nombre de segments pour que la flèche corde/arc reste sous `toleranceMm`. */
function segmentsForSagitta(radius: number, sweep: number, toleranceMm: number): number {
  if (!Number.isFinite(radius) || radius <= 0) throw new Error("Rayon d'échantillonnage invalide.");
  const ratio = Math.max(-1, Math.min(1, 1 - toleranceMm / radius));
  const maxStep = 2 * Math.acos(ratio);
  const segments = maxStep <= 0 ? MAX_FREE_POLYLINE_VERTICES - 1 : Math.ceil(Math.abs(sweep) / maxStep);
  return Math.max(3, Math.min(MAX_FREE_POLYLINE_VERTICES - 1, segments));
}

function sagittaOf(radius: number, step: number): number {
  return radius * (1 - Math.cos(Math.abs(step) / 2));
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
