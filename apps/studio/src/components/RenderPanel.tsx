"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  renderErrorMessage,
  renderProfileLabel,
  renderStatusLabel,
} from "../lib/render-labels";
const terminal = ["completed", "failed", "cancelled"];
type Job = {
  id: string;
  timeline_id: string;
  timeline_revision: number;
  status: string;
  profile: string;
  width: number;
  height: number;
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
    [url, setUrl] = useState(""),
    [playing, setPlaying] = useState(""),
    [quality, setQuality] = useState<"standard" | "hd720">("standard");
  const renewals = useRef(new Map<string, number>());
  const [remoteState, setRemoteState] = useState<{
    timeline: string;
    revision: number;
    dirty: boolean;
  } | null>(null);
  const state = editorState ?? remoteState;
  const endpoint = `/api/renders/${project}`;
  const load = useCallback(async (): Promise<boolean> => {
    try {
      const r = await fetch(endpoint, { cache: "no-store" });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setRemoteState(d.active);
      setJobs(d.jobs);
      setOutputs(d.outputs);
      return (d.jobs as Job[]).some((j) => !terminal.includes(j.status));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rendus indisponibles.");
      return true;
    }
  }, [endpoint]);
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
        else {
          setUrl(d.url);
          setPlaying(String(body.output));
        }
      } else void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action refusée.");
    } finally {
      setBusy(false);
    }
  }
  // Fast while a job is active, slow when idle, paused while the tab is hidden.
  useEffect(() => {
    let stopped = false,
      timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const active = await load();
      if (stopped) return;
      timer = setTimeout(
        () => void tick(),
        document.visibilityState === "hidden" ? 20000 : active ? 1500 : 8000,
      );
    };
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      clearTimeout(timer);
      void tick();
    };
    void tick();
    document.addEventListener("visibilitychange", wake);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [load]);
  // The signed URL lasts one minute: renew it (twice at most) when playback fails after expiry.
  function renewPlayback() {
    const n = renewals.current.get(playing) ?? 0;
    if (!playing || n >= 2) return;
    renewals.current.set(playing, n + 1);
    void action({ action: "preview", output: playing });
  }
  return (
    <section className="card" aria-label="Vidéo exportée">
      <h2>Vidéo exportée</h2>
      {canWrite && (
        <label>
          Qualité de la vidéo
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value as typeof quality)}
          >
            <option value="standard">Haute qualité (1080)</option>
            <option value="hd720">Rapide (720)</option>
          </select>
        </label>
      )}
      {canWrite && (
        <button
          disabled={busy || editorState?.dirty}
          onClick={() =>
            void action({
              action: "create",
              requestId: crypto.randomUUID(),
              quality,
            })
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
            {renderStatusLabel(j.status)} · {j.progress_percent} %
          </p>
          <p>{renderProfileLabel(j.profile, j.width, j.height)}</p>
          <progress
            aria-label="Progression du rendu"
            max="100"
            value={j.progress_percent}
          />
          {j.error_code && <p>{renderErrorMessage(j.error_code)}</p>}
          {canWrite &&
            !terminal.includes(j.status) && (
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
                  quality: j.profile === "hd720" ? "hd720" : "standard",
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
          onError={renewPlayback}
          style={{ maxWidth: "100%" }}
        />
      )}
    </section>
  );
}
