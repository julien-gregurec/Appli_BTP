import { chantierExportFormatLabel, type ChantierExportCapability, type ChantierExportFormat } from "@/lib/exports/chantier-export-bus";

/**
 * Sélecteur de format d'export (§13). Composant isolé, props uniquement : les capacités
 * (`chantierExportCapabilities`) sont calculées par l'appelant à partir du document, ce
 * composant ne connaît ni `TracingProject`, ni le moteur géométrique, ni Supabase.
 */
export function ExportFormatPicker({
  capabilities,
  value,
  onChange,
}: {
  capabilities: readonly ChantierExportCapability[];
  value: ChantierExportFormat;
  onChange: (format: ChantierExportFormat) => void;
}) {
  return (
    <div className="atelier-export-format-picker" role="radiogroup" aria-label="Format d'export">
      {capabilities.map((capability) => (
        <button
          key={capability.format}
          type="button"
          role="radio"
          aria-checked={value === capability.format}
          className={`atelier-export-format-option ${value === capability.format ? "is-selected" : ""}`}
          disabled={!capability.ready}
          title={capability.reason}
          onClick={() => onChange(capability.format)}
        >
          <span>{chantierExportFormatLabel(capability.format)}</span>
          {!capability.ready && <small>{capability.reason}</small>}
        </button>
      ))}
    </div>
  );
}
