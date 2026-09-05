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

export type PlanScene = {
  id: string;
  name: string;
  bounds: BoundingBox;
  points?: readonly Point[];
  segments?: readonly Segment[];
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
  for (const item of scene.segments ?? []) push("segment", item.id, undefined, item.role);
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

  for (const item of scene.segments ?? []) {
    if (item.id !== entityId) continue;
    const length = Math.hypot(item.end.x - item.start.x, item.end.y - item.start.y);
    return {
      id: item.id,
      kind: "segment",
      label: entityLabel("segment", item.id),
      role: item.role,
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
