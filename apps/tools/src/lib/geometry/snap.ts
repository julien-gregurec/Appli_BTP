/**
 * ATELIER-HITTEST-SNAP-FOUNDATION-V1 §5/§6 — contrat et calcul des points d'accrochage.
 *
 * Fondation seulement : ce lot PRODUIT des candidats, il n'en applique aucun à la géométrie.
 * Rien ici ne déplace un sommet, ne modifie un paramètre ni ne crée de primitive (§11) — le
 * résultat est une suggestion, que seul un futur outil d'édition consommera.
 *
 * Types couverts : points existants du modèle, extrémités, milieux, centres, et la grille.
 *
 * ## ATELIER-INTERSECTIONS-MULTISELECT-V1 §5 — les intersections rejoignent le moteur
 *
 * Le `SnapKind` « intersection » était déjà déclaré ; il est désormais alimenté par
 * `geometry/intersections.ts`. Une seule règle de conception le sépare des autres natures :
 *
 *   les intersections ne sont JAMAIS calculées sans tolérance.
 *
 * Toutes les autres natures s'énumèrent en O(n) — un centre par cercle, deux extrémités par
 * segment — et `geometrySnapCandidates` peut donc les produire toutes, puis filtrer. Les
 * intersections sont quadratiques : les produire toutes pour n'en garder qu'une reviendrait à
 * balayer la scène entière à chaque mouvement de pointeur. Elles sont donc calculées dans
 * `snapCandidates`, seul endroit qui connaisse le rayon, via `intersectionsNear` qui borne le
 * travail au voisinage du pointeur. `geometrySnapCandidates` garde exactement son
 * comportement d'avant ce lot — ses appelants ne changent pas.
 *
 * Engine B n'est pas touché (§6) : tout se calcule à partir des primitives Engine A publiées par
 * le modèle déjà résolu ; les formules d'intersection sont LUES dans Engine B, jamais modifiées.
 */

import { arcEndpoints, arcMidpoint, type PlanePoint } from "./closest-point";
import type { HitTestScene } from "./hit-test";
import { intersectionsNear, type GeometryIntersection } from "./intersections";

export type SnapKind = "point" | "endpoint" | "midpoint" | "center" | "intersection" | "grid";

export type SnapCandidate = {
  kind: SnapKind;
  /** Position monde du point d'accrochage, en millimètres. */
  position: PlanePoint;
  /** Distance monde entre la cible et ce point. */
  distance: number;
  /**
   * Entité dont il provient — absent pour la grille, qui n'appartient à aucune entité. Pour
   * une intersection, c'est la PREMIÈRE des deux entités dans l'ordre déterministe du couple :
   * le champ garde ainsi le même sens qu'avant ce lot pour tous ses lecteurs.
   */
  entityId?: string;
  /**
   * Toutes les entités à l'origine du candidat (§5). Une intersection en a deux, tout le reste
   * en a une (ou zéro pour la grille). Additif : `entityId` reste la voie d'accès simple.
   */
  entityIds?: readonly string[];
  /** Vrai quand les deux entités se touchent sans se traverser. Faux ailleurs. */
  tangent?: boolean;
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
  // Deux intersections différentes partagent leur première entité : le libellé, qui nomme le
  // COUPLE, est alors le seul discriminant stable. Sans lui, l'ordre retomberait sur celui du
  // tableau, donc sur l'ordre de publication du générateur (§6).
  if ((a.entityId ?? "") !== (b.entityId ?? "")) return (a.entityId ?? "") < (b.entityId ?? "");
  return a.label < b.label;
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

/**
 * Libellé d'une intersection. Nomme le COUPLE, jamais une entité seule : c'est ce qui rend le
 * candidat identifiable dans une infobulle et discriminable dans le tri.
 */
function intersectionLabel(item: GeometryIntersection): string {
  const nature = item.tangent ? "tangence" : "intersection";
  return item.entityAId === item.entityBId
    ? `${item.entityAId} — ${nature}`
    : `${item.entityAId} × ${item.entityBId} — ${nature}`;
}

/**
 * §5 — candidats d'accrochage aux intersections, bornés au voisinage du pointeur.
 *
 * Contrairement aux autres natures, celle-ci EXIGE une tolérance : voir l'en-tête du module.
 * Exposée pour que les tests et un futur calque « points remarquables » puissent l'appeler
 * sans repasser par le tri complet.
 */
export function intersectionSnapCandidates(
  scene: HitTestScene,
  target: PlanePoint,
  toleranceWorld: number,
): readonly SnapCandidate[] {
  return intersectionsNear(scene, target, toleranceWorld).map((item) => ({
    ...candidate("intersection", item.position, target, intersectionLabel(item), item.entityAId),
    entityIds: item.entityAId === item.entityBId ? [item.entityAId] : [item.entityAId, item.entityBId],
    tangent: item.tangent,
  }));
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

  // Calculées ici et nulle part ailleurs : c'est le seul endroit qui connaisse le rayon, donc
  // le seul où le coût quadratique puisse être borné (§4/§5). Écartée d'emblée si l'appelant a
  // désactivé cette nature — on ne paie alors rien du tout.
  if (tolerance > 0 && (!allowed || allowed.has("intersection"))) {
    collected.push(...intersectionSnapCandidates(scene, target, tolerance));
  }

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
