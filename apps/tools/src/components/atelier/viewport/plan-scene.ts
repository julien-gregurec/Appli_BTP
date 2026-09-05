/**
 * Scène de plan affichée par le viewport Atelier (§8).
 *
 * Le viewport reçoit une géométrie DÉJÀ RÉSOLUE en props : il n'appelle jamais le moteur
 * géométrique et ne connaît aucun `modelId`. `PlanScene` est volontairement un sur-ensemble
 * structurel minimal — un `ShapeGeometry` résolu par Engine B satisfait ce type tel quel, donc
 * le branchement futur ne demandera pas d'adaptateur.
 *
 * Ce module est pur (aucun React, aucun DOM) pour rester testable côté Node.
 */

import type { Arc, BoundingBox, Circle, Ellipse, Point, Polygon, Polyline, Segment } from "../../../lib/geometry/primitives";
import { arcSweep } from "../../../lib/geometry/closest-point";

export type PlanScene = {
  id: string;
  name: string;
  bounds: BoundingBox;
  points?: readonly Point[];
  segments?: readonly Segment[];
  /**
   * Traits de construction du modèle (ATELIER-RESOLVED-MODEL-VIEWPORT-INTEGRATION-V1 §3).
   * Champ distinct plutôt que des segments marqués `role: "construction"` : un `TraceModel`
   * les publie déjà séparément (`ShapeGeometry.constructionLines`), donc le brancher ainsi
   * reste une simple lecture — aucune recopie, aucune fusion de listes en amont.
   */
  constructionLines?: readonly Segment[];
  arcs?: readonly Arc[];
  circles?: readonly Circle[];
  ellipses?: readonly Ellipse[];
  polylines?: readonly Polyline[];
  polygons?: readonly Polygon[];
};

export type SceneEntityKind = "segment" | "arc" | "circle" | "ellipse" | "polyline" | "polygon" | "point";

export type SceneEntitySummary = {
  id: string;
  kind: SceneEntityKind;
  label: string;
  /** Rôle métier porté par l'entité (`shape`, `construction`, `axis`, `center`…), quand il existe. */
  role?: string;
};

export type PropertyRow = { label: string; value: string };

export type SceneEntityDetails = SceneEntitySummary & {
  rows: readonly PropertyRow[];
};

const KIND_LABELS: Record<SceneEntityKind, string> = {
  segment: "Segment",
  arc: "Arc",
  circle: "Cercle",
  ellipse: "Ellipse",
  polyline: "Polyligne",
  polygon: "Contour",
  point: "Point",
};

export function entityKindLabel(kind: SceneEntityKind): string {
  return KIND_LABELS[kind];
}

/**
 * Libellé lisible d'une entité. Les identifiants métier portent déjà souvent leur nature
 * (« contour », « spot-1 ») : préfixer aveuglément donnerait « Contour contour ». On ne préfixe
 * donc que si l'identifiant ne dit pas déjà de quoi il s'agit.
 */
