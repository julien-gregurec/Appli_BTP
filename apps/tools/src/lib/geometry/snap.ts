/**
 * ATELIER-HITTEST-SNAP-FOUNDATION-V1 §5/§6 — contrat et calcul des points d'accrochage.
 *
 * Fondation seulement : ce lot PRODUIT des candidats, il n'en applique aucun à la géométrie.
 * Rien ici ne déplace un sommet, ne modifie un paramètre ni ne crée de primitive (§11) — le
 * résultat est une suggestion, que seul un futur outil d'édition consommera.
 *
 * Types couverts : points existants du modèle, extrémités, milieux, centres, la grille, et —
 * depuis ATELIER-INTERSECTIONS-MULTISELECT-V1 §2 — les INTERSECTIONS réellement calculées.
 *
 * ## §2/§7 — pourquoi les intersections ne coûtent pas O(n²)
 *
 * Croiser toutes les paires d'entités à chaque mouvement de pointeur serait quadratique, donc
 * intenable sur une scène dense. La parade ne demande pourtant ni cache, ni index spatial, ni
 * heuristique : elle tient dans une remarque de géométrie.
 *
 * Un point d'intersection retenu doit être à moins de `toleranceWorld` de la cible ET appartenir
 * aux DEUX entités qui le produisent. Chacune de ces deux entités passe donc, elle aussi, à
 * moins de `toleranceWorld` de la cible. Il suffit de ne conserver que les entités dont le point
 * le plus proche est dans la tolérance — un balayage linéaire, la même trigonométrie que le
 * hit-test — puis de ne croiser QUE celles-là.
 *
 * Le filtre est EXACT et non approché : aucune paire écartée ne pouvait produire un candidat
 * recevable, donc aucun faux négatif. Le coût devient O(n) + O(k²) où k est le nombre d'entités
 * passant sous le pointeur — un ou deux en pratique, trois ou quatre à un croisement chargé. Pas
 * de cache à invalider : le résultat ne dépend que de la cible et de la scène, ce qui le rend
 * juste par construction quand la géométrie change sous une prévisualisation.
 *
 * `MAX_INTERSECTION_ENTITIES` borne k pour le cas pathologique (des dizaines de traits
 * confondus) : au-delà, mieux vaut renoncer aux intersections que rendre le survol saccadé.
 *
 * Engine B n'est pas touché (§6) : tout se calcule à partir des primitives Engine A publiées par
 * le modèle déjà résolu.
 */

import {
  arcEndpoints,
  arcMidpoint,
  closestPointOnArc,
  closestPointOnCircle,
  closestPointOnSegmentEntity,
  type PlanePoint,
} from "./closest-point";
import type { HitTestScene } from "./hit-test";
import { intersectionsBetween, type Intersectable } from "./intersections";

export type SnapKind = "point" | "endpoint" | "midpoint" | "center" | "intersection" | "grid";

export type SnapCandidate = {
  kind: SnapKind;
  /** Position monde du point d'accrochage, en millimètres. */
  position: PlanePoint;
  /** Distance monde entre la cible et ce point. */
  distance: number;
  /**
   * Entité dont il provient — absent pour la grille, qui n'appartient à aucune entité.
   *
   * Une intersection naît de DEUX entités : le champ y porte leurs identifiants joints par `×`,
   * triés pour rester stable. Ce n'est donc pas l'identifiant d'une entité de la scène, et il ne
   * doit pas être passé à `hitTest` ni à la sélection — il sert à tracer l'origine du candidat.
   */
  entityId?: string;
  /** Libellé lisible, pour un futur affichage d'infobulle. */
  label: string;
  priority: number;
};

/**
 * §5 — ordre de préférence des accrochages, du plus signifiant au plus générique.
 *
 * Un point nommé du modèle passe avant une extrémité anonyme parce qu'il porte le vocabulaire
 * du tracé (c'est lui qu'on retrouve dans la table de report). La grille arrive en dernier :
 * c'est le repli quand aucune géométrie n'est proche, jamais un concurrent d'un point réel.
 */
export const SNAP_PRIORITY: Readonly<Record<SnapKind, number>> = {
  point: 1,
  endpoint: 2,
  midpoint: 3,
  center: 4,
  intersection: 5,
  grid: 6,
};

/** Deux candidats plus proches que ceci l'un de l'autre désignent le même endroit. */
const MERGE_EPSILON = 1e-6;

function candidate(kind: SnapKind, position: PlanePoint, target: PlanePoint, label: string, entityId?: string): SnapCandidate {
  return {
    kind,
    position: { x: position.x, y: position.y },
    distance: Math.hypot(target.x - position.x, target.y - position.y),
    entityId,
    label,
    priority: SNAP_PRIORITY[kind],
  };
}

