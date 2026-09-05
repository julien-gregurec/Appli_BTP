/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §1 — intersections géométriques BORNÉES.
 *
 * Module pur : pas de React, pas de DOM, pas de pixel, pas de scène. Il répond à une seule
 * question, par paire de primitives : « où ces deux tracés se croisent-ils réellement ? ».
 *
 * ## Pourquoi un module de plus alors que `primitives.ts` en contient déjà
 *
 * Engine A publie `lineIntersection`, `lineCircleIntersections` et `circleCircleIntersections`.
 * Ce ne sont PAS les mêmes fonctions : elles raisonnent sur des supports INFINIS (la droite qui
 * porte le segment, le cercle entier) et servent au calcul de construction, où l'on veut le
 * point même s'il tombe hors du trait dessiné. Ici on veut l'inverse — l'accrochage ne doit
 * proposer que des points qu'on VOIT : un croisement situé au-delà de l'extrémité d'un segment,
 * ou hors du secteur balayé par un arc, n'existe pas pour l'utilisateur et l'aimanterait dans le
 * vide. D'où des bornes explicites, ici et pas là-bas.
 *
 * La seconde différence est le traitement des cas limites. `primitives.ts` compare des
 * discriminants à un `EPSILON` absolu, ce qui dépend de l'échelle du dessin (un discriminant est
 * homogène à une longueur⁴). Ce module ne compare que des LONGUEURS à une tolérance en
 * millimètres : la tangence se décide sur « la distance du centre à la droite vaut-elle le
 * rayon ? », jamais sur un discriminant. Le verdict reste le même à 10 mm et à 10 000 mm.
 *
 * ## Contrat
 *
 * Chaque fonction renvoie 0, 1 ou 2 points, jamais davantage, et ne lève JAMAIS : une primitive
 * dégénérée (segment nul, rayon nul, coordonnée non finie) donne un tableau vide. Ces calculs
 * tournent sur un mouvement de pointeur, ils ne peuvent pas faire tomber le rendu.
 *
 * Un recouvrement (segments colinéaires superposés, cercles confondus) renvoie lui aussi un
 * tableau vide : l'intersection y est un ensemble continu, donc aucun point particulier ne
 * mérite d'être proposé comme cible d'accrochage. Renvoyer une extrémité arbitraire ferait
 * sauter le curseur à un endroit que rien ne distingue à l'écran.
 *
 * Aucune modification de géométrie (§9) : les primitives sont lues, jamais écrites.
 */

import { arcContainsAngle, type PlanePoint } from "./closest-point";
import type { Arc, Circle, Line, Segment } from "./primitives";

/**
 * Tolérance par défaut, en millimètres.
 *
 * Elle sert UNIQUEMENT à décider des cas limites (tangence, parallélisme, dégénérescence), pas
 * à filtrer les résultats. Un micron est très en dessous de toute précision de chantier, donc
 * invisible métier ; il reste très au-dessus du bruit du calcul en double précision sur des
 * coordonnées de l'ordre du mètre. Deux constructions faites pour être tangentes le sont donc
 * reconnues, sans qu'un vrai croisement serré soit écrasé en tangence.
 */
export const INTERSECTION_TOLERANCE_MM = 1e-6;

/** Sous ce seuil, une longueur est nulle et la primitive est dégénérée. */
const DEGENERATE = 1e-12;

function finite(...values: number[]): boolean {
  return values.every(Number.isFinite);
}

function tolerant(tolerance: number | undefined): number {
  return Number.isFinite(tolerance) && (tolerance as number) > 0 ? (tolerance as number) : INTERSECTION_TOLERANCE_MM;
}

function usableCircle(circle: Pick<Circle, "centre" | "radius">): boolean {
  return finite(circle.centre.x, circle.centre.y, circle.radius) && circle.radius > DEGENERATE;
}

/**
 * Le point appartient-il au segment ? Testé sur le PARAMÈTRE de la droite porteuse, pas par une
 * comparaison de coordonnées : sur un segment presque vertical, comparer les `x` déciderait à
 * partir d'une différence numériquement insignifiante.
 *
 * La tolérance est convertie en tolérance de paramètre (`tolerance / longueur`) pour qu'un point
 * posé exactement sur une extrémité soit accepté malgré l'arrondi.
 */
function withinSegment(point: PlanePoint, segment: Pick<Segment, "start" | "end">, tolerance: number): boolean {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < DEGENERATE) return false;
  const t = ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared;
  const slack = tolerance / Math.sqrt(lengthSquared);
  return t >= -slack && t <= 1 + slack;
}