export function entityLabel(kind: SceneEntityKind, id: string): string {
  const nature = KIND_LABELS[kind].toLowerCase();
  if (!id.toLowerCase().includes(nature)) return `${KIND_LABELS[kind]} ${id}`;
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function millimetres(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  return `${rounded.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} mm`;
}

function degrees(radians: number): string {
  if (!Number.isFinite(radians)) return "—";
  const value = ((radians * 180) / Math.PI) % 360;
  return `${(Math.round(value * 10) / 10).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}°`;
}

function coordinates(source: { x: number; y: number }): string {
  return `X ${millimetres(source.x)} · Y ${millimetres(source.y)}`;
}

/**
 * Segments de la scène, traits de construction compris. Les traits de construction d'un
 * `TraceModel` n'ont pas toujours de `role` explicite — leur nature vient du champ qui les
 * porte, on la restitue donc ici plutôt que de la présumer côté rendu.
 */
function sceneSegments(scene: PlanScene): readonly { item: Segment; role: string | undefined }[] {
  return [
    ...(scene.segments ?? []).map((item) => ({ item, role: item.role })),
    ...(scene.constructionLines ?? []).map((item) => ({ item, role: item.role ?? "construction" })),
  ];
}

/**
 * Inventaire ordonné des entités sélectionnables de la scène. L'ordre est stable (contours,
 * segments, arcs, cercles, ellipses, polylignes, points) pour que la liste de la fixture et le
 * futur hit-testing désignent les mêmes objets.
 */
export function listSceneEntities(scene: PlanScene): readonly SceneEntitySummary[] {
  const entities: SceneEntitySummary[] = [];
  const push = (kind: SceneEntityKind, id: string, label: string | undefined, role?: string) => {
    entities.push({ id, kind, label: label ?? entityLabel(kind, id), role });
  };

  for (const item of scene.polygons ?? []) push("polygon", item.id, undefined, item.role);
  for (const { item, role } of sceneSegments(scene)) push("segment", item.id, undefined, role);
  for (const item of scene.arcs ?? []) push("arc", item.id, undefined, item.role);
  for (const item of scene.circles ?? []) push("circle", item.id, undefined, item.role);
  for (const item of scene.ellipses ?? []) push("ellipse", item.id, undefined, item.role);
  for (const item of scene.polylines ?? []) push("polyline", item.id, undefined, item.role);
  for (const item of scene.points ?? []) push("point", item.id, item.label, item.role);

  return entities;
}

/** Fiche « propriétés » d'une entité — lecture seule dans ce lot (§10 : aucune édition géométrique). */
export function describeSceneEntity(scene: PlanScene, entityId: string | null): SceneEntityDetails | null {
  if (!entityId) return null;

  for (const { item, role } of sceneSegments(scene)) {
    if (item.id !== entityId) continue;
    const length = Math.hypot(item.end.x - item.start.x, item.end.y - item.start.y);
    return {
      id: item.id,
      kind: "segment",
      label: entityLabel("segment", item.id),
      role,
      rows: [
        { label: "Départ", value: coordinates(item.start) },
        { label: "Arrivée", value: coordinates(item.end) },
        { label: "Longueur", value: millimetres(length) },
        { label: "Angle", value: degrees(Math.atan2(item.end.y - item.start.y, item.end.x - item.start.x)) },
      ],
    };
  }

  for (const item of scene.arcs ?? []) {
    if (item.id !== entityId) continue;
    let sweep = item.endAngle - item.startAngle;
    if (item.counterClockwise === false && sweep > 0) sweep -= Math.PI * 2;
    if (item.counterClockwise !== false && sweep < 0) sweep += Math.PI * 2;
    return {
      id: item.id,
      kind: "arc",
      label: entityLabel("arc", item.id),
      role: item.role,
      rows: [
        { label: "Centre", value: coordinates(item.centre) },
        { label: "Rayon", value: millimetres(item.radius) },
        { label: "Angle balayé", value: degrees(Math.abs(sweep)) },
        { label: "Développé", value: millimetres(Math.abs(sweep) * item.radius) },
      ],
    };
  }

  for (const item of scene.circles ?? []) {
    if (item.id !== entityId) continue;
    return {
      id: item.id,
      kind: "circle",
      label: entityLabel("circle", item.id),
      role: item.role,
      rows: [
        { label: "Centre", value: coordinates(item.centre) },
        { label: "Rayon", value: millimetres(item.radius) },
        { label: "Diamètre", value: millimetres(item.radius * 2) },
        { label: "Périmètre", value: millimetres(2 * Math.PI * item.radius) },
      ],
    };
  }

  for (const item of scene.ellipses ?? []) {
    if (item.id !== entityId) continue;
    return {
      id: item.id,
      kind: "ellipse",
      label: entityLabel("ellipse", item.id),
      role: item.role,
      rows: [
        { label: "Centre", value: coordinates(item.centre) },
        { label: "Demi-grand axe", value: millimetres(Math.max(item.radiusX, item.radiusY)) },
        { label: "Demi-petit axe", value: millimetres(Math.min(item.radiusX, item.radiusY)) },
        { label: "Rotation", value: degrees(item.rotation ?? 0) },
      ],
    };
  }

  for (const item of scene.polylines ?? []) {
    if (item.id !== entityId) continue;
    return {
      id: item.id,
      kind: "polyline",
      label: entityLabel("polyline", item.id),
      role: item.role,
      rows: [
        { label: "Sommets", value: `${item.points.length}` },
        { label: "Développé", value: millimetres(pathLength(item.points, false)) },
      ],
    };
  }

  for (const item of scene.polygons ?? []) {
    if (item.id !== entityId) continue;
    return {
      id: item.id,
      kind: "polygon",
      label: entityLabel("polygon", item.id),
      role: item.role,
      rows: [
        { label: "Sommets", value: `${item.points.length}` },
        { label: "Périmètre", value: millimetres(pathLength(item.points, true)) },
      ],
    };
  }

  for (const item of scene.points ?? []) {
    if (item.id !== entityId) continue;
    return {
      id: item.id,
      kind: "point",
      label: item.label ?? entityLabel("point", item.id),
      role: item.role,
      rows: [
        { label: "Position", value: coordinates(item) },
        { label: "Rôle", value: item.role ?? "reference" },
      ],
    };
  }

  return null;
}

function pathLength(points: readonly { x: number; y: number }[], closed: boolean): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += Math.hypot(points[index].x - points[index - 1].x, points[index].y - points[index - 1].y);
  }
  if (closed) {
    const first = points[0];
    const last = points[points.length - 1];
    total += Math.hypot(first.x - last.x, first.y - last.y);
  }
  return total;
}

