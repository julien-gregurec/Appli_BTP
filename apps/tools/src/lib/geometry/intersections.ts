/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §2/§3/§4 — intersections géométriques d'une scène.
 *
 * Module pur : pas de React, pas de DOM, pas de pixel. Il reçoit une scène en coordonnées
 * MONDE et répond « où les entités se croisent-elles réellement ? ».
 *
 * ## Pourquoi ce module ne recalcule aucune trigonométrie
 *
 * `geometry/engine/intersections.ts` (Engine B) résout DÉJÀ segment/segment, segment/cercle,
 * cercle/cercle, arc/segment, arc/cercle et arc/arc, avec les cas tangents, parallèles,
 * colinéaires et concentriques traités explicitement, et il est couvert par ses propres tests.
 * Réécrire ces formules ici créerait exactement la « troisième couche géométrique » que
 * `docs/GEOMETRY_ENGINES_BOUNDARY_V1.md` interdit.
 *
 * Le passage Engine A → Engine B est GRATUIT et documenté (`geometry/adapters/point-compat.ts`
 * et ses preuves de compilation) : un `Segment`/`Circle`/`Arc` d'Engine A, qui porte un `id` en
 * plus, est structurellement un `Segment2D`/`Circle2D`/`Arc2D`. On lit donc Engine B sans le
 * modifier ni le recopier (§18 : Engine B reste intact).
 *
 * Ce fichier n'apporte que ce qu'Engine B ne peut pas savoir : l'IDENTITÉ des entités, le
 * filtrage des primitives dégénérées, la stratégie de balayage (§4) et un ordre déterministe.
 *
 * ## Ce qui n'est jamais renvoyé
 *
 * - aucune coordonnée non finie — chaque point est vérifié avant d'être publié ;
 * - aucun point pour un couple à une INFINITÉ d'intersections (segments colinéaires
 *   superposés, cercles identiques, arcs portés par le même cercle) : Engine B les classe
 *   `coincident`, et un tel couple produit ici zéro candidat. Choisir un point « au milieu »
 *   serait inventer une donnée que la géométrie ne fournit pas (§2) ;
 * - aucune intersection entre une entité et elle-même, sauf entre deux ARÊTES distinctes d'un
 *   même contour — c'est ainsi qu'un pentagramme (`star-5`) publie ses cinq croisements.
 *
 * ## Hors périmètre de ce lot, volontairement
 *
 * Les ellipses ne participent pas : leurs intersections exigent la résolution d'un quartique,
 * qu'Engine B ne publie pas. Les ajouter demanderait d'écrire une nouvelle formule
 * géométrique — donc de franchir la frontière des moteurs pour un gain marginal (deux modèles
 * sur treize). Une ellipse reste sélectionnable et accrochable par son centre, comme avant.
 */

import {
  arcArcIntersection,
  arcCircleIntersection,
  arcSegmentIntersection,
  circleCircleIntersection,
  segmentCircleIntersection,
  segmentSegmentIntersection,
} from "./engine/intersections";
import type { IntersectionResult } from "./engine/types";
import type { PlanePoint } from "./closest-point";
import { arcSweep } from "./closest-point";
import type { Arc, Circle, Polygon, Polyline, Segment } from "./primitives";
import type { HitTestScene } from "./hit-test";

/** Nature d'une entité capable de croiser une autre. Les ellipses en sont absentes (voir en-tête). */
export type IntersectableKind = "segment" | "circle" | "arc";

export type GeometryIntersectionType = "crossing" | "tangent";

/**
 * §3 — une intersection réellement calculée entre deux entités identifiées.
 *
 * `entityAId`/`entityBId` sont les identifiants MÉTIER (ceux de la scène, donc ceux que le
 * hit-test et la sélection manipulent). `entityAKey`/`entityBKey` descendent au niveau de
 * l'arête pour les contours et polylignes (`contour#3`), ce qui permet de distinguer deux
 * arêtes d'un même contour sans inventer un second identifiant métier.
 */
export type GeometryIntersection = {
  /** Position monde du croisement, en millimètres. Toujours finie. */
  position: PlanePoint;
  entityAId: string;
  entityBId: string;
  entityAKind: IntersectableKind;
  entityBKind: IntersectableKind;
  entityAKey: string;
  entityBKey: string;
  type: GeometryIntersectionType;
  /** Raccourci lisible : `type === "tangent"`. Les deux entités s'y touchent sans se traverser. */
  tangent: boolean;
  /** Signature stable du couple, `A|B` avec A ≤ B. Sert au tri et au dédoublonnage. */
  pairKey: string;
};

