/**
 * Relevé Lot 8 — cotations professionnelles du plan (pur, testable sans DOM).
 *
 * Cotes AUTOMATIQUES : calculées à la volée depuis la géométrie (jamais stockées, elles suivent les
 * murs) — intérieures (arêtes du contour d'une pièce), largeur / longueur / diagonale de pièce,
 * extérieures (faces raccordées du Lot 6), partielles et cumulées le long d'un mur (tableaux des
 * ouvertures), cote d'ouverture (largeur × hauteur), distance entre murs parallèles en regard,
 * implantation d'un objet par rapport aux faces de murs les plus proches.
 *
 * Cotes MANUELLES : éléments `mesure` du plan (domaine `PlanCote`), rendues par le même tracé.
 *
 * Une ligne de cote est définie dans le repère MONDE (mm, Y haut) : deux points mesurés `a`, `b` et
 * un décalage signé `offsetMm` (positif = à gauche de a → b). La valeur affichée est la longueur a → b
 * (ou la valeur relevée d'une cote manuelle).
 */
import {
  coteEcartMm, coteLongueurMm, formatLongueur, roundDecimal,
  type PlanContour, type PlanCote, type PlanDocument, type PlanEquipement, type PlanMur, type PlanOuverture,
} from "@elsatia/releve-domain";
import type { Point2D } from "@/lib/geometry/engine/types";
import { footprint } from "./equipments";
import type { WallNetwork } from "./wall-geometry";

export const DIMENSION_KINDS = [
  "interieure", "exterieure", "cumulee", "partielle", "ouverture", "implantation", "largeur", "longueur", "diagonale", "distance", "libre", "hauteur",
] as const;
export type DimensionKind = (typeof DIMENSION_KINDS)[number];

export type DimensionLine = {
  /** Identifiant stable (clé de rendu, test). */
  readonly key: string;
  readonly kind: DimensionKind;
  readonly a: Point2D;
  readonly b: Point2D;
  /** Décalage de la ligne de cote (mm monde), positif à gauche de a → b. */
  readonly offsetMm: number;
  readonly valueMm: number;
  readonly text: string;
  /** Cote manuelle : identifiant de l'élément et écart au plan (relevée). */
  readonly coteId?: string;
  readonly ecartMm?: number | null;
};

const length = (a: Point2D, b: Point2D) => Math.hypot(b.x - a.x, b.y - a.y);
const cm = (mm: number) => formatLongueur(mm, "cm");

function line(key: string, kind: DimensionKind, a: Point2D, b: Point2D, offsetMm: number, text?: string): DimensionLine {
  const valueMm = roundDecimal(length(a, b), 1);
  return { key, kind, a, b, offsetMm, valueMm, text: text ?? cm(valueMm) };
}

/** Points de la ligne de cote (décalée) et de ses lignes d'attache, repère monde. */
export function dimensionGeometry(dimension: Pick<DimensionLine, "a" | "b" | "offsetMm">): { from: Point2D; to: Point2D; mid: Point2D; angle: number } {
  const l = length(dimension.a, dimension.b) || 1;
  const nx = -(dimension.b.y - dimension.a.y) / l; const ny = (dimension.b.x - dimension.a.x) / l;
  const from = { x: dimension.a.x + nx * dimension.offsetMm, y: dimension.a.y + ny * dimension.offsetMm };
  const to = { x: dimension.b.x + nx * dimension.offsetMm, y: dimension.b.y + ny * dimension.offsetMm };
  return { from, to, mid: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 }, angle: Math.atan2(dimension.b.y - dimension.a.y, dimension.b.x - dimension.a.x) };
}

// ── Pièces ────────────────────────────────────────────────────────────────────

/** Cotes intérieures : une par arête du contour (nu des murs), à l'intérieur de la pièce. */
export function roomInteriorDimensions(contour: Pick<PlanContour, "pieceId" | "points">, offsetMm: number): DimensionLine[] {
  const out: DimensionLine[] = [];
  const pts = contour.points; const n = pts.length;
  // Contour trigonométrique : l'intérieur est à GAUCHE de chaque arête.
  const ccw = signedArea(pts) >= 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i]; const b = pts[(i + 1) % n];
    if (length(a, b) < 1) continue;
    out.push(line(`int:${contour.pieceId}:${i}`, "interieure", a, b, ccw ? offsetMm : -offsetMm));
  }
  return out;
}

