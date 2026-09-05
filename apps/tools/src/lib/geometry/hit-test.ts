/**
 * ATELIER-HITTEST-SNAP-FOUNDATION-V1 §1/§3 — hit-testing géométrique d'une scène.
 *
 * Module pur : pas de React, pas de DOM, pas de pixel. Il reçoit un point MONDE et une
 * tolérance MONDE, et répond quelle entité l'utilisateur a désignée. La conversion de la
 * tolérance écran en tolérance monde appartient à l'appelant (`lib/viewport/hit-test-view.ts`),
 * parce qu'elle dépend du zoom et que ce module ne doit rien savoir du zoom.
 *
 * Toute la trigonométrie est déléguée à `closest-point.ts` : ici on ne fait qu'inventorier,
 * filtrer par tolérance et départager.
 *
 * Aucune modification de géométrie (§11) : la scène est lue, jamais écrite.
 */

import {
  closestPointOnArc,
  closestPointOnCircle,
  closestPointOnEllipse,
  closestPointOnPolygon,
  closestPointOnPolyline,
  closestPointOnSegmentEntity,
  type ClosestPoint,
  type PlanePoint,
} from "./closest-point";
import type { Arc, Circle, Ellipse, Point, Polygon, Polyline, Segment } from "./primitives";

/**
 * Nature d'une entité désignable. `ShapeGeometry` et `PlanScene` satisfont tous deux
 * `HitTestScene` structurellement — aucun adaptateur n'est nécessaire, comme pour le viewport.
 */
export type HitEntityKind = "segment" | "arc" | "circle" | "ellipse" | "polyline" | "polygon" | "point";

export type HitTestScene = {
  points?: readonly Point[];
  segments?: readonly Segment[];
  constructionLines?: readonly Segment[];
  arcs?: readonly Arc[];
  circles?: readonly Circle[];
  ellipses?: readonly Ellipse[];
  polylines?: readonly Polyline[];
  polygons?: readonly Polygon[];
};

export type HitTestResult = {
  entityId: string;
  entityKind: HitEntityKind;
  /** Distance monde entre le point testé et l'entité, en millimètres. */
  distance: number;
  /** Point de l'entité le plus proche — sert au feedback visuel et au snap. */
  closestPoint: PlanePoint;
  /** Rang de priorité retenu (1 = le plus prioritaire). */
  priority: number;
  /** Rôle métier porté par l'entité (`shape`, `construction`, `axis`, `center`…), s'il existe. */
  role?: string;
  /** Libellé du modèle quand l'entité en porte un (points nommés du report). */
  label?: string;
};

/**
 * §3 — priorité déterministe, du plus précis au plus étendu.
 *
 * L'ordre traduit une intention : dans le disque de tolérance, on désigne la cible la plus
 * PETITE, celle qu'il serait autrement le plus difficile d'atteindre. Un point mesure quelques
 * pixels, un contour traverse tout l'écran ; sans cette hiérarchie, le contour capterait tous
 * les clics des points posés dessus, et ces points deviendraient inatteignables.
 *
 * La priorité ne s'applique qu'ENTRE candidats déjà dans la tolérance. Une entité hors
 * tolérance n'est jamais retenue, si prioritaire soit-elle : sinon un point lointain volerait
 * la sélection d'un segment sous le curseur.
 */
export const HIT_PRIORITY: Readonly<Record<HitEntityKind, number>> = {
  point: 1,
  segment: 2,
  arc: 2,
  circle: 3,
  ellipse: 3,
  polyline: 4,
  polygon: 4,
};

/** Deux distances séparées de moins de ceci sont tenues pour égales lors du départage. */
const TIE_EPSILON = 1e-6;

/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §3/§4 — quantification des distances avant comparaison.
 *
 * Un comparateur « |a − b| < ε ⇒ égaux » N'EST PAS TRANSITIF : avec ε = 1, 0 et 0,6 sont égaux,
 * 0,6 et 1,2 aussi, mais 0 et 1,2 non. `Array.prototype.sort` suppose une relation d'ordre
 * total ; nourri d'un comparateur intransitif, il rend un résultat qui dépend de l'ordre
 * d'entrée et de l'algorithme du moteur. Tant que seule la TÊTE du classement était consommée
 * cela restait invisible ; le cycle de sélection (§4) parcourt toute la liste et exige, lui, un
 * ordre reproductible d'un clic à l'autre.
 *
 * Arrondir la distance sur une grille de pas ε rétablit la transitivité : deux distances tombent
 * dans le même godet ou non, sans cas intermédiaire. Le départage par identifiant reprend
 * ensuite la main, et il est total puisque les identifiants sont uniques.
 */
function distanceRank(distance: number): number {
  return Math.round(distance / TIE_EPSILON);
}

type Candidate = HitTestResult;