function middle(a: PlanePoint, b: PlanePoint): PlanePoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * §6 — accrochage sur la grille. Déterministe, exprimé en millimètres, et VOLONTAIREMENT
 * indépendant de l'affichage : on peut vouloir aimanter sans voir la grille, ou la voir sans
 * aimanter. Le pas est un argument, pas une lecture d'un état d'interface.
 */
export function snapToGrid(target: PlanePoint, stepMm: number): PlanePoint {
  if (!Number.isFinite(stepMm) || stepMm <= 0) return { x: target.x, y: target.y };
  return { x: Math.round(target.x / stepMm) * stepMm, y: Math.round(target.y / stepMm) * stepMm };
}

/**
 * Candidats d'accrochage issus de la géométrie de la scène. La grille est ajoutée séparément
 * par `snapCandidates`, parce qu'elle n'a pas de source dans la scène.
 */
export function geometrySnapCandidates(scene: HitTestScene, target: PlanePoint): readonly SnapCandidate[] {
  const found: SnapCandidate[] = [];

  for (const item of scene.points ?? []) {
    found.push(candidate("point", item, target, item.label ?? item.id, item.id));
  }

  const segments = [...(scene.segments ?? []), ...(scene.constructionLines ?? [])];
  for (const item of segments) {
    found.push(candidate("endpoint", item.start, target, `${item.id} — départ`, item.id));
    found.push(candidate("endpoint", item.end, target, `${item.id} — arrivée`, item.id));
    found.push(candidate("midpoint", middle(item.start, item.end), target, `${item.id} — milieu`, item.id));
  }

  for (const item of scene.arcs ?? []) {
    const [start, end] = arcEndpoints(item);
    found.push(candidate("endpoint", start, target, `${item.id} — départ`, item.id));
    found.push(candidate("endpoint", end, target, `${item.id} — arrivée`, item.id));
    // Milieu SUR l'arc, pas milieu de la corde : c'est le point qu'on va chercher au chantier.
    found.push(candidate("midpoint", arcMidpoint(item), target, `${item.id} — milieu`, item.id));
    found.push(candidate("center", item.centre, target, `${item.id} — centre`, item.id));
  }

  for (const item of scene.circles ?? []) found.push(candidate("center", item.centre, target, `${item.id} — centre`, item.id));
  for (const item of scene.ellipses ?? []) found.push(candidate("center", item.centre, target, `${item.id} — centre`, item.id));

  for (const item of scene.polylines ?? []) {
    for (const vertex of item.points) found.push(candidate("endpoint", vertex, target, `${item.id} — sommet`, item.id));
    for (let index = 0; index < item.points.length - 1; index += 1) {
      found.push(candidate("midpoint", middle(item.points[index], item.points[index + 1]), target, `${item.id} — milieu`, item.id));
    }
  }

  for (const item of scene.polygons ?? []) {
    const count = item.points.length;
    for (const vertex of item.points) found.push(candidate("endpoint", vertex, target, `${item.id} — sommet`, item.id));
    // Contour fermé : le côté qui referme la forme a lui aussi un milieu.
    for (let index = 0; index < count && count > 1; index += 1) {
      found.push(candidate("midpoint", middle(item.points[index], item.points[(index + 1) % count]), target, `${item.id} — milieu`, item.id));
    }
  }

  return found;
}

/**
 * §7 — garde-fou de densité. Au-delà de ce nombre d'entités passant simultanément sous la
 * tolérance, on renonce aux intersections plutôt que de payer k² : 12 entités valent 66 paires,
 * ce qui reste imperceptible, tandis qu'un paquet de traits confondus ferait décrocher le survol.
 * Les autres natures d'accrochage (points, extrémités, milieux, centres) continuent d'être
 * proposées — c'est un repli, pas une panne.
 */
export const MAX_INTERSECTION_ENTITIES = 12;

/**
 * Entités croisables passant à moins de `tolerance` de la cible (§7).
 *
 * C'est le filtre exact décrit en tête de fichier. La distance est mesurée avec les mêmes
 * projections que le hit-test — de vraies projections, jamais une boîte englobante — pour que
 * « proche » veuille dire la même chose ici et à la sélection.
 */
function nearbyIntersectables(scene: HitTestScene, target: PlanePoint, tolerance: number): readonly Intersectable[] {
  const near: Intersectable[] = [];

  for (const item of [...(scene.segments ?? []), ...(scene.constructionLines ?? [])]) {
    if (closestPointOnSegmentEntity(target, item).distance <= tolerance) near.push({ kind: "segment", id: item.id, entity: item });
  }
  for (const item of scene.arcs ?? []) {
    if (closestPointOnArc(target, item).distance <= tolerance) near.push({ kind: "arc", id: item.id, entity: item });
  }
  for (const item of scene.circles ?? []) {
    if (closestPointOnCircle(target, item).distance <= tolerance) near.push({ kind: "circle", id: item.id, entity: item });
  }

  return near;
}

