/**
 * Adaptateur props → affichage pour `NomenclatureTable` (§5, §9).
 *
 * Trois sources d'entrée possibles, jamais recombinées ici :
 *   - `lines`      : nomenclature déjà construite en amont ;
 *   - `input`      : agrégat brut → `buildNomenclature` ;
 *   - `quantities` : quantités d'une `ShapeGeometry` du moteur → `nomenclatureFromQuantities`.
 *
 * La colonne « quantité à prévoir » n'apparaît que si une marge est fournie ; elle
 * applique `applyMargin` à la quantité affichée (même arithmétique base + %). La quantité
 * géométrique d'origine (`quantity`) n'est jamais modifiée (§6).
 */

import {
  applyMargin,
  buildNomenclature,
  nomenclatureFromQuantities,
  type MarginChoice,
  type MaterialLine,
  type NomenclatureInput,
} from "../../../lib/chantier";
import type { Quantity } from "../../../lib/geometry/shape-model";

export type NomenclatureTableProps = {
  lines?: readonly MaterialLine[];
  input?: NomenclatureInput;
  quantities?: readonly Quantity[];
  /** Ajoute une colonne « Quantité à prévoir » (marge appliquée à la quantité affichée). */
  margin?: MarginChoice;
};

export type NomenclatureDisplayLine = MaterialLine & {
  /** Quantité avec marge, présente seulement si une marge > 0 est demandée. */
  withMargin?: number;
};

export type NomenclatureViewModel =
  | {
      ok: true;
      empty: boolean;
      hasMarginColumn: boolean;
      lines: NomenclatureDisplayLine[];
    }
  | { ok: false; error: string };

function resolveLines(props: NomenclatureTableProps): MaterialLine[] {
  const sources = [props.lines, props.input, props.quantities].filter((value) => value !== undefined);
  if (sources.length > 1) {
    throw new Error("Fournir une seule source de nomenclature (lines, input ou quantities).");
  }
  if (props.lines) return [...props.lines];
  if (props.quantities) return nomenclatureFromQuantities(props.quantities);
  if (props.input) return buildNomenclature(props.input);
  return [];
}

export function buildNomenclatureViewModel(props: NomenclatureTableProps): NomenclatureViewModel {
  try {
    const lines = resolveLines(props);
    const marginActive = props.margin !== undefined && props.margin.percent > 0;
    const display: NomenclatureDisplayLine[] = lines.map((line) => {
      if (!marginActive || !props.margin) return { ...line };
      const breakdown = applyMargin(line.quantity, props.margin);
      return { ...line, withMargin: Math.round(breakdown.withMarginMm * 100) / 100 };
    });
    return { ok: true, empty: display.length === 0, hasMarginColumn: marginActive, lines: display };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Erreur de construction de la nomenclature.",
    };
  }
}