function push(into: Candidate[], kind: HitEntityKind, id: string, hit: ClosestPoint | null, role?: string, label?: string) {
  if (!hit) return;
  into.push({
    entityId: id,
    entityKind: kind,
    distance: hit.distance,
    closestPoint: hit.point,
    priority: HIT_PRIORITY[kind],
    role,
    label,
  });
}

/**
 * Tous les candidats de la scène, avec leur distance réelle — sans filtre de tolérance.
 * Exposé parce que le feedback visuel et les tests en ont besoin, et pour que le filtrage
 * reste une décision de l'appelant plutôt qu'une règle enfouie.
 */
export function hitTestCandidates(scene: HitTestScene, target: PlanePoint): readonly HitTestResult[] {
  const candidates: Candidate[] = [];

  for (const item of scene.points ?? []) {
    const dx = target.x - item.x;
    const dy = target.y - item.y;
    push(candidates, "point", item.id, { point: { x: item.x, y: item.y }, distance: Math.hypot(dx, dy) }, item.role, item.label);
  }
  for (const item of scene.segments ?? []) push(candidates, "segment", item.id, closestPointOnSegmentEntity(target, item), item.role);
  for (const item of scene.constructionLines ?? []) {
    push(candidates, "segment", item.id, closestPointOnSegmentEntity(target, item), item.role ?? "construction");
  }
  for (const item of scene.arcs ?? []) push(candidates, "arc", item.id, closestPointOnArc(target, item), item.role);
  for (const item of scene.circles ?? []) push(candidates, "circle", item.id, closestPointOnCircle(target, item), item.role);
  for (const item of scene.ellipses ?? []) push(candidates, "ellipse", item.id, closestPointOnEllipse(target, item), item.role);
  for (const item of scene.polylines ?? []) push(candidates, "polyline", item.id, closestPointOnPolyline(target, item), item.role);
  for (const item of scene.polygons ?? []) push(candidates, "polygon", item.id, closestPointOnPolygon(target, item), item.role);

  return candidates;
}

/**
 * Départage deux candidats : priorité d'abord, puis distance, puis identifiant.
 *
 * Le dernier critère n'est pas cosmétique : sans lui, deux entités superposées (les deux
 * diagonales d'un carré en leur croisement, par exemple) seraient départagées par l'ordre du
 * tableau, donc par l'ordre de publication du générateur. Le même clic pourrait alors désigner
 * une entité différente d'un modèle à l'autre. §3 : « ne pas dépendre de l'ordre du tableau ».
 */
function better(candidate: HitTestResult, current: HitTestResult): boolean {
  if (candidate.priority !== current.priority) return candidate.priority < current.priority;
  const rank = distanceRank(candidate.distance);
  const currentRank = distanceRank(current.distance);
  if (rank !== currentRank) return rank < currentRank;
  return candidate.entityId < current.entityId;
}

/**
 * Entité désignée par un clic, ou `null` si rien n'est assez proche.
 *
 * `toleranceWorld` est un rayon en millimètres : tout ce qui est au-delà est ignoré.
 */
export function hitTest(scene: HitTestScene, target: PlanePoint, toleranceWorld: number): HitTestResult | null {
  const tolerance = Number.isFinite(toleranceWorld) && toleranceWorld > 0 ? toleranceWorld : 0;
  let best: HitTestResult | null = null;
  for (const candidate of hitTestCandidates(scene, target)) {
    if (candidate.distance > tolerance) continue;
    if (!best || better(candidate, best)) best = candidate;
  }
  return best;
}

/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §3 — TOUS les candidats dans la tolérance, du plus
 * pertinent au moins pertinent.
 *
 * L'ordre est exactement celui de `hitTest`, dont le résultat est donc toujours le premier
 * élément de cette liste : une seule règle de priorité dans l'application, pas deux classements
 * qui pourraient diverger. Le cycle de sélection (§4) consomme la suite.
 *
 * L'ordre est TOTAL et DÉTERMINISTE (cf. `distanceRank`) : à scène et point identiques, la même
 * liste sort dans le même ordre, quelle que soit la façon dont la scène a été construite. C'est
 * la condition pour que re-cliquer au même endroit désigne toujours l'entité suivante, et pour
 * que le cycle revienne exactement à son point de départ après un tour complet.
 */
export function hitTestAll(scene: HitTestScene, target: PlanePoint, toleranceWorld: number): readonly HitTestResult[] {
  const tolerance = Number.isFinite(toleranceWorld) && toleranceWorld > 0 ? toleranceWorld : 0;
  return hitTestCandidates(scene, target)
    .filter((candidate) => candidate.distance <= tolerance)
    .slice()
    .sort((first, second) => (better(first, second) ? -1 : better(second, first) ? 1 : 0));
}