/** L'angle du point vu du centre tombe-t-il dans la portion réellement balayée par l'arc ? */
function withinArc(point: PlanePoint, arc: Arc): boolean {
  return arcContainsAngle(arc, Math.atan2(point.y - arc.centre.y, point.x - arc.centre.x));
}

// ---------------------------------------------------------------------------
// Segment / segment
// ---------------------------------------------------------------------------

/**
 * Croisement de deux segments BORNÉS — 0 ou 1 point.
 *
 * Le test de parallélisme porte sur le sinus de l'angle entre les deux directions
 * (`|cross| / (|r|·|s|)`), pas sur le produit vectoriel brut : ce dernier grandit avec la
 * longueur des segments, si bien qu'un même angle serait jugé parallèle sur un petit dessin et
 * sécant sur un grand. Normalisé, le seuil redevient une propriété de l'angle seul.
 *
 * Colinéaires et superposés : tableau vide (cf. contrat du module — l'intersection est un
 * segment, pas un point).
 */
export function segmentSegmentIntersections(
  first: Pick<Segment, "start" | "end">,
  second: Pick<Segment, "start" | "end">,
  tolerance = INTERSECTION_TOLERANCE_MM,
): readonly PlanePoint[] {
  const tol = tolerant(tolerance);
  const px = first.start.x;
  const py = first.start.y;
  const rx = first.end.x - px;
  const ry = first.end.y - py;
  const qx = second.start.x;
  const qy = second.start.y;
  const sx = second.end.x - qx;
  const sy = second.end.y - qy;

  if (!finite(px, py, rx, ry, qx, qy, sx, sy)) return [];

  const lengthFirst = Math.hypot(rx, ry);
  const lengthSecond = Math.hypot(sx, sy);
  // Segment dégénéré : un point n'a pas de direction, donc pas de croisement au sens de ce
  // module. C'est `hitTest` qui traite un point posé sur un trait, pas une intersection.
  if (lengthFirst < DEGENERATE || lengthSecond < DEGENERATE) return [];

  const cross = rx * sy - ry * sx;
  // Sinus de l'angle entre les supports : sans dimension, donc comparable à un seuil fixe.
  if (Math.abs(cross) / (lengthFirst * lengthSecond) < tol) return [];

  const t = ((qx - px) * sy - (qy - py) * sx) / cross;
  const u = ((qx - px) * ry - (qy - py) * rx) / cross;

  // Marge exprimée dans le paramètre de CHAQUE segment : la même tolérance métrique ne vaut pas
  // la même fraction sur un segment de 50 mm et sur un segment de 5 000 mm.
  const slackFirst = tol / lengthFirst;
  const slackSecond = tol / lengthSecond;
  if (t < -slackFirst || t > 1 + slackFirst) return [];
  if (u < -slackSecond || u > 1 + slackSecond) return [];

  return [{ x: px + t * rx, y: py + t * ry }];
}

/**
 * Croisement d'une droite INFINIE et d'un segment borné — 0 ou 1 point.
 *
 * `Line` est une primitive déclarée par Engine A mais qu'aucune scène ne publie aujourd'hui :
 * cette fonction complète donc la famille sans être branchée sur l'accrochage. Elle existe
 * parce qu'un axe de construction non borné est la première chose que réclamera le tracé libre,
 * et qu'il vaut mieux qu'elle arrive testée le jour où une scène en publiera.
 */
export function lineSegmentIntersections(
  line: Pick<Line, "point" | "direction">,
  segment: Pick<Segment, "start" | "end">,
  tolerance = INTERSECTION_TOLERANCE_MM,
): readonly PlanePoint[] {
  const tol = tolerant(tolerance);
  const px = line.point.x;
  const py = line.point.y;
  const rx = line.direction.x;
  const ry = line.direction.y;
  const qx = segment.start.x;
  const qy = segment.start.y;
  const sx = segment.end.x - qx;
  const sy = segment.end.y - qy;

  if (!finite(px, py, rx, ry, qx, qy, sx, sy)) return [];

  const lengthLine = Math.hypot(rx, ry);
  const lengthSegment = Math.hypot(sx, sy);
  if (lengthLine < DEGENERATE || lengthSegment < DEGENERATE) return [];

  const cross = rx * sy - ry * sx;
  if (Math.abs(cross) / (lengthLine * lengthSegment) < tol) return [];

  // Seul `u` est borné : la droite, elle, n'a pas d'extrémité à respecter.
  const u = ((qx - px) * ry - (qy - py) * rx) / cross;
  const slack = tol / lengthSegment;
  if (u < -slack || u > 1 + slack) return [];

  return [{ x: qx + u * sx, y: qy + u * sy }];
}