/** Nombre total d'entités rendues — sert au contrôle de charge de la scène (§14). */
export function countSceneEntities(scene: PlanScene): number {
  return listSceneEntities(scene).length;
}

/**
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §6 — résumé d'une sélection MULTIPLE.
 *
 * Volontairement descriptif, jamais éditable : ce lot n'implémente pas la modification groupée
 * (§9). Le panneau doit répondre à « qu'est-ce que je tiens ? », pas offrir un formulaire.
 *
 * Trois choix méritent d'être dits :
 *
 * - les entités sont rendues dans l'ordre de la SÉLECTION, pas dans celui de la scène. C'est
 *   l'ordre dans lequel l'utilisateur les a désignées, donc celui où il les cherche ;
 * - les identifiants inconnus de la scène sont ignorés silencieusement. Une sélection peut
 *   survivre à un changement de paramètre qui supprime une entité ; le panneau doit alors
 *   décrire ce qui reste, pas afficher une ligne fantôme ;
 * - la répartition par nature est calculée sur les entités RETROUVÉES, pour que le compte affiché
 *   et la liste affichée ne puissent pas se contredire.
 */
export type SceneSelectionSummary = {
  /** Nombre d'entités effectivement retrouvées dans la scène. */
  count: number;
  /** Répartition par nature, dans l'ordre d'apparition dans la sélection. */
  kinds: readonly { kind: SceneEntityKind; count: number }[];
  /** Les entités retrouvées, dans l'ordre de sélection. */
  entities: readonly SceneEntitySummary[];
  /** Rôle métier commun à TOUTES les entités, s'il existe — sinon `null`. */
  commonRole: string | null;
  /** Quelques propriétés communes, calculées seulement quand elles ont un sens pour tout le lot. */
  rows: readonly PropertyRow[];
};

/** Longueur d'une entité, ou `null` si la notion ne s'applique pas (point, ellipse, contour ouvert). */
function entityLength(scene: PlanScene, entityId: string): number | null {
  for (const { item } of sceneSegments(scene)) {
    if (item.id === entityId) return Math.hypot(item.end.x - item.start.x, item.end.y - item.start.y);
  }
  for (const item of scene.arcs ?? []) {
    if (item.id === entityId) return Math.abs(item.radius * arcSweep(item));
  }
  for (const item of scene.circles ?? []) if (item.id === entityId) return 2 * Math.PI * item.radius;
  for (const item of scene.polylines ?? []) if (item.id === entityId) return pathLength(item.points, false);
  for (const item of scene.polygons ?? []) if (item.id === entityId) return pathLength(item.points, true);
  return null;
}

export function describeSceneSelection(scene: PlanScene, entityIds: readonly string[]): SceneSelectionSummary {
  const byId = new Map(listSceneEntities(scene).map((entity) => [entity.id, entity]));
  const entities = entityIds.map((id) => byId.get(id)).filter((entity): entity is SceneEntitySummary => Boolean(entity));

  const counts: { kind: SceneEntityKind; count: number }[] = [];
  for (const entity of entities) {
    const existing = counts.find((row) => row.kind === entity.kind);
    if (existing) existing.count += 1;
    else counts.push({ kind: entity.kind, count: 1 });
  }

  const roles = new Set(entities.map((entity) => entity.role ?? "—"));
  const commonRole = entities.length > 0 && roles.size === 1 ? [...roles][0] : null;

  const rows: PropertyRow[] = [
    { label: "Sélection", value: `${entities.length} entité${entities.length > 1 ? "s" : ""}` },
    { label: "Natures", value: counts.map((row) => `${entityKindLabel(row.kind)} × ${row.count}`).join(" · ") || "—" },
  ];
  if (commonRole && commonRole !== "—") rows.push({ label: "Rôle commun", value: commonRole });

  // La longueur cumulée n'est affichée que si CHAQUE entité en a une : additionner les seules
  // entités mesurables afficherait un total juste pour un sous-ensemble muet, ce qu'aucun libellé
  // ne rattraperait sur un chantier.
  const lengths = entities.map((entity) => entityLength(scene, entity.id));
  if (entities.length > 0 && lengths.every((value): value is number => value !== null)) {
    rows.push({ label: "Longueur cumulée", value: millimetres(lengths.reduce((total, value) => total + value, 0)) });
  }

  rows.push({ label: "Identifiants", value: entities.map((entity) => entity.id).join(", ") || "—" });

  return { count: entities.length, kinds: counts, entities, commonRole, rows };
}