function signedArea(points: readonly Point2D[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) { const a = points[i]; const b = points[(i + 1) % points.length]; sum += a.x * b.y - b.x * a.y; }
  return sum / 2;
}

export type RoomExtents = { largeurMm: number; longueurMm: number; diagonaleMm: number; dimensions: DimensionLine[] };

/**
 * Largeur et longueur de la pièce, mesurées dans l'orientation de son arête la plus longue (pièce
 * biaise comprise), et plus grande diagonale (entre deux sommets du contour).
 */
export function roomExtents(contour: Pick<PlanContour, "pieceId" | "points">): RoomExtents | null {
  const pts = contour.points;
  if (pts.length < 3) return null;
  let best = 0; let ux = 1; let uy = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]; const b = pts[(i + 1) % pts.length]; const l = length(a, b);
    if (l > best) { best = l; ux = (b.x - a.x) / l; uy = (b.y - a.y) / l; }
  }
  const vx = -uy; const vy = ux;
  let minU = Infinity; let maxU = -Infinity; let minV = Infinity; let maxV = -Infinity;
  for (const p of pts) { const u = p.x * ux + p.y * uy; const v = p.x * vx + p.y * vy; minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v); }
  const at = (u: number, v: number) => ({ x: u * ux + v * vx, y: u * uy + v * vy });
  let da = pts[0]; let db = pts[0]; let diag = 0;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) { const d = length(pts[i], pts[j]); if (d > diag) { diag = d; da = pts[i]; db = pts[j]; } }
  const midV = (minV + maxV) / 2; const midU = (minU + maxU) / 2;
  return {
    longueurMm: roundDecimal(maxU - minU, 1), largeurMm: roundDecimal(maxV - minV, 1), diagonaleMm: roundDecimal(diag, 1),
    dimensions: [
      line(`lon:${contour.pieceId}`, "longueur", at(minU, midV), at(maxU, midV), 0),
      line(`lar:${contour.pieceId}`, "largeur", at(midU, minV), at(midU, maxV), 0),
      line(`dia:${contour.pieceId}`, "diagonale", da, db, 0),
    ],
  };
}

// ── Murs ──────────────────────────────────────────────────────────────────────

const along = (mur: Pick<PlanMur, "a" | "b">, distance: number): Point2D => {
  const l = length(mur.a, mur.b) || 1;
  return { x: mur.a.x + ((mur.b.x - mur.a.x) * distance) / l, y: mur.a.y + ((mur.b.y - mur.a.y) * distance) / l };
};

/**
 * Chaîne de cotes le long d'un mur, côté face de référence (gauche) : cotes PARTIELLES entre les
 * tableaux successifs (A → tableau → tableau → B) et cotes CUMULÉES depuis A jusqu'à chaque tableau.
 */
export function wallChainDimensions(mur: PlanMur, ouvertures: readonly PlanOuverture[], gapMm: number): DimensionLine[] {
  const total = length(mur.a, mur.b);
  const stops = [0, ...ouvertures.filter((o) => o.murId === mur.id).sort((x, y) => x.decalageMm - y.decalageMm)
    .flatMap((o) => [o.decalageMm, o.decalageMm + o.largeurMm]), total]
    .map((value) => Math.min(total, Math.max(0, value)));
  const unique = stops.filter((value, index) => index === 0 || value - stops[index - 1] > 0.5);
  const base = mur.epaisseurMm / 2 + gapMm;
  const out: DimensionLine[] = [];
  for (let i = 0; i + 1 < unique.length; i++) {
    out.push(line(`par:${mur.id}:${i}`, "partielle", along(mur, unique[i]), along(mur, unique[i + 1]), base));
  }
  for (let i = 1; i < unique.length - 1; i++) {
    out.push(line(`cum:${mur.id}:${i}`, "cumulee", mur.a, along(mur, unique[i]), base + gapMm * (1 + i)));
  }
  return out;
}

