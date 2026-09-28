/**
 * Relevé Lot 6 — géométrie bâtiment des murs : ADAPTATEUR sur Engine B (`thick-strips`).
 *
 * Un mur n'est plus seulement un axe : c'est un solide d'épaisseur réelle, raccordé à ses
 * voisins (L en onglet, T en about, X sans chevauchement), avec une face GAUCHE (face de
 * référence : à gauche de A → B) et une face DROITE, interrompu au droit de ses ouvertures.
 *
 * Tout le calcul est délégué au moteur générique ; ce fichier traduit seulement le vocabulaire
 * bâtiment (mur, épaisseur, ouverture, jonction) — comme `geometry.ts` au Lot 5.
 *
 * Validations d'ouverture propres à la géométrie raccordée (le reste est dans le domaine,
 * `validatePlanDocument`, miroir du serveur) : une ouverture ne peut pas tomber sur une
 * jonction — dans la partie d'un mur engagée dans un raccord d'extrémité (onglet, about), ni au
 * droit d'un mur qui aboute (T) ou qui croise (X).
 */
import {
  OPENING_ISSUE_MESSAGES, PLAN_LIMITS, validatePlanDocument,
  type OpeningIssueCode, type PlanDocument, type PlanMur, type PlanOuverture,
} from "@elsatia/releve-domain";
import { buildStripNetwork, stripSolidParts, type Strip, type StripEndJoin, type StripJunctionKind, type StripNetwork } from "@/lib/geometry/engine/thick-strips";
import type { Point2D, Segment2D } from "@/lib/geometry/engine/types";
import { JOINT_EPSILON_MM, pointAlongWall, wallLength } from "./geometry";

export type WallObstruction = { readonly from: number; readonly to: number; readonly murId: string; readonly kind: "T" | "X" };

export type WallSolid = {
  readonly murId: string;
  /** Contour raccordé (sens trigonométrique), sans les ouvertures. */
  readonly outline: readonly Point2D[];
  readonly faces: { readonly left: Segment2D; readonly right: Segment2D };
  readonly startJoin: StripEndJoin;
  readonly endJoin: StripEndJoin;
  /** Partie libre de l'axe (distance depuis A) : hors raccords d'extrémité. */
  readonly clearFrom: number;
  readonly clearTo: number;
  /** Murs qui aboutent (T) ou croisent (X) : intervalles d'axe occupés. */
  readonly obstructions: readonly WallObstruction[];
  /** Murs dont l'emprise est retirée de celui-ci (croisement). */
  readonly cutBy: readonly string[];
};

export type WallJunction = { readonly point: Point2D; readonly kind: StripJunctionKind; readonly murIds: readonly string[] };

export type WallNetwork = {
  readonly walls: ReadonlyMap<string, WallSolid>;
  readonly junctions: readonly WallJunction[];
};

export function wallStrip(mur: Pick<PlanMur, "a" | "b" | "epaisseurMm">): Strip {
  return { start: mur.a, end: mur.b, halfWidth: mur.epaisseurMm / 2 };
}

/** Solides raccordés et jonctions des murs du plan. */
export function computeWallNetwork(murs: readonly PlanMur[]): WallNetwork {
  const network: StripNetwork = buildStripNetwork(murs.map(wallStrip), { tolerance: JOINT_EPSILON_MM });
  const walls = new Map<string, WallSolid>();
  murs.forEach((mur, index) => {
    const outline = network.outlines[index];
    walls.set(mur.id, {
      murId: mur.id,
      outline: outline.polygon,
      faces: { left: { start: outline.start.left, end: outline.end.left }, right: { start: outline.start.right, end: outline.end.right } },
      startJoin: outline.start.join,
      endJoin: outline.end.join,
      clearFrom: outline.clearFrom,
      clearTo: outline.clearTo,
      obstructions: outline.obstructions.map((item) => ({ from: item.from, to: item.to, murId: murs[item.by].id, kind: item.kind })),
      cutBy: outline.cutBy.map((by) => murs[by].id),
    });
  });
  return { walls, junctions: network.junctions.map((junction) => ({ point: junction.point, kind: junction.kind, murIds: junction.strips.map((index) => murs[index].id) })) };
}

/** Parties pleines d'un mur : contour raccordé, interrompu par ses ouvertures et par les murs qui le croisent. */
export function wallParts(network: WallNetwork, murs: ReadonlyMap<string, PlanMur>, mur: PlanMur, ouvertures: readonly PlanOuverture[]): Point2D[][] {
  const solid = network.walls.get(mur.id);
  if (!solid) return [];
  const gaps = ouvertures.filter((o) => o.murId === mur.id).map((o) => ({ from: o.decalageMm, to: o.decalageMm + o.largeurMm }));
  const cutters = solid.cutBy.map((id) => murs.get(id)).filter((item): item is PlanMur => Boolean(item)).map(wallStrip);
  return stripSolidParts(solid.outline, wallStrip(mur), gaps, cutters);
}

/** Comptage des jonctions par nature (panneau, rapport). */
export function junctionSummary(network: WallNetwork): Record<StripJunctionKind, number> {
  const summary: Record<StripJunctionKind, number> = { L: 0, T: 0, X: 0, prolongement: 0, multiple: 0 };
  for (const junction of network.junctions) summary[junction.kind]++;
  return summary;
}

// ── Emplacements libres le long d'un mur ─────────────────────────────────────

export type Span = { from: number; to: number };

/**
 * Intervalles de l'axe où une ouverture peut se loger : partie libre des raccords d'extrémité,
 * moins les murs qui aboutent / croisent, moins les AUTRES ouvertures du mur.
 */
