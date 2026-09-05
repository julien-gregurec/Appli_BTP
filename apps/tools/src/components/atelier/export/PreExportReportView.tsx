import type { CheckSeverity, PreExportReport } from "@/lib/chantier/pre-export-check";
import { toPreExportViewModel } from "@/lib/chantier/pre-export-view";

const SEVERITY_LABEL: Record<CheckSeverity, string> = { error: "Erreur", warning: "Avertissement", info: "Information" };
const SEVERITY_ORDER: readonly CheckSeverity[] = ["error", "warning", "info"];

/**
 * Vue de contrôle avant export (§6). Composant isolé : ne dépend que du `PreExportReport`
 * fourni en props — ni du dépôt `TracingProject`, ni du moteur géométrique, ni de Supabase.
 */
export function PreExportReportView({ report }: { report: PreExportReport }) {
  const view = toPreExportViewModel(report);
  return (
    <section className="atelier-export-preflight" aria-live="polite">
      <p className={`atelier-export-preflight-headline ${view.canExport ? (view.counts.warning > 0 ? "is-warning" : "is-clean") : "is-blocked"}`}>
        {view.headline}
      </p>
      {SEVERITY_ORDER.filter((severity) => view.bySeverity[severity].length > 0).map((severity) => (
        <div key={severity} className="atelier-export-preflight-group">
          <strong>{SEVERITY_LABEL[severity]} ({view.bySeverity[severity].length})</strong>
          <ul>
            {view.bySeverity[severity].map((issue) => (
              <li key={issue.code} className={`atelier-export-issue is-${severity}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}