export type IntersectionBounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Entité indexée : sa géométrie, son identité, et sa boîte englobante pré-calculée (§4). */
export type IndexedIntersectable = {
  key: string;
  entityId: string;
  kind: IntersectableKind;
  bounds: IntersectionBounds;
  segment?: { start: PlanePoint; end: PlanePoint };
  circle?: { centre: PlanePoint; radius: number };
  arc?: Arc;
};

export type IntersectionIndex = {
  entities: readonly IndexedIntersectable[];
};

/**
 * Taille minimale d'une primitive pour être prise en compte, en millimètres.
 *
 * Ce n'est pas un réglage esthétique : `segmentCircleIntersection` (Engine B) LÈVE sur une
 * direction dont la norme au carré passe sous `DEFAULT_EPSILON` (1e-9), soit une longueur de
 * 3,2·10⁻⁵ mm. Le seuil retenu est un ordre de grandeur au-dessus, donc l'exception est
 * structurellement impossible ; il reste dix mille fois plus fin que le dixième de millimètre
 * affiché par le report, donc aucune entité réelle n'est écartée.
 */
export const MIN_INTERSECTABLE_SIZE = 1e-4;

/** Deux intersections plus proches que ceci l'une de l'autre désignent le même endroit. */
const MERGE_EPSILON = 1e-6;

/**
 * Garde-fou de balayage exhaustif (§4). `sceneIntersections` est quadratique par nature ; au
 * delà de ce nombre de couples elle s'arrête plutôt que de bloquer la trame. Le survol et
 * l'accrochage n'y passent jamais — ils utilisent `intersectionsNear`, borné au voisinage du
 * pointeur.
 */
export const MAX_INTERSECTION_PAIRS = 20000;

function finitePoint(value: PlanePoint | undefined): boolean {
  return Boolean(value) && Number.isFinite(value!.x) && Number.isFinite(value!.y);
}

function boundsOf(points: readonly PlanePoint[]): IntersectionBounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const item of points) {
    if (item.x < minX) minX = item.x;
    if (item.y < minY) minY = item.y;
    if (item.x > maxX) maxX = item.x;
    if (item.y > maxY) maxY = item.y;
  }
  return { minX, minY, maxX, maxY };
}

function positiveModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

/**
 * Boîte englobante EXACTE d'un arc — endpoints plus les extrema cardinaux réellement balayés.
 *
 * Prendre la boîte du cercle porteur serait correct mais grossier : un arc de 15° d'un cercle
 * de 2 m occuperait une boîte de 4 m, et le filtrage large (§4) ne filtrerait plus rien sur
 * les modèles à arcs (`arch-full-round`, `ogive`, `double-s`, `heart`).
 */
export function arcBounds(arc: Arc): IntersectionBounds {
  const { centre, radius } = arc;
  const sweep = arcSweep(arc);
  const points: PlanePoint[] = [
    { x: centre.x + radius * Math.cos(arc.startAngle), y: centre.y + radius * Math.sin(arc.startAngle) },
    { x: centre.x + radius * Math.cos(arc.startAngle + sweep), y: centre.y + radius * Math.sin(arc.startAngle + sweep) },
  ];
  const span = Math.abs(sweep);
  for (let quarter = 0; quarter < 4; quarter += 1) {
    const angle = (quarter * Math.PI) / 2;
    const travelled = sweep >= 0
      ? positiveModulo(angle - arc.startAngle, Math.PI * 2)
      : positiveModulo(arc.startAngle - angle, Math.PI * 2);
    if (travelled <= span + 1e-12) {
      points.push({ x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) });
    }
  }
  return boundsOf(points);
}

function usableSegment(start: PlanePoint, end: PlanePoint): boolean {
  if (!finitePoint(start) || !finitePoint(end)) return false;
  return Math.hypot(end.x - start.x, end.y - start.y) >= MIN_INTERSECTABLE_SIZE;
}

