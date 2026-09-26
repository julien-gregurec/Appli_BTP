"use client";
import { useEffect, useState } from "react";
type Job = {
  id: string;
  timeline_id: string;
  timeline_revision: number;
  status: string;
  progress_percent: number;
  error_code: string | null;
  error_message: string | null;
  retry_count: number;
};
type Output = { id: string; render_job_id: string };
export default function RenderPanel({
  project,
  canWrite,
  editorState,
}: {
  project: string;
  canWrite: boolean;
  editorState?: { timeline: string; revision: number; dirty: boolean };
}) {
  const [jobs, setJobs] = useState<Job[]>([]),
    [outputs, setOutputs] = useState<Output[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [url, setUrl] = useState("");
  const [remoteState, setRemoteState] = useState<{
    timeline: string;
    revision: number;
    dirty: boolean;
  } | null>(null);
  const state = editorState ?? remoteState;
  const endpoint = `/api/renders/${project}`;
  async function action(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          body.action === "create" && editorState
            ? {
                ...body,
                timeline: editorState.timeline,
                revision: editorState.revision,
              }
            : body,
        ),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      if (d.url) {
        if (body.download) window.location.assign(d.url);
        else setUrl(d.url);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action refusée.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const r = await fetch(endpoint, { cache: "no-store" });
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!stopped) {
          setRemoteState(d.active);
          setJobs(d.jobs);
          setOutputs(d.outputs);
        }
      } catch (e) {
        if (!stopped)
          setError(e instanceof Error ? e.message : "Rendus indisponibles.");
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 1500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [endpoint]);
  return (
    <section className="card" aria-label="Vidéo exportée">
      <h2>Vidéo exportée</h2>
      {canWrite && (
        <button
          disabled={busy || editorState?.dirty}
          onClick={() =>
            void action({ action: "create", requestId: crypto.randomUUID() })
          }
        >
          Créer la vidéo
        </button>
      )}
      {canWrite && editorState && (
        <button
          disabled={busy || editorState.dirty}
          onClick={() =>
            void action({
              action: "create",
              requestId: crypto.randomUUID(),
              preview: true,
            })
          }
        >
          Générer un aperçu fidèle
        </button>
      )}
      {state &&
        (state.dirty ||
          !jobs.some(
            (j) =>
              j.status === "completed" &&
              j.timeline_id === state.timeline &&
              j.timeline_revision === state.revision,
          )) && (
          <p role="status">
            La vidéo doit être régénérée pour inclure vos dernières
            modifications.
          </p>
        )}
      {error && <p role="alert">{error}</p>}
      {jobs.map((j) => (
        <div key={j.id} data-render-job={j.id}>
          <p role="status">
            {state &&
              (state.dirty ||
                j.timeline_id !== state.timeline ||
                j.timeline_revision !== state.revision) &&
              "Ancienne version · "}
            {j.status} · {j.progress_percent} %
          </p>
          <progress
            aria-label="Progression du rendu"
            max="100"
            value={j.progress_percent}
          />
          {j.error_code && (
            <p>
              {j.error_code} — {j.error_message}
            </p>
          )}
          {canWrite &&
            !["completed", "failed", "cancelled"].includes(j.status) && (
              <button
                disabled={busy}
                onClick={() => void action({ action: "cancel", job: j.id })}
              >
                Annuler le rendu
              </button>
            )}
          {canWrite && j.status === "failed" && j.retry_count < 3 && (
            <button
              disabled={busy || editorState?.dirty}
              onClick={() =>
                void action({
                  action: "create",
                  requestId: crypto.randomUUID(),
                  retry: j.id,
                })
              }
            >
              Réessayer le rendu
            </button>
          )}
          {outputs
            .filter((o) => o.render_job_id === j.id)
            .map((o) => (
              <div key={o.id}>
                <button
                  onClick={() =>
                    void action({ action: "preview", output: o.id })
                  }
                >
                  Voir la vidéo
                </button>
                <button
                  onClick={() =>
                    void action({
                      action: "preview",
                      output: o.id,
                      download: true,
                    })
                  }
                >
                  Télécharger
                </button>
              </div>
            ))}
        </div>
      ))}
      {url && (
        <video
          src={url}
          controls
          preload="metadata"
          aria-label="Vidéo finale"
          style={{ maxWidth: "100%" }}
        />
      )}
    </section>
  );
}
