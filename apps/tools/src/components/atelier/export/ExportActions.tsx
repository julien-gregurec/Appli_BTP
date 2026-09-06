"use client";

import { useState } from "react";
import {
  downloadExportedFile,
  exportChantier,
  shareExportedFile,
  type ChantierExportFormat,
  type ChantierExportResult,
} from "@/lib/exports/chantier-export-bus";
import type { ChantierExportDocument } from "@/lib/exports/chantier-document";
import type { ChantierExportOptions } from "@/lib/exports/chantier-export-bus";

/**
 * Actions d'export (§13, §9 partage). Composant isolé : reçoit le `ChantierExportDocument`
 * en props, ne lit ni le dépôt `TracingProject`, ni le moteur géométrique, ni Supabase.
 */
export function ExportActions({
  document,
  format,
  disabled,
  options,
  onExported,
  onError,
}: {
  document: ChantierExportDocument;
  format: ChantierExportFormat;
  disabled?: boolean;
  options?: ChantierExportOptions;
  onExported?: (result: ChantierExportResult) => void;
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState<"none" | "download" | "share">("none");
  const [feedback, setFeedback] = useState("");
  // §18 — les approximations introduites par le format (ellipse → polyligne DXF…) doivent
  // être visibles par l'utilisateur : un DXF approché ne doit jamais passer pour exact.
  const [approximations, setApproximations] = useState<readonly string[]>([]);

  async function run(kind: "download" | "share") {
    setBusy(kind);
    setFeedback("");
    setApproximations([]);
    try {
      const result = await exportChantier(document, format, options);
      setApproximations(result.approximations);
      onExported?.(result);
      if (kind === "download") {
        await downloadExportedFile(result);
        setFeedback("Fichier généré et téléchargé.");
      } else {
        const outcome = await shareExportedFile(result, `ELSATIA Tools — ${document.project.name}`, document.project.siteName ?? document.project.name);
        setFeedback(outcome === "download" ? "Partage indisponible : fichier téléchargé." : "Feuille de partage ouverte.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export impossible.";
      setFeedback(message);
      onError?.(message);
    } finally {
      setBusy("none");
    }
  }

  return (
    <div className="atelier-export-actions">
      <button type="button" className="atelier-export-action-button" disabled={disabled || busy !== "none"} onClick={() => void run("download")}>
        {busy === "download" ? "Génération…" : "Télécharger"}
      </button>
      <button type="button" className="atelier-export-action-button is-secondary" disabled={disabled || busy !== "none"} onClick={() => void run("share")}>
        {busy === "share" ? "Génération…" : "Partager"}
      </button>
      {feedback && <p className="atelier-export-feedback" role="status" aria-live="polite">{feedback}</p>}
      {approximations.length > 0 && (
        <div className="atelier-export-approximations" role="note">
          <p>Approximations de ce format :</p>
          <ul>
            {approximations.map((approximation) => (
              <li key={approximation}>{approximation}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