function usableRadius(centre: PlanePoint, radius: number): boolean {
  return finitePoint(centre) && Number.isFinite(radius) && radius >= MIN_INTERSECTABLE_SIZE;
}

function pushSegment(into: IndexedIntersectable[], key: string, entityId: string, start: PlanePoint, end: PlanePoint) {
  if (!usableSegment(start, end)) return;
  into.push({
    key,
    entityId,
    kind: "segment",
    bounds: boundsOf([start, end]),
    segment: { start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y } },
  });
}

/**
 * Arêtes d'une suite de sommets. Un contour (`closed`) referme la dernière arête sur la
 * première — c'est ce qui donne au pentagramme de `star-5` ses croisements réels.
 */
function pushPath(into: IndexedIntersectable[], item: Polyline | Polygon, closed: boolean) {
  const count = item.points.length;
  if (count < 2) return;
  const last = closed ? count : count - 1;
  for (let index = 0; index < last; index += 1) {
    pushSegment(into, `${item.id}#${index}`, item.id, item.points[index], item.points[(index + 1) % count]);
  }
}

/**
 * §4 — index de scène : inventaire des entités croisables, chacune avec sa boîte englobante.
 *
 * Construit UNE fois par scène (voir `intersectionIndexOf`), pas à chaque mouvement de
 * pointeur : c'est la moitié du budget de performance. L'ordre de collecte est fixe, donc
 * l'index d'une même scène est toujours identique.
 */
export function buildIntersectionIndex(scene: HitTestScene): IntersectionIndex {
  const entities: IndexedIntersectable[] = [];

  for (const item of (scene.segments ?? []) as readonly Segment[]) pushSegment(entities, item.id, item.id, item.start, item.end);
  for (const item of (scene.constructionLines ?? []) as readonly Segment[]) pushSegment(entities, item.id, item.id, item.start, item.end);
  for (const item of (scene.polylines ?? []) as readonly Polyline[]) pushPath(entities, item, false);
  for (const item of (scene.polygons ?? []) as readonly Polygon[]) pushPath(entities, item, true);

  for (const item of (scene.circles ?? []) as readonly Circle[]) {
    if (!usableRadius(item.centre, item.radius)) continue;
    entities.push({
      key: item.id,
      entityId: item.id,
      kind: "circle",
      bounds: {
        minX: item.centre.x - item.radius,
        minY: item.centre.y - item.radius,
        maxX: item.centre.x + item.radius,
        maxY: item.centre.y + item.radius,
      },
      circle: { centre: { x: item.centre.x, y: item.centre.y }, radius: item.radius },
    });
  }

  for (const item of (scene.arcs ?? []) as readonly Arc[]) {
    if (!usableRadius(item.centre, item.radius)) continue;
    if (!Number.isFinite(item.startAngle) || !Number.isFinite(item.endAngle)) continue;
    entities.push({ key: item.id, entityId: item.id, kind: "arc", bounds: arcBounds(item), arc: item });
  }

  return { entities };
}

/**
 * Index mémorisé par RÉFÉRENCE de scène. Le viewport reconstruit une scène à chaque changement
 * de paramètre mais la conserve d'une trame de survol à l'autre : mémoriser sur la référence
 * suffit donc à ne payer l'inventaire qu'une fois par géométrie, sans clé à inventer ni cache à
 * invalider. `WeakMap` laisse le ramasse-miettes libérer l'entrée avec la scène.
 */
const INDEX_CACHE = new WeakMap<object, IntersectionIndex>();

export function intersectionIndexOf(scene: HitTestScene): IntersectionIndex {
  const cached = INDEX_CACHE.get(scene as object);
  if (cached) return cached;
  const built = buildIntersectionIndex(scene);
  INDEX_CACHE.set(scene as object, built);
  return built;
}

function boundsOverlap(a: IntersectionBounds, b: IntersectionBounds, margin: number): boolean {
  return (
    a.minX - margin <= b.maxX && b.minX - margin <= a.maxX && a.minY - margin <= b.maxY && b.minY - margin <= a.maxY
  );
}

function boundsContain(bounds: IntersectionBounds, target: PlanePoint, margin: number): boolean {
  return (
    target.x >= bounds.minX - margin &&
    target.x <= bounds.maxX + margin &&
    target.y >= bounds.minY - margin &&
    target.y <= bounds.maxY + margin
  );
}

