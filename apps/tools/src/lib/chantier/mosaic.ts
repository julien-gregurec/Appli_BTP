/**
 * §16 à §18 — Gabarit 1:1, impression mosaïque, plan de mosaïque.
 *
 * Découpe un motif exprimé en millimètres réels en feuilles imprimables, avec recouvrement
 * et repères d'assemblage. Toute la géométrie de pagination est ici, en fonctions pures ;
 * le rendu PDF consomme ce plan (`exports/chantier-pdf.ts`).
 */

import { witnessDimension, type WitnessDimension } from "./witness";

export type PaperFormat = "A4" | "A3" | "A2" | "A1" | "A0";
export type PaperOrientation = "portrait" | "landscape";

/** Dimensions ISO 216 en millimètres, orientation portrait (largeur × hauteur). */
export const PAPER_SIZES_MM: Record<PaperFormat, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A3: { width: 297, height: 420 },
  A2: { width: 420, height: 594 },
  A1: { width: 594, height: 841 },
  A0: { width: 841, height: 1189 },
};

export const DEFAULT_MOSAIC_MARGIN_MM = 10;
export const DEFAULT_MOSAIC_OVERLAP_MM = 10;

export type MosaicInput = {
  contentWidthMm: number;
  contentHeightMm: number;
  format: PaperFormat;
  orientation?: PaperOrientation;
  /** Marge non imprimable de chaque côté de la feuille. */
  marginMm?: number;
  /** Recouvrement entre deux feuilles adjacentes. */
  overlapMm?: number;
  witnessMm?: number;
};

export type MosaicTile = {
  index: number; // 1-based
  total: number;
  row: number; // 0-based
  column: number; // 0-based
  label: string; // "A1", "B3", ...
  /** Décalage (mm) du coin supérieur-gauche de la zone utile de cette feuille dans le motif. */
  contentXMm: number;
  contentYMm: number;
  /** Portion réellement couverte par cette feuille (≤ zone utile). */
  contentWidthMm: number;
  contentHeightMm: number;
  overlapRightMm: number;
  overlapBottomMm: number;
};

export type MosaicPlan = {
  format: PaperFormat;
  orientation: PaperOrientation;
  sheetWidthMm: number;
  sheetHeightMm: number;
  marginMm: number;
  overlapMm: number;
  usableWidthMm: number;
  usableHeightMm: number;
  columns: number;
  rows: number;
  sheetCount: number;
  fitsSingleSheet: boolean;
  tiles: MosaicTile[];
  /** Grille de libellés pour la page « plan de mosaïque » (§18). */
  assembly: string[][];
  witness: WitnessDimension;
};

function rowLabel(row: number): string {
  let value = row;
  let label = "";
  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);
  return label;
}

function tilesAlong(contentMm: number, usableMm: number, overlapMm: number): number {
  if (contentMm <= usableMm) return 1;
  const advance = usableMm - overlapMm;
  if (advance <= 0) throw new Error("Le recouvrement doit être inférieur à la zone utile de la feuille.");
  return Math.ceil((contentMm - usableMm) / advance) + 1;
}

export function planMosaic(input: MosaicInput): MosaicPlan {
  const { contentWidthMm, contentHeightMm } = input;
  if (!Number.isFinite(contentWidthMm) || contentWidthMm <= 0 || !Number.isFinite(contentHeightMm) || contentHeightMm <= 0) {
    throw new Error("Les dimensions du motif doivent être supérieures à 0.");
  }
  const orientation: PaperOrientation = input.orientation ?? "portrait";
  const base = PAPER_SIZES_MM[input.format];
  const sheetWidthMm = orientation === "portrait" ? base.width : base.height;
  const sheetHeightMm = orientation === "portrait" ? base.height : base.width;

  const marginMm = input.marginMm ?? DEFAULT_MOSAIC_MARGIN_MM;
  const overlapMm = input.overlapMm ?? DEFAULT_MOSAIC_OVERLAP_MM;
  if (!Number.isFinite(marginMm) || marginMm < 0) throw new Error("La marge doit être positive.");
  if (!Number.isFinite(overlapMm) || overlapMm < 0) throw new Error("Le recouvrement doit être positif.");

  const usableWidthMm = sheetWidthMm - 2 * marginMm;
  const usableHeightMm = sheetHeightMm - 2 * marginMm;
  if (usableWidthMm <= 0 || usableHeightMm <= 0) throw new Error("La marge est trop grande pour ce format de papier.");

  const columns = tilesAlong(contentWidthMm, usableWidthMm, overlapMm);
  const rows = tilesAlong(contentHeightMm, usableHeightMm, overlapMm);
  const advanceX = usableWidthMm - overlapMm;
  const advanceY = usableHeightMm - overlapMm;

  const tiles: MosaicTile[] = [];
  const assembly: string[][] = [];
  const total = columns * rows;
  for (let row = 0; row < rows; row++) {
    const assemblyRow: string[] = [];
    for (let column = 0; column < columns; column++) {
      const label = `${rowLabel(row)}${column + 1}`;
      assemblyRow.push(label);
      const contentXMm = columns === 1 ? 0 : Math.min(column * advanceX, Math.max(0, contentWidthMm - usableWidthMm));
      const contentYMm = rows === 1 ? 0 : Math.min(row * advanceY, Math.max(0, contentHeightMm - usableHeightMm));
      const tileWidthMm = Math.min(usableWidthMm, contentWidthMm - contentXMm);
      const tileHeightMm = Math.min(usableHeightMm, contentHeightMm - contentYMm);
      tiles.push({
        index: row * columns + column + 1,
        total,
        row,
        column,
        label,
        contentXMm,
        contentYMm,
        contentWidthMm: tileWidthMm,
        contentHeightMm: tileHeightMm,
        overlapRightMm: column < columns - 1 ? overlapMm : 0,
        overlapBottomMm: row < rows - 1 ? overlapMm : 0,
      });
    }
    assembly.push(assemblyRow);
  }

  return {
    format: input.format,
    orientation,
    sheetWidthMm,
    sheetHeightMm,
    marginMm,
    overlapMm,
    usableWidthMm,
    usableHeightMm,
    columns,
    rows,
    sheetCount: total,
    fitsSingleSheet: total === 1,
    tiles,
    assembly,
    witness: witnessDimension(input.witnessMm),
  };
}

/** Libellé « Feuille 3 / 16 » (§17). */
export function sheetCaption(tile: MosaicTile): string {
  return `Feuille ${tile.index} / ${tile.total}`;
}