// ---------------------------------------------------------------------------
// Segment / cercle
// ---------------------------------------------------------------------------

/**
 * Points d'un CERCLE ENTIER traversés par la droite portant `segment`, sans borner le segment.
 * Brique interne partagée par les variantes segment/cercle, segment/arc et leurs dérivées.
 *
 * Le calcul passe par le pied de la perpendiculaire plutôt que par un discriminant : la décision
 * de tangence devient « la distance centre–droite vaut-elle le rayon, à `tolerance` près ? »,
 * c'est-à-dire une comparaison de longueurs, homogène et lisible. Un discriminant, homogène à
 * une longueur⁴, imposerait un seuil différent selon la taille de l'ouvrage.
 */
function circleLinePoints(
  origin: PlanePoint,
  dx: number,
  dy: number,
  circle: Pick<Circle, "centre" | "radius">,
  tolerance: number,
): readonly PlanePoint[] {
  const length = Math.hypot(dx, dy);
  if (length < DEGENERATE || !usableCircle(circle)) return [];

  const ux = dx / length;
  const uy = dy / length;
  // Abscisse du pied de la perpendiculaire, mesurée depuis `origin` le long de la direction.
  const foot = (circle.centre.x - origin.x) * ux + (circle.centre.y - origin.y) * uy;
  const footX = origin.x + foot * ux;
  const footY = origin.y + foot * uy;
  const gap = Math.hypot(circle.centre.x - footX, circle.centre.y - footY);

  if (gap > circle.radius + tolerance) return [];
  // Tangence : une seule solution, exactement au pied de la perpendiculaire. La renvoyer en
  // double ferait croire à deux cibles distinctes séparées d'un bruit de calcul.
  if (Math.abs(gap - circle.radius) <= tolerance) return [{ x: footX, y: footY }];

  const half = Math.sqrt(Math.max(0, circle.radius * circle.radius - gap * gap));
  return [
    { x: footX - half * ux, y: footY - half * uy },
    { x: footX + half * ux, y: footY + half * uy },
  ];
}

/** Croisements d'un segment BORNÉ et d'un cercle entier — 0, 1 (tangence ou corde sortante) ou 2. */
export function segmentCircleIntersections(
  segment: Pick<Segment, "start" | "end">,
  circle: Pick<Circle, "centre" | "radius">,
  tolerance = INTERSECTION_TOLERANCE_MM,
): readonly PlanePoint[] {
  const tol = tolerant(tolerance);
  if (!finite(segment.start.x, segment.start.y, segment.end.x, segment.end.y)) return [];
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  return circleLinePoints(segment.start, dx, dy, circle, tol).filter((point) => withinSegment(point, segment, tol));
}

/** Croisements d'un segment borné et d'un ARC — mêmes solutions, restreintes au secteur balayé. */
export function segmentArcIntersections(
  segment: Pick<Segment, "start" | "end">,
  arc: Arc,
  tolerance = INTERSECTION_TOLERANCE_MM,
): readonly PlanePoint[] {
  return segmentCircleIntersections(segment, arc, tolerance).filter((point) => withinArc(point, arc));
}

// ---------------------------------------------------------------------------
// Cercle / cercle
// ---------------------------------------------------------------------------

/**
 * Croisements de deux cercles entiers — 0, 1 (tangence interne ou externe) ou 2.
 *
 * Les quatre cas limites sont traités explicitement et dans cet ordre, parce qu'ils se
 * chevauchent numériquement quand les rayons sont proches :
 *
 * 1. **cercles confondus** (mêmes centre et rayon) : intersection continue → aucun point ;
 * 2. **concentriques de rayons différents** : jamais de croisement ;
 * 3. **tangence externe** (`d ≈ r₁ + r₂`) et **tangence interne** (`d ≈ |r₁ − r₂|`) : un point ;
 * 4. **disjoints ou emboîtés** : aucun point.
 *
 * Sans le cas 1, deux cercles identiques passeraient par la formule générale avec `h² = 0` et
 * produiraient un point arbitraire sur la ligne des centres — un accrochage qui ne correspond à
 * rien de visible.
 */
