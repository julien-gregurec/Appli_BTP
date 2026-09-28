/**
 * Relevé Lot 5 — accrochage du plan : ordre de priorité métier au-dessus d'Engine B.
 *
 * | priorité | accroche | brique Engine B |
 * |---|---|---|
 * | 1 | extrémité de mur (axe) | `findSnapCandidates` (endpoint) |
 * | 1b | coin de jonction (Lot 6 : angle extérieur / intérieur d'un solide raccordé, about) | `thick-strips` |
 * | 2 | intersection d'axes (jonction en X) | `findSnapCandidates` (intersection) |
 * | 3 | milieu de mur | `findSnapCandidates` (midpoint) |
 * | 3b | tableau d'ouverture (Lot 6 : bord sur l'axe ou sur une face) | `wallFeatures` |
 * | 4 | horizontale / verticale / angle usuel depuis le point de départ | `constrainToAngleStep` |
 * |   | combinée à un alignement (axe X / Y d'une extrémité existante) | `alignmentGuides` |
 * | 5 | alignement seul | `alignmentGuides` |
 * | 6 | perpendiculaire / sur l'axe d'un mur | `findSnapCandidates` (perpendicular), point le plus proche |
 * | 6b | sur une face de mur (Lot 6) | point le plus proche des faces raccordées |
 * | 7 | grille | pas de grille |
 *
 * La tolérance arrive en millimètres (convertie depuis les pixels par l'appelant, comme dans
 * l'Atelier) : l'accroche reste aussi facile à viser à tous les zooms.
 */
import type { PlanMur } from "@elsatia/releve-domain";
import { closestPointOnSegment } from "@/lib/geometry/closest-point";
import { alignmentGuides, constrainToAngleStep } from "@/lib/geometry/engine/guides";
import { distance } from "@/lib/geometry/engine/measure";
import { findSnapCandidates } from "@/lib/geometry/engine/snap";
import type { Point2D } from "@/lib/geometry/engine/types";
import { wallSegment } from "./geometry";
import type { WallFeatures } from "./wall-geometry";

export type PlanSnapKind =
  | "extremite" | "coin" | "intersection" | "milieu" | "ouverture" | "horizontal" | "vertical" | "angle" | "alignement" | "perpendiculaire" | "sur_mur"
  | "face" | "grille" | "libre";

export const PLAN_SNAP_LABELS: Record<PlanSnapKind, string> = {
  extremite: "Extrémité", coin: "Coin de jonction", intersection: "Intersection", milieu: "Milieu", ouverture: "Tableau d'ouverture",
  horizontal: "Horizontal", vertical: "Vertical", angle: "Angle", alignement: "Alignement", perpendiculaire: "Perpendiculaire",
  sur_mur: "Sur l'axe du mur", face: "Sur la face du mur", grille: "Grille", libre: "",
};

export type PlanSnap = {
  point: Point2D;
  kind: PlanSnapKind;
  /** Angle retenu (degrés) pour une accroche directionnelle. */
  angleDegrees?: number;
  /** Guides à dessiner : axe vertical x = …, horizontal y = …, depuis un point. */
  guides?: { x?: number; y?: number; from?: Point2D };
};

export type PlanSnapOptions = {
  toleranceWorld: number;
  /** Point de départ du mur en cours (accroches directionnelles). */
  origin?: Point2D | null;
  /** Murs à ignorer (celui qu'on déplace). */
  excludeMurIds?: ReadonlySet<string>;
  /** Pas des angles usuels (15° par défaut : 0, 15, 30, 45, 60, 75, 90…). */
  angleStepDegrees?: number;
  gridMm?: number | null;
  enabled?: boolean;
  /** Lot 6 : coins, faces et tableaux de la géométrie raccordée (accroches supplémentaires). */
  features?: WallFeatures | null;
};

function nearestPoint(cursor: Point2D, points: readonly Point2D[], tolerance: number): { point: Point2D; distance: number } | null {
  let best: { point: Point2D; distance: number } | null = null;
  for (const point of points) {
    if (Math.abs(point.x - cursor.x) > tolerance || Math.abs(point.y - cursor.y) > tolerance) continue;
    const d = distance(point, cursor);
    if (d <= tolerance && (!best || d < best.distance)) best = { point, distance: d };
  }
  return best;
}

const PRIORITY: Partial<Record<string, number>> = { endpoint: 0, intersection: 1, midpoint: 2 };