/**
 * Tolérance RELATIVE du test de tangence, rapportée au plus grand rayon en jeu. Une tolérance
 * absolue serait trop lâche sur un cercle de 5 mm et trop stricte sur un arc de 3 m.
 */
const TANGENCY_EPSILON = 1e-7;

/** Cercle porteur d'une entité circulaire — un arc a le même que son cercle. */
function carrier(entity: IndexedIntersectable): { centre: PlanePoint; radius: number } | null {
  if (entity.circle) return entity.circle;
  if (entity.arc) return { centre: entity.arc.centre, radius: entity.arc.radius };
  return null;
}

/**
 * Le couple est-il tangent — les deux entités se touchent-elles sans se traverser ?
 *
 * Engine B répond `tangent` pour cercle/cercle et segment/cercle, mais sa fonction `classify`
 * ramène le résultat à `one` dès qu'un arc filtre le second point : le drapeau se perd alors
 * pour arc/arc, arc/cercle et arc/segment. Plutôt que de modifier Engine B (§18), on le
 * reconstitue ici — c'est une CLASSIFICATION à partir des cercles porteurs (comparaisons de
 * distances), pas un nouveau calcul d'intersection.
 *
 * N'est consultée que lorsque Engine B a rendu un point unique : elle ne contredit jamais un
 * résultat sécant.
 */
function tangentCarriers(a: IndexedIntersectable, b: IndexedIntersectable): boolean {
  const first = carrier(a);
  const second = carrier(b);

  if (first && second) {
    const d = Math.hypot(second.centre.x - first.centre.x, second.centre.y - first.centre.y);
    const tolerance = TANGENCY_EPSILON * Math.max(1, first.radius, second.radius);
    if (d <= tolerance) return false;
    return (
      Math.abs(d - (first.radius + second.radius)) <= tolerance ||
      Math.abs(d - Math.abs(first.radius - second.radius)) <= tolerance
    );
  }

  const disc = first ?? second;
  const line = first ? b.segment : a.segment;
  if (!disc || !line) return false;

  // Distance du centre à la DROITE portant le segment : la tangence est une propriété de la
  // droite, pas de la portion tracée.
  const dx = line.end.x - line.start.x;
  const dy = line.end.y - line.start.y;
  const length = Math.hypot(dx, dy);
  if (length < MIN_INTERSECTABLE_SIZE) return false;
  const cross = Math.abs(dx * (disc.centre.y - line.start.y) - dy * (disc.centre.x - line.start.x));
  const tolerance = TANGENCY_EPSILON * Math.max(1, disc.radius);
  return Math.abs(cross / length - disc.radius) <= tolerance;
}

/** Appel Engine B correspondant au couple, ou `null` si le couple n'est pas résoluble. */
function resolvePair(a: IndexedIntersectable, b: IndexedIntersectable): IntersectionResult | null {
  if (a.segment && b.segment) return segmentSegmentIntersection(a.segment, b.segment);
  if (a.segment && b.circle) return segmentCircleIntersection(a.segment, b.circle);
  if (a.circle && b.segment) return segmentCircleIntersection(b.segment, a.circle);
  if (a.circle && b.circle) return circleCircleIntersection(a.circle, b.circle);
  if (a.arc && b.segment) return arcSegmentIntersection(a.arc, b.segment);
  if (a.segment && b.arc) return arcSegmentIntersection(b.arc, a.segment);
  if (a.arc && b.circle) return arcCircleIntersection(a.arc, b.circle);
  if (a.circle && b.arc) return arcCircleIntersection(b.arc, a.circle);
  if (a.arc && b.arc) return arcArcIntersection(a.arc, b.arc);
  return null;
}

/**
 * Intersections d'un couple d'entités indexées. Jamais d'exception : les primitives
 * dégénérées ont été écartées à l'indexation, et les couples à infinité de solutions
 * (`coincident`) rendent une liste vide.
 */