export function freeSpans(network: WallNetwork, document: Pick<PlanDocument, "ouvertures">, mur: PlanMur, excludeOuvertureId: string | null = null): Span[] {
  const solid = network.walls.get(mur.id);
  const length = wallLength(mur);
  const from = solid ? solid.clearFrom : 0;
  const to = solid ? solid.clearTo : length;
  const blocked: Span[] = [
    ...(solid?.obstructions ?? []).map((item) => ({ from: item.from, to: item.to })),
    ...document.ouvertures.filter((o) => o.murId === mur.id && o.id !== excludeOuvertureId).map((o) => ({ from: o.decalageMm, to: o.decalageMm + o.largeurMm })),
  ].sort((x, y) => x.from - y.from);
  const spans: Span[] = [];
  let cursor = from;
  for (const block of blocked) {
    if (block.from > cursor) spans.push({ from: cursor, to: Math.min(block.from, to) });
    cursor = Math.max(cursor, block.to);
    if (cursor >= to) break;
  }
  if (cursor < to) spans.push({ from: cursor, to });
  return spans.filter((span) => span.to - span.from > 0);
}

// ── Validations géométriques ─────────────────────────────────────────────────

export type OpeningIssue = { readonly ouvertureId: string; readonly code: OpeningIssueCode; readonly message: string };

/**
 * Anomalies de toutes les ouvertures : règles du domaine (hors mur, plus large que le mur,
 * chevauchement, largeur nulle, hauteur incohérente) + jonction (géométrie raccordée).
 */
export function openingIssues(document: PlanDocument, network: WallNetwork = computeWallNetwork(document.murs)): OpeningIssue[] {
  const issues: OpeningIssue[] = [];
  const seen = new Set<string>();
  const push = (issue: OpeningIssue) => {
    const key = `${issue.ouvertureId}:${issue.code}`;
    if (!seen.has(key)) { seen.add(key); issues.push(issue); }
  };
  // Ouvertures seulement : contours et objets (Lot 7) ne sont pas concernés.
  for (const issue of validatePlanDocument({ ...document, contours: [], equipements: [] })) {
    const match = /^ouvertures\.([^.]+)\./.exec(issue.path);
    if (match && issue.code) push({ ouvertureId: match[1], code: issue.code, message: issue.message });
  }
  const murs = new Map(document.murs.map((mur) => [mur.id, mur]));
  const tolerance = PLAN_LIMITS.ouvertureToleranceMm;
  for (const ouverture of document.ouvertures) {
    const mur = murs.get(ouverture.murId);
    const solid = mur ? network.walls.get(mur.id) : undefined;
    if (!mur || !solid) continue;
    const start = ouverture.decalageMm; const end = start + ouverture.largeurMm;
    const inEnds = start < solid.clearFrom - tolerance || end > solid.clearTo + tolerance;
    const onJunction = solid.obstructions.some((item) => start < item.to - tolerance && end > item.from + tolerance);
    if ((inEnds || onJunction) && ouverture.largeurMm <= wallLength(mur)) push({ ouvertureId: ouverture.id, code: "jonction", message: OPENING_ISSUE_MESSAGES.jonction });
  }
  return issues;
}

/** Clés des anomalies (comparaison avant / après une modification). */
export function issueKeys(issues: readonly OpeningIssue[]): Set<string> {
  return new Set(issues.map((issue) => `${issue.ouvertureId}:${issue.code}`));
}

/** Anomalies présentes dans `after` et absentes de `before` : ce qu'une modification introduirait. */
export function newIssues(before: readonly OpeningIssue[], after: readonly OpeningIssue[]): OpeningIssue[] {
  const known = issueKeys(before);
  return after.filter((issue) => !known.has(`${issue.ouvertureId}:${issue.code}`));
}

// ── Points remarquables (accrochage, export) ─────────────────────────────────

export type WallFeatures = {
  /** Coins des solides raccordés (angles extérieurs et intérieurs, abouts). */
  readonly corners: readonly Point2D[];
  /** Faces des murs (segments). */
  readonly faces: readonly Segment2D[];
  /** Tableaux des ouvertures : bords sur l'axe et sur les deux faces. */
  readonly openingPoints: readonly Point2D[];
};

export function wallFeatures(document: Pick<PlanDocument, "murs" | "ouvertures">, network: WallNetwork): WallFeatures {
  const corners: Point2D[] = [];
  const faces: Segment2D[] = [];
  for (const solid of network.walls.values()) {
    if (solid.outline.length < 3) continue;
    corners.push(solid.faces.left.start, solid.faces.left.end, solid.faces.right.start, solid.faces.right.end);
    faces.push(solid.faces.left, solid.faces.right);
  }
  const murs = new Map(document.murs.map((mur) => [mur.id, mur]));
  const openingPoints: Point2D[] = [];
  for (const ouverture of document.ouvertures) {
    const mur = murs.get(ouverture.murId);
    if (!mur) continue;
    const half = mur.epaisseurMm / 2;
    const length = wallLength(mur) || 1;
    const normal = { x: -(mur.b.y - mur.a.y) / length, y: (mur.b.x - mur.a.x) / length };
    for (const offset of [ouverture.decalageMm, ouverture.decalageMm + ouverture.largeurMm]) {
      const p = pointAlongWall(mur, offset);
      openingPoints.push(p, { x: p.x + normal.x * half, y: p.y + normal.y * half }, { x: p.x - normal.x * half, y: p.y - normal.y * half });
    }
  }
  return { corners, faces, openingPoints };
}