export function resolvePlanSnap(cursor: Point2D, murs: readonly PlanMur[], options: PlanSnapOptions): PlanSnap {
  if (options.enabled === false) return { point: cursor, kind: "libre" };
  const tolerance = options.toleranceWorld;
  const exclude = options.excludeMurIds;
  const candidates = murs.filter((mur) => !exclude?.has(mur.id));
  const reach = tolerance * 2;
  const nearby = candidates.filter((mur) => cursor.x >= Math.min(mur.a.x, mur.b.x) - reach && cursor.x <= Math.max(mur.a.x, mur.b.x) + reach
    && cursor.y >= Math.min(mur.a.y, mur.b.y) - reach && cursor.y <= Math.max(mur.a.y, mur.b.y) + reach);

  // 1–3. Points remarquables (Engine B), sur les seuls murs voisins : coût borné même à 500 murs.
  const found = findSnapCandidates(cursor, { segments: nearby.map(wallSegment) }, tolerance)
    .filter((candidate) => PRIORITY[candidate.kind] !== undefined)
    .sort((a, b) => (PRIORITY[a.kind]! - PRIORITY[b.kind]!) || a.distance - b.distance)[0];
  const features = options.features ?? null;
  if (found?.kind === "endpoint") return { point: found.point, kind: "extremite" };
  // 1b. Coins des solides raccordés (Lot 6).
  const corner = features ? nearestPoint(cursor, features.corners, tolerance) : null;
  if (corner) return { point: corner.point, kind: "coin" };
  if (found) {
    const kind: PlanSnapKind = found.kind === "intersection" ? "intersection" : "milieu";
    return { point: found.point, kind };
  }
  // 3b. Tableaux d'ouverture (Lot 6).
  const jamb = features ? nearestPoint(cursor, features.openingPoints, tolerance) : null;
  if (jamb) return { point: jamb.point, kind: "ouverture" };

  // 4–5. Directions et alignements.
  const endpoints: Point2D[] = [];
  for (const mur of candidates) endpoints.push(mur.a, mur.b);
  const origin = options.origin ?? null;
  const align = alignmentGuides(cursor, endpoints.filter((p) => !origin || distance(p, origin) > 1e-6), tolerance);
  if (origin && distance(origin, cursor) > tolerance) {
    const toleranceDegrees = Math.min(8, (Math.atan2(tolerance, distance(origin, cursor)) * 180) / Math.PI);
    const guide = constrainToAngleStep(origin, cursor, options.angleStepDegrees ?? 15, toleranceDegrees);
    if (guide) {
      const kind: PlanSnapKind = guide.degrees % 180 === 0 ? "horizontal" : guide.degrees % 90 === 0 ? "vertical" : "angle";
      // Horizontale depuis le départ + axe vertical d'une extrémité : le point est leur croisement.
      if (kind === "horizontal" && align.x) return { point: { x: align.x.value, y: origin.y }, kind, angleDegrees: guide.degrees, guides: { x: align.x.value, from: origin } };
      if (kind === "vertical" && align.y) return { point: { x: origin.x, y: align.y.value }, kind, angleDegrees: guide.degrees, guides: { y: align.y.value, from: origin } };
      return { point: guide.point, kind, angleDegrees: guide.degrees, guides: { from: origin } };
    }
  }
  if (align.x || align.y) {
    return {
      point: { x: align.x?.value ?? cursor.x, y: align.y?.value ?? cursor.y }, kind: "alignement",
      guides: { x: align.x?.value, y: align.y?.value },
    };
  }

  // 6. Perpendiculaire depuis le départ, ou point sur l'axe d'un mur.
  let best: { point: Point2D; distance: number; kind: PlanSnapKind } | null = null;
  for (const mur of nearby) {
    const hit = closestPointOnSegment(cursor, mur.a, mur.b);
    if (hit.distance <= tolerance && (!best || hit.distance < best.distance)) best = { point: hit.point, distance: hit.distance, kind: "sur_mur" };
  }
  if (origin) {
    const perpendicular = findSnapCandidates(cursor, { segments: nearby.map(wallSegment), referencePoint: origin }, tolerance)
      .find((candidate) => candidate.kind === "perpendicular");
    if (perpendicular && (!best || perpendicular.distance <= best.distance)) best = { point: perpendicular.point, distance: perpendicular.distance, kind: "perpendiculaire" };
  }
  // 6b. Faces des murs (Lot 6) : préférées à l'axe quand elles sont plus proches du curseur.
  if (features) {
    for (const face of features.faces) {
      if (cursor.x < Math.min(face.start.x, face.end.x) - tolerance || cursor.x > Math.max(face.start.x, face.end.x) + tolerance
        || cursor.y < Math.min(face.start.y, face.end.y) - tolerance || cursor.y > Math.max(face.start.y, face.end.y) + tolerance) continue;
      const hit = closestPointOnSegment(cursor, face.start, face.end);
      if (hit.distance <= tolerance && (!best || hit.distance < best.distance)) best = { point: hit.point, distance: hit.distance, kind: "face" };
    }
  }
  if (best) return { point: best.point, kind: best.kind };

  // 7. Grille.
  if (options.gridMm && options.gridMm > 0) {
    const step = options.gridMm;
    return { point: { x: Math.round(cursor.x / step) * step, y: Math.round(cursor.y / step) * step }, kind: "grille" };
  }
  return { point: cursor, kind: "libre" };
}
