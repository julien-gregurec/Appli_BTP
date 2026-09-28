/**
 * Relevé Lot 7 — accrochage des objets du plan. N'empêche jamais le déplacement libre : chaque
 * accroche n'agit qu'à `toleranceWorld` près (convertie depuis les pixels, comme pour les murs),
 * l'accrochage se désactive (bouton « Accrochage »), et hors de toute accroche l'objet suit le doigt.
 *
 * | priorité | accroche | effet |
 * |---|---|---|
 * | 1 | face de mur (solides raccordés du Lot 6) | dos de l'objet contre la face, orienté vers la pièce ; objet MURAL : liaison au mur |
 * | 1b | coin | un côté de l'objet contre l'extrémité de la face (angle de la pièce) |
 * | 2 | axe de mur | centre de l'objet sur l'axe (objet sans profondeur utile : bouche, luminaire, détecteur) |
 * | 3 | objet | bord contre bord avec un objet voisin de même orientation (à 90° près) |
 * | 4 | axe | centre aligné (X ou Y) sur le centre d'un autre objet ou le milieu d'un mur |
 * | 5 | grille | centre sur la grille du plan |
 */
import type { EquipementFace, PlanEquipement, PlanMur } from "@elsatia/releve-domain";
import { closestPointOnSegment } from "@/lib/geometry/closest-point";
import type { Point2D } from "@/lib/geometry/engine/types";
import { offsetAlongWall, pointAlongWall, wallLength } from "./geometry";
import { equipmentBox, faceNormal, rotationFacing } from "./equipments";
import type { WallNetwork } from "./wall-geometry";

export type EquipmentSnapKind = "face" | "coin" | "mur" | "objet" | "axe" | "grille" | "libre";
export const EQUIPMENT_SNAP_LABELS: Record<EquipmentSnapKind, string> = {
  face: "Contre la face du mur", coin: "Dans l'angle", mur: "Sur l'axe du mur", objet: "Contre l'objet", axe: "Aligné", grille: "Grille", libre: "",
};

export type EquipmentSnap = {
  position: Point2D;
  rotationRad: number;
  kind: EquipmentSnapKind;
  /** Liaison proposée (objet mural accroché à une face). */
  link: { murId: string; face: EquipementFace; decalageMm: number } | null;
  guides?: { x?: number; y?: number };
};

export type EquipmentSnapInput = {
  /** Centre voulu (curseur ou doigt, décalage de saisie compris). */
  centre: Point2D;
  rotationRad: number;
  largeurMm: number;
  profondeurMm: number;
  mural: boolean;
};

export type EquipmentSnapContext = {
  murs: readonly PlanMur[];
  network: WallNetwork | null;
  /** Autres objets (celui qu'on déplace exclu). */
  others: readonly PlanEquipement[];
  toleranceWorld: number;
  gridMm?: number | null;
  enabled?: boolean;
};

const QUARTER = Math.PI / 2;
/** Deux orientations sont « les mêmes » à 90° près (bords parallèles). */
function sameAxes(a: number, b: number): boolean {
  const diff = Math.abs((((a - b) % QUARTER) + QUARTER) % QUARTER);
  return diff < 1e-3 || QUARTER - diff < 1e-3;
}
function axisAligned(rotation: number): boolean { return sameAxes(rotation, 0); }