export function circleCircleIntersections(
  first: Pick<Circle, "centre" | "radius">,
  second: Pick<Circle, "centre" | "radius">,
  tolerance = INTERSECTION_TOLERANCE_MM,
): readonly PlanePoint[] {
  const tol = tolerant(tolerance);
  if (!usableCircle(first) || !usableCircle(second)) return [];

  const dx = second.centre.x - first.centre.x;
  const dy = second.centre.y - first.centre.y;
  const d = Math.hypot(dx, dy);
  const sum = first.radius + second.radius;
  const gapRadii = Math.abs(first.radius - second.radius);

  // Concentriques : confondus (intersection continue) ou strictement sans contact. Dans les
  // deux cas il n'y a aucun point à proposer.
  if (d <= tol) return [];
  if (d > sum + tol) return [];
  if (d < gapRadii - tol) return [];

  // Tangence : le point de contact est sur la ligne des centres, à `r₁` du premier centre.
  if (Math.abs(d - sum) <= tol || Math.abs(d - gapRadii) <= tol) {
    const ratio = first.radius / d;
    return [{ x: first.centre.x + dx * ratio, y: first.centre.y + dy * ratio }];
  }

  // Cas général : `a` est la distance du premier centre à l'axe radical, `h` la demi-corde.
  const a = (first.radius * first.radius - second.radius * second.radius + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, first.radius * first.radius - a * a));
  const baseX = first.centre.x + (a * dx) / d;
  const baseY = first.centre.y + (a * dy) / d;
  const offsetX = (-dy * h) / d;
  const offsetY = (dx * h) / d;

  return [
    { x: baseX + offsetX, y: baseY + offsetY },
    { x: baseX - offsetX, y: baseY - offsetY },
  ];
}

/** Croisements d'un arc et d'un cercle entier — solutions cercle/cercle restreintes au secteur. */
export function arcCircleIntersections(
  arc: Arc,
  circle: Pick<Circle, "centre" | "radius">,
  tolerance = INTERSECTION_TOLERANCE_MM,
): readonly PlanePoint[] {
  return circleCircleIntersections(arc, circle, tolerance).filter((point) => withinArc(point, arc));
}

/** Croisements de deux arcs — solutions cercle/cercle restreintes aux DEUX secteurs balayés. */
export function arcArcIntersections(first: Arc, second: Arc, tolerance = INTERSECTION_TOLERANCE_MM): readonly PlanePoint[] {
  return circleCircleIntersections(first, second, tolerance).filter(
    (point) => withinArc(point, first) && withinArc(point, second),
  );
}

// ---------------------------------------------------------------------------
// Aiguillage générique
// ---------------------------------------------------------------------------

/**
 * Entité que ce module sait croiser. Les polylignes et contours n'y figurent pas : les
 * décomposer en arêtes multiplierait les paires sans que l'accrochage y gagne dans ce lot.
 * Le jour où ce sera utile, l'aiguillage ci-dessous est le seul point à étendre.
 */
export type Intersectable =
  | { kind: "segment"; id: string; entity: Segment }
  | { kind: "arc"; id: string; entity: Arc }
  | { kind: "circle"; id: string; entity: Circle };

/**
 * Croisements de deux entités quelconques, quel que soit l'ordre des arguments.
 *
 * Deux entités de même identifiant renvoient un tableau vide : une entité ne se croise pas
 * elle-même, et l'appelant qui parcourt des paires n'a donc pas à s'en prémunir.
 */
export function intersectionsBetween(
  first: Intersectable,
  second: Intersectable,
  tolerance = INTERSECTION_TOLERANCE_MM,
): readonly PlanePoint[] {
  if (first.id === second.id) return [];

  if (first.kind === "segment") {
    if (second.kind === "segment") return segmentSegmentIntersections(first.entity, second.entity, tolerance);
    if (second.kind === "circle") return segmentCircleIntersections(first.entity, second.entity, tolerance);
    return segmentArcIntersections(first.entity, second.entity, tolerance);
  }

  if (first.kind === "circle") {
    if (second.kind === "segment") return segmentCircleIntersections(second.entity, first.entity, tolerance);
    if (second.kind === "circle") return circleCircleIntersections(first.entity, second.entity, tolerance);
    return arcCircleIntersections(second.entity, first.entity, tolerance);
  }

  if (second.kind === "segment") return segmentArcIntersections(second.entity, first.entity, tolerance);
  if (second.kind === "circle") return arcCircleIntersections(first.entity, second.entity, tolerance);
  return arcArcIntersections(first.entity, second.entity, tolerance);
}