/** Cotes des deux faces raccordées d'un mur : la plus longue est la cote EXTÉRIEURE. */
export function wallFaceDimensions(mur: PlanMur, network: WallNetwork, gapMm: number): DimensionLine[] {
  const solid = network.walls.get(mur.id);
  if (!solid) return [];
  const left = solid.faces.left; const right = solid.faces.right;
  const leftLong = length(left.start, left.end) >= length(right.start, right.end);
  const faceLine = (face: { start: Point2D; end: Point2D }, side: 1 | -1, exterieure: boolean) =>
    line(`${exterieure ? "ext" : "fac"}:${mur.id}:${side}`, exterieure ? "exterieure" : "interieure", face.start, face.end, side * gapMm);
  return [faceLine(left, 1, leftLong), faceLine(right, -1, !leftLong)];
}

/** Cote d'ouverture : largeur le long du mur, côté opposé à la face de référence ; texte « L × H ». */
export function openingDimension(mur: PlanMur, ouverture: PlanOuverture, gapMm: number): DimensionLine {
  const a = along(mur, ouverture.decalageMm); const b = along(mur, ouverture.decalageMm + ouverture.largeurMm);
  return line(`ouv:${ouverture.id}`, "ouverture", a, b, -(mur.epaisseurMm / 2 + gapMm), `${cm(ouverture.largeurMm)} × ${cm(ouverture.hauteurMm)}`);
}

/**
 * Distances entre le mur et les murs PARALLÈLES en regard (une de chaque côté) : de face à face,
 * épaisseurs déduites. Seuls les murs dont les projections se recouvrent sont en regard.
 */
export function facingWallDistances(mur: PlanMur, murs: readonly PlanMur[]): DimensionLine[] {
  const l = length(mur.a, mur.b);
  if (l < 1) return [];
  const ux = (mur.b.x - mur.a.x) / l; const uy = (mur.b.y - mur.a.y) / l;
  const best: Record<"1" | "-1", { d: number; other: PlanMur; t0: number; t1: number } | undefined> = { "1": undefined, "-1": undefined };
  for (const other of murs) {
    if (other.id === mur.id) continue;
    const ol = length(other.a, other.b);
    if (ol < 1) continue;
    const cross = ux * (other.b.y - other.a.y) / ol - uy * (other.b.x - other.a.x) / ol;
    if (Math.abs(cross) > 0.01) continue;
    const d = ux * (other.a.y - mur.a.y) - uy * (other.a.x - mur.a.x);
    const ta = ux * (other.a.x - mur.a.x) + uy * (other.a.y - mur.a.y); const tb = ux * (other.b.x - mur.a.x) + uy * (other.b.y - mur.a.y);
    const t0 = Math.max(0, Math.min(ta, tb)); const t1 = Math.min(l, Math.max(ta, tb));
    if (t1 - t0 < 1 || Math.abs(d) < 1) continue;
    const side = d > 0 ? "1" : "-1";
    if (!best[side] || Math.abs(d) < best[side]!.d) best[side] = { d: Math.abs(d), other, t0, t1 };
  }
  const out: DimensionLine[] = [];
  for (const side of ["1", "-1"] as const) {
    const found = best[side];
    if (!found) continue;
    const s = Number(side);
    const nx = -uy * s; const ny = ux * s;
    const t = (found.t0 + found.t1) / 2;
    const base = along(mur, t);
    const a = { x: base.x + nx * (mur.epaisseurMm / 2), y: base.y + ny * (mur.epaisseurMm / 2) };
    const clear = found.d - mur.epaisseurMm / 2 - found.other.epaisseurMm / 2;
    if (clear <= 0) continue;
    const b = { x: a.x + nx * clear, y: a.y + ny * clear };
    out.push(line(`dist:${mur.id}:${found.other.id}`, "distance", a, b, 0));
  }
  return out;
}

// ── Objets ────────────────────────────────────────────────────────────────────

/**
 * Cotes d'implantation d'un objet : distance de son emprise à la face de mur la plus proche dans
 * deux directions non parallèles (typiquement « à 35 cm du mur nord, 120 cm du mur ouest »). Une
 * face n'est retenue que si le pied de la perpendiculaire tombe sur le mur.
 */
