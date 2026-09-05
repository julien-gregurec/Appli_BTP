/**
 * ATELIER-HITTEST-SNAP-FOUNDATION-V1 §5/§6 — contrat et calcul des points d'accrochage.
 *
 * Fondation seulement : ce lot PRODUIT des candidats, il n'en applique aucun à la géométrie.
 * Rien ici ne déplace un sommet, ne modifie un paramètre ni ne crée de primitive (§11) — le
 * résultat est une suggestion, que seul un futur outil d'édition consommera.
 *
 * Types couverts dans ce lot : points existants du modèle, extrémités, milieux, centres, et la
 * grille. Les intersections (droite/droite, droite/cercle, cercle/cercle) sont hors lot : elles
 * demandent de décider quelles paires calculer sans faire exploser le coût, ce qui est une
 * question de conception à part entière. Le type `SnapKind` les prévoit déjà pour que les
 * ajouter n'oblige pas à casser le contrat.
 *
 * Engine B n'est pas touché (§6) : tout se calcule à partir des primitives Engine A publiées par
 * le modèle déjà résolu.
 */

import { arcEndpoints, arcMidpoint, type PlanePoint } from "./closest-point";
import type { HitTestScene } from "./hit-test";

export type SnapKind = "point" | "endpoint" | "midpoint" | "center" | "intersection" | "grid";

export type SnapCandidate = {
  kind: SnapKind;
  /** Position monde du point d'accrochage, en millimètres. */
  position: PlanePoint;
  /** Distance monde entre la cible et ce point. */
  distance: number;
  /** Entité dont il provient — absent pour la grille, qui n'appartient à aucune entité. */
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