/**
 * §2 — candidats d'accrochage aux intersections RÉELLEMENT calculées.
 *
 * Trois conditions, toutes nécessaires : le point est issu d'un calcul d'intersection bornée
 * (pas d'un prolongement imaginaire), il tombe dans la tolérance, et les deux entités qui le
 * produisent sont dans la scène qu'on nous a passée — c'est-à-dire visibles, puisque le filtrage
 * par étape de chantier a déjà eu lieu en amont (`planSceneForStep`). Une intersection avec un
 * trait masqué serait invisible à l'écran et incompréhensible à l'usage.
 *
 * L'identifiant reporté est celui des DEUX entités, joint par `×` : c'est ce qui rend l'infobulle
 * lisible (« axe-h × cercle-1 ») et le candidat traçable jusqu'à sa source. Les deux
 * identifiants sont triés pour que le libellé ne dépende pas de l'ordre de parcours de la scène.
 */
export function intersectionSnapCandidates(
  scene: HitTestScene,
  target: PlanePoint,
  tolerance: number,
): readonly SnapCandidate[] {
  if (!Number.isFinite(tolerance) || tolerance <= 0) return [];

  const near = nearbyIntersectables(scene, target, tolerance);
  if (near.length < 2 || near.length > MAX_INTERSECTION_ENTITIES) return [];

  const found: SnapCandidate[] = [];
  for (let first = 0; first < near.length; first += 1) {
    for (let second = first + 1; second < near.length; second += 1) {
      const a = near[first];
      const b = near[second];
      for (const point of intersectionsBetween(a, b)) {
        if (Math.hypot(target.x - point.x, target.y - point.y) > tolerance) continue;
        const [left, right] = a.id < b.id ? [a.id, b.id] : [b.id, a.id];
        found.push(candidate("intersection", point, target, `${left} × ${right}`, `${left}×${right}`));
      }
    }
  }
  return found;
}

function better(a: SnapCandidate, b: SnapCandidate): boolean {
  if (a.priority !== b.priority) return a.priority < b.priority;
  if (Math.abs(a.distance - b.distance) > MERGE_EPSILON) return a.distance < b.distance;
  return (a.entityId ?? "") < (b.entityId ?? "");
}

/**
 * Fusionne les candidats situés au même endroit en gardant le plus signifiant. Sans cela, un
 * sommet partagé par quatre segments produirait quatre candidats identiques, et un point nommé
 * posé sur une extrémité serait masqué par elle une fois sur deux.
 */
function dedupeByPosition(candidates: readonly SnapCandidate[]): SnapCandidate[] {
  const kept: SnapCandidate[] = [];
  for (const item of candidates) {
    const existing = kept.findIndex(
      (other) => Math.abs(other.position.x - item.position.x) <= MERGE_EPSILON && Math.abs(other.position.y - item.position.y) <= MERGE_EPSILON,
    );
    if (existing === -1) kept.push(item);
    else if (better(item, kept[existing])) kept[existing] = item;
  }
  return kept;
}

export type SnapOptions = {
  /** Rayon d'accrochage en millimètres — converti depuis les pixels par l'appelant. */
  toleranceWorld: number;
  /** Pas de grille en millimètres. Omis ou nul : pas d'accrochage sur la grille. */
  gridStepMm?: number;
  /** Restreindre aux natures voulues (une barre d'outils pourra désactiver les milieux, etc.). */
  kinds?: readonly SnapKind[];
};

/**
 * Meilleur point d'accrochage pour une position monde, ou `null` si rien n'est assez proche.
 * L'accrochage grille n'est proposé que si son point tombe lui aussi dans la tolérance : sinon
 * un dézoom fort ferait sauter le curseur à des dizaines de centimètres de là où on vise.
 */
export function snapCandidates(scene: HitTestScene, target: PlanePoint, options: SnapOptions): readonly SnapCandidate[] {
  const tolerance = Number.isFinite(options.toleranceWorld) && options.toleranceWorld > 0 ? options.toleranceWorld : 0;
  const allowed = options.kinds ? new Set(options.kinds) : null;

  const collected = [...geometrySnapCandidates(scene, target)];
  // Les intersections ne sont calculées que si elles peuvent être retenues : demander une
  // sélection de natures qui les exclut évite tout le balayage (§7).
  if (!allowed || allowed.has("intersection")) collected.push(...intersectionSnapCandidates(scene, target, tolerance));
  if (options.gridStepMm && options.gridStepMm > 0) {
    const position = snapToGrid(target, options.gridStepMm);
    collected.push(candidate("grid", position, target, `Grille ${options.gridStepMm} mm`));
  }

  return dedupeByPosition(collected.filter((item) => (!allowed || allowed.has(item.kind)) && item.distance <= tolerance))
    .sort((first, second) => (better(first, second) ? -1 : better(second, first) ? 1 : 0));
}

export function snap(scene: HitTestScene, target: PlanePoint, options: SnapOptions): SnapCandidate | null {
  return snapCandidates(scene, target, options)[0] ?? null;
}
