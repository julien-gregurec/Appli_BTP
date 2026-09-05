"use client";

/**
 * Écran EXPORTER (lot intégration Atelier/Export) : ouvre un tracé enregistré, flush
 * l'autosave en attente, assemble le `ChantierExportDocument` via l'adaptateur réel et
 * expose le contrôle pré-export, le choix de format et la génération/partage.
 *
 * Ne dépend d'aucune fixture : `projectId` vient de la route, le projet vient du
 * repository Atelier existant (`useAtelierPersistence`), jamais d'un jeu de données figé.
 *
 * ATELIER-MODELID-ENGINE-B-BRIDGE-V1 §7 : la géométrie remise à l'adaptateur est celle que
 * le moteur résout depuis `modelId` + `modelParams` du projet. Le composant ne calcule
 * rien — il appelle `resolveTracingProjectModel` puis passe le résultat tel quel.
 */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAtelierPersistence } from "@/lib/tracing/use-atelier-autosave";
import type { TracingProject } from "@/lib/tracing/project";
import { tracingProjectToChantierExportDocument } from "@/lib/exports/atelier-export-adapter";
import { resolvedAtelierGeometry } from "@/lib/exports/atelier-resolved-geometry";
import { resolveTracingProjectModel } from "@/lib/tracing/model-resolver";
import { ModelResolutionCard } from "@/components/atelier/model/ModelResolutionCard";
import { chantierExportCapabilities, type ChantierExportFormat } from "@/lib/exports/chantier-export-bus";
import { PreExportReportView } from "@/components/atelier/export/PreExportReportView";
import { ExportFormatPicker } from "@/components/atelier/export/ExportFormatPicker";
import { ExportActions } from "@/components/atelier/export/ExportActions";
import { useAccount } from "./AccountProvider";
import { Brand } from "./HomeDashboard";

/** Statut de la lecture asynchrone du projet — `available`/`ready` restent dérivés du hook, jamais dupliqués ici. */
type LoadState =
  | { status: "loading" }
  | { status: "not-found" }
  | { status: "error"; message: string }
  | { status: "ready"; project: TracingProject };

export function AtelierExportWorkspace() {
  const { activeCompany } = useAccount();
  const persistence = useAtelierPersistence(activeCompany?.id ?? null);
  const { ready, available, repository, flushAutosave } = persistence;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [format, setFormat] = useState<ChantierExportFormat>("pdf");

  useEffect(() => {
    if (!available || !repository) return;
    let cancelled = false;
    void (async () => {
      // Identifiant du tracé lu côté client (?projectId=<id>), comme /atelier/nouveau?reprendre=<id> —
      // jamais un segment de route dynamique, incompatible avec l'export statique natif.
      const projectId = new URLSearchParams(window.location.search).get("projectId");
      if (!projectId) {
        if (!cancelled) setState({ status: "error", message: "Aucun tracé indiqué : ouvrez l’export depuis l’Atelier." });
        return;
      }
      try {
        // §10 — s'assurer qu'aucune modification en attente n'est perdue avant de lire le projet.
        await flushAutosave();
        const project = await repository.get(projectId);
        if (cancelled) return;
        if (!project) {
          setState({ status: "not-found" });
          return;
        }
        setState({ status: "ready", project });
      } catch (cause) {
        if (cancelled) return;
        setState({ status: "error", message: cause instanceof Error ? cause.message : "Chargement du tracé impossible." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [available, repository, flushAutosave]);

  // Résolution du modèle du projet par le moteur — jamais pendant le rendu d'un enfant,
  // jamais dupliquée : une seule fois ici, puis partagée par la carte d'état et l'export.
  const resolution = useMemo(
    () => (state.status === "ready" ? resolveTracingProjectModel(state.project) : null),
    [state],
  );

  const document = useMemo(() => {
    if (state.status !== "ready" || !resolution) return null;
    try {
      return tracingProjectToChantierExportDocument(state.project, resolvedAtelierGeometry(resolution) ?? {});
    } catch {
      // §10 — un document inassemblable ne doit jamais faire tomber l'écran : la carte de
      // modèle et le message ci-dessous restent affichés.
      return null;
    }
  }, [state, resolution]);
  const capabilities = useMemo(() => (document ? chantierExportCapabilities(document) : []), [document]);

  return (
    <main className="atelier-page">
      <header className="calculator-header shell">
        <Brand />
        <Link href="/atelier" className="all-tools">
          Atelier <span>×</span>
        </Link>
      </header>

      <section className="atelier-hero">
        <div className="shell">
          <p className="eyebrow">EXPORT CHANTIER</p>
          <h1>{state.status === "ready" ? state.project.name : "Exporter le tracé"}</h1>
          <p>Contrôle avant export, choix du format, génération et partage — depuis votre tracé enregistré sur cet appareil.</p>
        </div>
      </section>

      <section className="shell atelier-section">
        {!ready ? (
          <p className="atelier-feedback" aria-live="polite">
            Chargement…
          </p>
        ) : !available ? (
          <div className="atelier-empty">
            <span aria-hidden="true">◇</span>
            <h2>Stockage local indisponible</h2>
            <p>Cet environnement ne permet pas de retrouver vos tracés.</p>
          </div>
        ) : (
          <>
            {state.status === "loading" && (
              <p className="atelier-feedback" aria-live="polite">
                Chargement du tracé…
              </p>
            )}

            {state.status === "not-found" && (
              <div className="atelier-empty">
                <span aria-hidden="true">◇</span>
                <h2>Tracé introuvable</h2>
                <p>Ce tracé n’existe plus sur cet appareil, ou l’adresse est incorrecte.</p>
                <Link href="/atelier" className="atelier-cta">
                  Retour à l’Atelier
                </Link>
              </div>
            )}

            {state.status === "error" && (
              <p className="atelier-feedback" role="alert">
                {state.message}
              </p>
            )}

            {resolution && <ModelResolutionCard resolution={resolution} />}

            {state.status === "ready" && !document && (
              <p className="atelier-feedback" role="alert">
                Ce tracé n’a pas pu être préparé pour l’export. Reprenez-le depuis l’Atelier pour corriger son modèle.
              </p>
            )}

            {document && (
              <>
                {document.preExport && <PreExportReportView report={document.preExport} />}
                <ExportFormatPicker capabilities={capabilities} value={format} onChange={setFormat} />
                <ExportActions
                  document={document}
                  format={format}
                  disabled={document.preExport ? !document.preExport.canExport : false}
                />
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}