export function implantationDimensions(objet: Pick<PlanEquipement, "id" | "position" | "rotationRad" | "largeurMm" | "profondeurMm">, murs: readonly PlanMur[], maxMm = 20_000): DimensionLine[] {
  const corners = footprint(objet);
  type Candidate = { d: number; from: Point2D; to: Point2D; ux: number; uy: number; murId: string };
  const candidates: Candidate[] = [];
  for (const mur of murs) {
    const l = length(mur.a, mur.b);
    if (l < 1) continue;
    const ux = (mur.b.x - mur.a.x) / l; const uy = (mur.b.y - mur.a.y) / l;
    // Côté de l'objet : celui de son centre.
    const side = Math.sign(ux * (objet.position.y - mur.a.y) - uy * (objet.position.x - mur.a.x)) || 1;
    const nx = -uy * side; const ny = ux * side;
    let bestCorner: Point2D | null = null; let bestD = Infinity;
    for (const c of corners) {
      const d = (c.x - mur.a.x) * nx + (c.y - mur.a.y) * ny - mur.epaisseurMm / 2;
      if (d < bestD) { bestD = d; bestCorner = c; }
    }
    if (!bestCorner || bestD < 0 || bestD > maxMm) continue;
    const t = ux * (bestCorner.x - mur.a.x) + uy * (bestCorner.y - mur.a.y);
    if (t < 0 || t > l) continue;
    const to = { x: bestCorner.x - nx * bestD, y: bestCorner.y - ny * bestD };
    candidates.push({ d: bestD, from: bestCorner, to, ux, uy, murId: mur.id });
  }
  candidates.sort((x, y) => x.d - y.d);
  const out: DimensionLine[] = [];
  const first = candidates[0];
  if (!first) return out;
  out.push(line(`imp:${objet.id}:${first.murId}`, "implantation", first.from, first.to, 0));
  const second = candidates.find((c) => Math.abs(c.ux * first.uy - c.uy * first.ux) > 0.5);
  if (second) out.push(line(`imp:${objet.id}:${second.murId}`, "implantation", second.from, second.to, 0));
  return out;
}

// ── Cotes manuelles ───────────────────────────────────────────────────────────

/** Cote manuelle → ligne de cote (valeur retenue, écart au plan si relevée). */
export function manualDimension(cote: PlanCote): DimensionLine | null {
  if (!cote.b) return null;
  const ecart = coteEcartMm(cote);
  const text = `${cm(cote.valeurMm)}${ecart !== null && Math.abs(ecart) >= 1 ? ` (plan ${cm(coteLongueurMm(cote))})` : ""}`;
  return { key: `man:${cote.id}`, kind: cote.typeCote === "hauteur" ? "hauteur" : cote.typeCote, a: cote.a, b: cote.b, offsetMm: cote.decalageMm ?? 0, valueMm: cote.valeurMm, text, coteId: cote.id, ecartMm: ecart };
}

/** Cote manuelle la plus proche du point (sur sa ligne décalée), à `tolerance` près. */
export function hitTestCote(cotes: readonly PlanCote[], point: Point2D, tolerance: number): PlanCote | null {
  let best: { cote: PlanCote; d: number } | null = null;
  for (const cote of cotes) {
    let d: number;
    if (!cote.b) d = length(cote.a, point);
    else {
      const { from, to } = dimensionGeometry({ a: cote.a, b: cote.b, offsetMm: cote.decalageMm ?? 0 });
      const l2 = (to.x - from.x) ** 2 + (to.y - from.y) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((point.x - from.x) * (to.x - from.x) + (point.y - from.y) * (to.y - from.y)) / l2));
      d = length(point, { x: from.x + t * (to.x - from.x), y: from.y + t * (to.y - from.y) });
    }
    if (d <= tolerance && (!best || d < best.d)) best = { cote, d };
  }
  return best?.cote ?? null;
}

// ── Opérations sur les cotes (document → document, annulables) ────────────────

export function addCote(document: PlanDocument, cote: PlanCote): PlanDocument {
  return { ...document, cotes: [...(document.cotes ?? []), cote] };
}

export function updateCote(document: PlanDocument, id: string, patch: Partial<Omit<PlanCote, "id">>): PlanDocument {
  return { ...document, cotes: (document.cotes ?? []).map((cote) => {
    if (cote.id !== id) return cote;
    const next = { ...cote, ...patch };
    // Cote calculée : sa valeur suit toujours la longueur (jamais une valeur figée en silence).
    return next.source === "calcule" && next.b ? { ...next, valeurMm: roundDecimal(coteLongueurMm(next), 1) } : next;
  }) };
}

export function deleteCote(document: PlanDocument, id: string): PlanDocument {
  return { ...document, cotes: (document.cotes ?? []).filter((cote) => cote.id !== id) };
}
