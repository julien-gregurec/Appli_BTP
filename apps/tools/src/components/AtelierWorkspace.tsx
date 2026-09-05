"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { describeTracingProject, type TracingProjectSummary } from "@/lib/tracing/atelier";
import { evaluateDraftRecovery, type TracingDraftPointer } from "@/lib/tracing/draft";
import { useAtelierPersistence } from "@/lib/tracing/use-atelier-autosave";
import { useAccount } from "./AccountProvider";
import { Brand } from "./HomeDashboard";

type DraftState = { pointer: TracingDraftPointer; name: string } | null;

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

export function AtelierWorkspace() {
  const { activeCompany } = useAccount();
  const persistence = useAtelierPersistence(activeCompany?.id ?? null);
  const { ready, available, repository, draftStore } = persistence;

  const [projects, setProjects] = useState<TracingProjectSummary[] | null>(null);
  const [draft, setDraft] = useState<DraftState>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!repository) return;
    try {
      const list = await repository.list();
      setProjects(list.map(describeTracingProject));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Lecture des tracés impossible.");
      setProjects([]);
    }
  }, [repository]);

  useEffect(() => {
    if (!available || !repository) return;
    let cancelled = false;
    void (async () => {
      await refresh();
      if (cancelled) return;
      const pointer = draftStore?.read() ?? null;
      if (!pointer) return;
      const project = await repository.get(pointer.projectId).catch(() => null);
      const recovery = evaluateDraftRecovery(pointer, project, Date.now());
      if (cancelled) return;
      if (recovery.status === "recoverable") {
        setDraft({ pointer, name: recovery.project.name });
      } else if (recovery.status === "stale") {
        draftStore?.clear();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [available, repository, draftStore, refresh]);

  const ignoreDraft = useCallback(() => {
    if (draft && draftStore) draftStore.write({ ...draft.pointer, closedCleanly: true });
    setDraft(null);
  }, [draft, draftStore]);

  return (
    <main className="atelier-page">
      <header className="calculator-header shell">
        <Brand />
        <Link href="/" className="all-tools">
          Accueil <span>×</span>
        </Link>
      </header>

      <section className="atelier-hero">
        <div className="shell">
          <p className="eyebrow">ATELIER DE TRAÇAGE</p>
          <h1>Vos tracés d’ouvrage</h1>
          <p>Chaque tracé est enregistré sur cet appareil, en continu. Aucun compte requis.</p>
        </div>
      </section>

      <section className="shell atelier-section">
        <div className="atelier-actions">
          <Link href="/atelier/nouveau" className="atelier-cta">
            + Nouveau tracé
          </Link>
          <Link href="/projets" className="atelier-cta ghost">
            Mes projets d’outils
          </Link>
        </div>

        {draft && (
          <div className="atelier-draft" role="status">
            <p>Un tracé non terminé a été retrouvé{draft.name ? ` : « ${draft.name} »` : ""}.</p>
            <Link
              href={`/atelier/nouveau?reprendre=${encodeURIComponent(draft.pointer.projectId)}`}
              className="atelier-cta"
              onClick={() => setDraft(null)}
            >
              Reprendre
            </Link>
            <button type="button" onClick={ignoreDraft}>
              Ignorer
            </button>
          </div>
        )}
      </section>

      <section className="shell atelier-section">
        <p className="eyebrow">TRACÉS RÉCENTS</p>
        {error && <p className="atelier-feedback">{error}</p>}

        {!ready ? (
          <p className="atelier-feedback" aria-live="polite">
            Chargement…
          </p>
        ) : !available ? (
          <div className="atelier-empty">
            <span aria-hidden="true">◇</span>
            <h2>Stockage local indisponible</h2>
            <p>Cet environnement ne permet pas d’enregistrer des tracés localement.</p>
          </div>
        ) : projects === null ? (
          <p className="atelier-feedback" aria-live="polite">
            Chargement…
          </p>
        ) : projects.length === 0 ? (
          <div className="atelier-empty">
            <span aria-hidden="true">◇</span>
            <h2>Aucun tracé pour l’instant</h2>
            <p>Créez votre premier tracé : il sera sauvegardé automatiquement.</p>
          </div>
        ) : (
          <div className="atelier-list">
            {projects.map((project) => (
              <article className="atelier-card" key={project.id}>
                <div>
                  <small>
                    {project.typeLabel}
                    {project.modelLabel ? ` · ${project.modelLabel}` : ""}
                    {project.startFromPhoto ? " · PHOTO" : ""}
                  </small>
                  <h2>{project.name}</h2>
                  {project.dimensionsLabel && <p className="atelier-meta">Pièce : {project.dimensionsLabel}</p>}
                  <time dateTime={project.updatedAt}>Modifié le {dateFormat.format(new Date(project.updatedAt))}</time>
                </div>
                <Link href={`/atelier/nouveau?reprendre=${encodeURIComponent(project.id)}`}>Reprendre</Link>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