export function resolveEquipmentSnap(input: EquipmentSnapInput, context: EquipmentSnapContext): EquipmentSnap {
  const free: EquipmentSnap = { position: input.centre, rotationRad: input.rotationRad, kind: "libre", link: null };
  if (context.enabled === false) return free;
  const tolerance = context.toleranceWorld;
  const { centre } = input;
  const half = input.profondeurMm / 2;

  // 1. Faces des murs : le dos de l'objet vient contre la face la plus proche du centre.
  let best: { score: number; snap: EquipmentSnap } | null = null;
  for (const mur of context.murs) {
    const reach = mur.epaisseurMm / 2 + input.profondeurMm + tolerance;
    if (centre.x < Math.min(mur.a.x, mur.b.x) - reach || centre.x > Math.max(mur.a.x, mur.b.x) + reach
      || centre.y < Math.min(mur.a.y, mur.b.y) - reach || centre.y > Math.max(mur.a.y, mur.b.y) + reach) continue;
    const solid = context.network?.walls.get(mur.id);
    for (const face of ["gauche", "droite"] as const) {
      const n = faceNormal(mur, face);
      const segment = solid ? (face === "gauche" ? solid.faces.left : solid.faces.right)
        : { start: offsetPoint(mur.a, n, mur.epaisseurMm / 2), end: offsetPoint(mur.b, n, mur.epaisseurMm / 2) };
      const u = unit(segment.start, segment.end);
      const faceLength = Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
      const rel = { x: centre.x - segment.start.x, y: centre.y - segment.start.y };
      let t = rel.x * u.x + rel.y * u.y;
      const signed = rel.x * n.x + rel.y * n.y;
      if (t < -tolerance || t > faceLength + tolerance) continue; // au-delà des bouts de la face
      // Côté pièce (ou engagé dans le mur), dos de l'objet à portée de la face.
      if (signed < -mur.epaisseurMm / 2 - tolerance || signed - half > tolerance) continue;
      const gap = Math.abs(signed - half);
      const rotationRad = rotationFacing(n);
      // Coin : un côté de l'objet contre une extrémité de la face (angle de la pièce).
      const across = extentAlong(input, rotationRad, u) / 2;
      let kind: EquipmentSnapKind = "face";
      if (Math.abs(t - across) <= tolerance) { t = across; kind = "coin"; }
      else if (Math.abs(faceLength - t - across) <= tolerance) { t = faceLength - across; kind = "coin"; }
      const foot = { x: segment.start.x + u.x * t, y: segment.start.y + u.y * t };
      const position = { x: foot.x + n.x * half, y: foot.y + n.y * half };
      const snap: EquipmentSnap = {
        position, rotationRad, kind,
        link: input.mural ? { murId: mur.id, face, decalageMm: offsetAlongWall(mur, position) } : null,
      };
      const score = gap;
      if (!best || score < best.score) best = { score, snap };
    }
  }
  if (best) return best.snap;

  // 2. Axe d'un mur (objet posé sur l'axe : bouche, détecteur…).
  for (const mur of context.murs) {
    const hit = closestPointOnSegment(centre, mur.a, mur.b);
    if (hit.distance <= tolerance) return { position: hit.point, rotationRad: input.rotationRad, kind: "mur", link: null };
  }

  // 3–4. Objets voisins : bord contre bord, puis alignement des centres (objets d'axes parallèles).
  let x: { value: number; kind: EquipmentSnapKind; guide?: number } | null = null;
  let y: { value: number; kind: EquipmentSnapKind; guide?: number } | null = null;
  const self = equipmentBox({ position: centre, rotationRad: input.rotationRad, largeurMm: input.largeurMm, profondeurMm: input.profondeurMm });
  const halfW = (self.maxX - self.minX) / 2; const halfH = (self.maxY - self.minY) / 2;
  const reach = Math.max(halfW, halfH) * 2 + tolerance * 4 + 3000;
  const consider = (value: number, target: number, axis: "x" | "y", kind: EquipmentSnapKind, guide?: number) => {
    const delta = Math.abs(value - target);
    if (delta > tolerance) return;
    const current = axis === "x" ? x : y;
    const rank = (k: EquipmentSnapKind) => (k === "objet" ? 0 : 1);
    if (!current || rank(kind) < rank(current.kind) || (rank(kind) === rank(current.kind) && delta < Math.abs((axis === "x" ? centre.x : centre.y) - current.value))) {
      const next = { value: target, kind, guide };
      if (axis === "x") x = next; else y = next;
    }
  };
  if (axisAligned(input.rotationRad)) {
    for (const other of context.others) {
      if (Math.abs(other.position.x - centre.x) > reach || Math.abs(other.position.y - centre.y) > reach) continue;
      if (!axisAligned(other.rotationRad) || !other.visible) continue;
      const box = equipmentBox(other);
      const overlapY = self.minY < box.maxY + tolerance && box.minY < self.maxY + tolerance;
      const overlapX = self.minX < box.maxX + tolerance && box.minX < self.maxX + tolerance;
      if (overlapY) {
        consider(centre.x - halfW, box.maxX, "x", "objet"); // mon bord gauche contre son bord droit
        const left = box.minX - halfW; if (Math.abs(centre.x + halfW - box.minX) <= tolerance) consider(centre.x, left, "x", "objet");
      }
      if (overlapX) {
        consider(centre.y - halfH, box.maxY, "y", "objet");
        const below = box.minY - halfH; if (Math.abs(centre.y + halfH - box.minY) <= tolerance) consider(centre.y, below, "y", "objet");
      }
    }
    // Les bords convertis en centres.
    const xs = x as { value: number; kind: EquipmentSnapKind } | null;
    if (xs && xs.kind === "objet" && Math.abs(centre.x - halfW - xs.value) <= tolerance) x = { value: xs.value + halfW, kind: "objet" };
    const ys = y as { value: number; kind: EquipmentSnapKind } | null;
    if (ys && ys.kind === "objet" && Math.abs(centre.y - halfH - ys.value) <= tolerance) y = { value: ys.value + halfH, kind: "objet" };
  }
  for (const other of context.others) {
    if (Math.abs(other.position.x - centre.x) > reach || Math.abs(other.position.y - centre.y) > reach || !other.visible) continue;
    if (!x) consider(centre.x, other.position.x, "x", "axe", other.position.x);
    if (!y) consider(centre.y, other.position.y, "y", "axe", other.position.y);
  }
  for (const mur of context.murs) {
    const mid = pointAlongWall(mur, wallLength(mur) / 2);
    if (Math.abs(mid.x - centre.x) > reach || Math.abs(mid.y - centre.y) > reach) continue;
    if (!x) consider(centre.x, mid.x, "x", "axe", mid.x);
    if (!y) consider(centre.y, mid.y, "y", "axe", mid.y);
  }
  if (x || y) {
    const xs = x as { value: number; kind: EquipmentSnapKind; guide?: number } | null;
    const ys = y as { value: number; kind: EquipmentSnapKind; guide?: number } | null;
    const kind: EquipmentSnapKind = xs?.kind === "objet" || ys?.kind === "objet" ? "objet" : "axe";
    return {
      position: { x: xs?.value ?? centre.x, y: ys?.value ?? centre.y }, rotationRad: input.rotationRad, kind, link: null,
      guides: { x: xs?.kind === "axe" ? xs.guide : undefined, y: ys?.kind === "axe" ? ys.guide : undefined },
    };
  }

  // 5. Grille.
  if (context.gridMm && context.gridMm > 0) {
    const step = context.gridMm;
    return { position: { x: Math.round(centre.x / step) * step, y: Math.round(centre.y / step) * step }, rotationRad: input.rotationRad, kind: "grille", link: null };
  }
  return free;
}

function offsetPoint(p: Point2D, n: Point2D, d: number): Point2D { return { x: p.x + n.x * d, y: p.y + n.y * d }; }
function unit(a: Point2D, b: Point2D): Point2D { const l = Math.hypot(b.x - a.x, b.y - a.y) || 1; return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; }
/** Étendue de l'objet (orienté `rotation`) le long de la direction `u`. */
function extentAlong(input: Pick<EquipmentSnapInput, "largeurMm" | "profondeurMm">, rotation: number, u: Point2D): number {
  const ax = { x: Math.cos(rotation), y: Math.sin(rotation) };
  const ay = { x: -Math.sin(rotation), y: Math.cos(rotation) };
  return Math.abs(ax.x * u.x + ax.y * u.y) * input.largeurMm + Math.abs(ay.x * u.x + ay.y * u.y) * input.profondeurMm;
}
