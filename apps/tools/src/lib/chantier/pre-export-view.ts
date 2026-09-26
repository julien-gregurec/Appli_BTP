/**
 * Vue présentable de `PreExportReport` (§6 du lot exports chantier P0).
 *
 * Ne redéfinit aucun contrôle : regroupe simplement les anomalies déjà produites par
 * `runPreExportChecks` (`pre-export-check.ts`) pour un affichage UI et pour le blocage
 * du bus d'export.
 *
 * Règle : ERROR bloque l'export, WARNING l'autorise avec avertissement, INFO est indicatif.
 */

import type { CheckIssue, CheckSeverity, PreExportReport } from "./pre-export-check";

export type PreExportViewModel = {
  canExport: boolean;
  headline: string;
  bySeverity: Record<CheckSeverity, CheckIssue[]>;
  counts: Record<CheckSeverity, number>;
};

const HEADLINES: Record<"blocked" | "warning" | "clean", string> = {
  blocked: "Export bloqué : au moins une erreur doit être corrigée.",
  warning: "Export autorisé, avec avertissement.",
  clean: "Aucune anomalie détectée avant export.",
};

export function toPreExportViewModel(report: PreExportReport): PreExportViewModel {
  const bySeverity: Record<CheckSeverity, CheckIssue[]> = { error: [], warning: [], info: [] };
  for (const issue of report.issues) bySeverity[issue.severity].push(issue);

  const headline = report.errors > 0 ? HEADLINES.blocked : report.warnings > 0 ? HEADLINES.warning : HEADLINES.clean;

  return {
    canExport: report.canExport,
    headline,
    bySeverity,
    counts: { error: report.errors, warning: report.warnings, info: report.infos },
  };
}
