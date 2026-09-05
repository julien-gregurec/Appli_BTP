/**
 * Adaptateur props → affichage pour `ReportTableView` (§2, §9).
 *
 * Ne recalcule rien : délègue à `buildReportTable` / `formatReportRow` de `@/lib/chantier`
 * et se contente de mettre en forme le résultat. Les erreurs du backend (point non fini,
 * origine invalide) sont capturées et propagées proprement pour affichage (§13).
 */

import {
  buildReportTable,
  formatReportRow,
  type ReportPoint,
  type ReportRow,
} from "../../../lib/chantier";
import type { MeasurementOrigin } from "../../../lib/tracing/measurement-origin";
import type { Point2D } from "../../../lib/tracing/geometry-port";

export type ReportTableViewProps = {
  points: readonly ReportPoint[];
  origin?: Point2D;
  originLabel?: string;
  measurementOrigin?: MeasurementOrigin;
  /** Décimales des colonnes numériques (défaut 1, comme `formatReportRow`). */
  fractionDigits?: number;
  caption?: string;
};

export type ReportDisplayRow = {
  key: string;
  /** Cellules déjà formatées : [label, X, Y, distance, angle]. */
  cells: [string, string, string, string, string];
  raw: ReportRow;
};

export type ReportTableViewModel =
  | {
      ok: true;
      empty: boolean;
      originLabel: string;
      measurementOrigin?: MeasurementOrigin;
      columns: readonly { key: string; label: string; unit?: string; numeric: boolean }[];
      rows: ReportDisplayRow[];
    }
  | { ok: false; error: string };

export const REPORT_COLUMNS = [
  { key: "label", label: "Point", numeric: false },
  { key: "x", label: "X", unit: "mm", numeric: true },
  { key: "y", label: "Y", unit: "mm", numeric: true },
  { key: "distance", label: "Distance depuis O", unit: "mm", numeric: true },
  { key: "angle", label: "Angle", unit: "°", numeric: true },
] as const;

export function buildReportViewModel(props: ReportTableViewProps): ReportTableViewModel {
  const digits = props.fractionDigits ?? 1;
  try {
    const table = buildReportTable(props.points, {
      origin: props.origin,
      originLabel: props.originLabel,
      measurementOrigin: props.measurementOrigin,
    });
    const rows = table.rows.map((row, index) => ({
      key: `${row.label}-${index}`,
      cells: formatReportRow(row, digits),
      raw: row,
    }));
    return {
      ok: true,
      empty: rows.length === 0,
      originLabel: table.originLabel,
      // Badge d'origine affiché seulement si le contrat le fournit explicitement (§3) —
      // `buildReportTable` retombe sur "manual" par défaut, on ne présente pas ce défaut
      // comme une information vérifiée.
      measurementOrigin: props.measurementOrigin,
      columns: REPORT_COLUMNS,
      rows,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Erreur de calcul du report." };
  }
}