export function pairIntersections(a: IndexedIntersectable, b: IndexedIntersectable): readonly GeometryIntersection[] {
  if (a.key === b.key) return [];
  const [first, second] = a.key <= b.key ? [a, b] : [b, a];
  const result = resolvePair(first, second);
  if (!result || result.kind === "none" || result.kind === "coincident") return [];

  const tangent = result.kind === "tangent" || (result.points.length === 1 && tangentCarriers(first, second));
  const type: GeometryIntersectionType = tangent ? "tangent" : "crossing";
  const pairKey = `${first.key}|${second.key}`;
  const found: GeometryIntersection[] = [];
  for (const point of result.points) {
    if (!finitePoint(point)) continue;
    if (found.some((kept) => Math.abs(kept.position.x - point.x) <= MERGE_EPSILON && Math.abs(kept.position.y - point.y) <= MERGE_EPSILON)) {
      continue;
    }
    found.push({
      position: { x: point.x, y: point.y },
      entityAId: first.entityId,
      entityBId: second.entityId,
      entityAKind: first.kind,
      entityBKind: second.kind,
      entityAKey: first.key,
      entityBKey: second.key,
      type,
      tangent: type === "tangent",
      pairKey,
    });
  }
  return found;
}

/**
 * Ordre déterministe : couple, puis position. Sans lui, deux exécutions sur la même scène
 * pourraient proposer un accrochage différent selon l'ordre de publication du générateur.
 */
function compareIntersections(a: GeometryIntersection, b: GeometryIntersection): number {
  if (a.pairKey !== b.pairKey) return a.pairKey < b.pairKey ? -1 : 1;
  if (Math.abs(a.position.x - b.position.x) > MERGE_EPSILON) return a.position.x - b.position.x;
  if (Math.abs(a.position.y - b.position.y) > MERGE_EPSILON) return a.position.y - b.position.y;
  return 0;
}

/**
 * §4 — TOUTES les intersections de la scène. Balayage quadratique filtré par boîtes
 * englobantes, borné par `MAX_INTERSECTION_PAIRS`.
 *
 * Réservé aux usages hors trame (tests, mesure, futur calque « points remarquables »). Le
 * survol et l'accrochage passent par `intersectionsNear`.
 */
export function sceneIntersections(scene: HitTestScene): readonly GeometryIntersection[] {
  const { entities } = intersectionIndexOf(scene);
  const found: GeometryIntersection[] = [];
  let pairs = 0;
  for (let i = 0; i < entities.length; i += 1) {
    for (let j = i + 1; j < entities.length; j += 1) {
      if (pairs >= MAX_INTERSECTION_PAIRS) return found.sort(compareIntersections);
      pairs += 1;
      if (!boundsOverlap(entities[i].bounds, entities[j].bounds, MERGE_EPSILON)) continue;
      found.push(...pairIntersections(entities[i], entities[j]));
    }
  }
  return found.sort(compareIntersections);
}

/**
 * §4 — intersections situées dans un rayon donné autour d'un point monde.
 *
 * C'est la fonction que consomme l'accrochage, et c'est elle qui tient l'exigence de
 * performance. Deux filtres avant tout calcul :
 *
 * 1. seules les entités dont la boîte englobante, dilatée du rayon, contient la cible sont
 *    retenues. Sur une scène de 53 entités, un pointeur en désigne typiquement moins de six ;
 * 2. parmi ces candidates, un couple dont les boîtes ne se recouvrent pas est écarté sans
 *    trigonométrie.
 *
 * Le coût est donc gouverné par la DENSITÉ LOCALE sous le pointeur, pas par la taille de la
 * scène — ce qui est la seule façon d'échapper au O(n²) par pixel.
 */
export function intersectionsNear(
  scene: HitTestScene,
  target: PlanePoint,
  radiusWorld: number,
): readonly GeometryIntersection[] {
  const radius = Number.isFinite(radiusWorld) && radiusWorld > 0 ? radiusWorld : 0;
  if (radius <= 0 || !finitePoint(target)) return [];

  const { entities } = intersectionIndexOf(scene);
  const near = entities.filter((entity) => boundsContain(entity.bounds, target, radius));
  if (near.length < 2) return [];

  const found: GeometryIntersection[] = [];
  for (let i = 0; i < near.length; i += 1) {
    for (let j = i + 1; j < near.length; j += 1) {
      if (!boundsOverlap(near[i].bounds, near[j].bounds, radius)) continue;
      for (const item of pairIntersections(near[i], near[j])) {
        if (Math.hypot(item.position.x - target.x, item.position.y - target.y) <= radius) found.push(item);
      }
    }
  }
  return found.sort(compareIntersections);
}
