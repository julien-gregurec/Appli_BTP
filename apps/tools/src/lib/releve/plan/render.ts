/**
 * Relevé Lot 5 — préparation du rendu du plan (pur, testable sans DOM).
 *
 * Unités et précision : le modèle est en MILLIMÈTRES (canonique Engine B et domaine Relevé).
 * Le terrain lit des cotes en mètres au centimètre (« 4,20 ») et saisit des longueurs en
 * centimètres (« 420 », décimales admises : « 420,5 » = 4 205 mm). Les angles sont saisis en
 * degrés (repère Y haut, sens trigonométrique, 0° = vers la droite).
 */
import type { PlanContour, PlanDocument, PlanMur, PlanOuverture } from "@elsatia/releve-domain";
import { PLAN_LIMITS } from "@elsatia/releve-domain";
import { boundsFromPoints, pointAtPolar, polarAngle } from "@/lib/geometry/engine/measure";
import type { BoundingBox2D, Point2D } from "@/lib/geometry/engine/types";
import type { ParsedNumber } from "../forms";
import { boxesOverlap, contourArea, openingSegment, wallBox, wallLength } from "./geometry";

// ── Formats ──────────────────────────────────────────────────────────────────

/** 4200 → « 4,20 m ». */
export function formatLongueurM(mm: number): string {
  return `${(Math.round(mm / 10) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m`;
}

/** 4205 → « 420,5 » (champ de saisie en centimètres). */
export function formatLongueurCm(mm: number | null): string {
  return mm === null ? "" : String(Math.round(mm) / 10).replace(".", ",");
}

function parseDecimal(input: string): number | null | undefined {
  const trimmed = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!trimmed) return null;
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return undefined;
  return Number(trimmed);
}

/** « 420 » / « 420,5 » (cm) → mm, bornes d'un mur (10 mm – 1 km). */
export function parseLongueurCm(input: string): ParsedNumber {
  const value = parseDecimal(input);
  if (value === undefined) return { ok: false, message: "Longueur en centimètres attendue (ex. 420)." };
  if (value === null) return { ok: true, value: null };
  const mm = Math.round(value * 10 * 10) / 10;
  if (mm < 10 || mm > 1_000_000) return { ok: false, message: "Longueur entre 1 cm et 1 km." };
  return { ok: true, value: mm };
}

/** Épaisseur en cm (« 20 ») → mm, bornée comme le serveur. */
export function parseEpaisseurCm(input: string): ParsedNumber {
  const value = parseDecimal(input);
  if (value === undefined || value === null) return { ok: false, message: "Épaisseur en centimètres attendue (ex. 20)." };
  const mm = Math.round(value * 10 * 10) / 10;
  if (!(mm > 0) || mm > PLAN_LIMITS.epaisseurMaxMm) return { ok: false, message: `Épaisseur entre 0 et ${PLAN_LIMITS.epaisseurMaxMm / 10} cm.` };
  return { ok: true, value: mm };
}

/** Angle en degrés (« 90 », « -45 », « 30,5 ») → degrés normalisés [0, 360). */
export function parseAngleDegres(input: string): ParsedNumber {
  const value = parseDecimal(input);
  if (value === undefined || value === null) return { ok: false, message: "Angle en degrés attendu (ex. 90)." };
  return { ok: true, value: ((value % 360) + 360) % 360 };
}

export function formatAngleDegres(degrees: number): string {
  return String(Math.round(degrees * 10) / 10).replace(".", ",");
}

export function formatSurfaceContour(contour: PlanContour): string {
  const mm2 = contour.surfaceMm2 ?? contourArea(contour);
  return `${(mm2 / 1_000_000).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m²`;
}

// ── Visibilité ───────────────────────────────────────────────────────────────

/** Murs dont l'emprise touche la zone visible : seuls ceux-là sont dessinés (500 murs, zoom fort). */
export function visibleWalls(murs: readonly PlanMur[], visible: BoundingBox2D): PlanMur[] {
  return murs.filter((mur) => boxesOverlap(wallBox(mur), visible));
}

// ── Cotes ────────────────────────────────────────────────────────────────────

export type DimensionLabel = { murId: string; text: string; at: Point2D; angleDegrees: number };

/**
 * Cote d'un mur, posée à côté de l'axe (décalée de la demi-épaisseur + marge), lisible à
 * l'endroit : l'angle est ramené dans ]-90°, 90°] (repère écran, Y vers le bas).
 */
export function wallDimension(mur: PlanMur, offsetWorld: number): DimensionLabel {
  const angle = polarAngle(mur.a, mur.b);
  const middle = { x: (mur.a.x + mur.b.x) / 2, y: (mur.a.y + mur.b.y) / 2 };
  const at = pointAtPolar(middle, mur.epaisseurMm / 2 + offsetWorld, angle + Math.PI / 2);
  let screenDegrees = (-angle * 180) / Math.PI;
  while (screenDegrees > 90) screenDegrees -= 180;
  while (screenDegrees <= -90) screenDegrees += 180;
  return { murId: mur.id, text: formatLongueurM(wallLength(mur)), at, angleDegrees: screenDegrees };
}

export type OverallDimensions = { bounds: BoundingBox2D; widthMm: number; heightMm: number };

/** Dimensions principales : encombrement hors tout des murs (épaisseurs comprises). */
export function overallDimensions(document: PlanDocument): OverallDimensions | null {
  if (document.murs.length === 0) return null;
  const points: Point2D[] = [];
  for (const mur of document.murs) {
    const box = wallBox(mur);
    points.push({ x: box.minX, y: box.minY }, { x: box.maxX, y: box.maxY });
  }
  const bounds = boundsFromPoints(points);
  return { bounds, widthMm: bounds.maxX - bounds.minX, heightMm: bounds.maxY - bounds.minY };
}

// ── Symboles d'ouverture ─────────────────────────────────────────────────────

export type OpeningSymbol = {
  /** Baie dans le mur (à « effacer » : trait couleur fond sur l'épaisseur du mur). */
  gap: { a: Point2D; b: Point2D };
  /** Traits du symbole (vantail, dormants, vitrage). */
  lines: { a: Point2D; b: Point2D }[];
  /** Arc de débattement d'une porte : centre, rayon, angles (radians, repère monde). */
  arc: { centre: Point2D; radius: number; start: number; end: number } | null;
};

export function openingSymbol(mur: PlanMur, ouverture: PlanOuverture): OpeningSymbol {
  const { start, end } = openingSegment(mur, ouverture);
  const angle = polarAngle(mur.a, mur.b);
  const normal = angle + Math.PI / 2;
  const half = mur.epaisseurMm / 2;
  const shift = (p: Point2D, d: number) => pointAtPolar(p, d, normal);
  const symbol: OpeningSymbol = { gap: { a: start, b: end }, lines: [], arc: null };
  const type = ouverture.typeOuverture;
  if (type === "porte" || type === "porte_fenetre") {
    const hinge = ouverture.sens === "droite" ? end : start;
    const other = ouverture.sens === "droite" ? start : end;
    const leafEnd = pointAtPolar(hinge, ouverture.largeurMm, normal);
    symbol.lines.push({ a: shift(hinge, half), b: shift(leafEnd, half) });
    const from = polarAngle(hinge, other);
    symbol.arc = { centre: shift(hinge, half), radius: ouverture.largeurMm, start: from, end: normal };
    if (type === "porte_fenetre") symbol.lines.push({ a: start, b: end });
  } else if (type === "fenetre" || type === "baie") {
    symbol.lines.push({ a: shift(start, half), b: shift(end, half) }, { a: shift(start, -half), b: shift(end, -half) }, { a: start, b: end });
  } else {
    // Passage, trémie : baie libre, jambages seulement.
    symbol.lines.push({ a: shift(start, half), b: shift(start, -half) }, { a: shift(end, half), b: shift(end, -half) });
  }
  return symbol;
}
