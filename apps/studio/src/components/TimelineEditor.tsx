"use client";
/* eslint-disable @next/next/no-img-element -- Private expiring preview, loaded only on request. */
import TemplateGallery from "./TemplateGallery";
import { useEffect, useState } from "react";
import {
  animationNames,
  transitionNames,
  type StudioProject,
  type StudioTimeline,
  type TimelineDocument,
  type StudioTimelineClip,
  type StudioMediaAsset,
} from "@elsatia/studio-domain";
async function api(path: string, data?: unknown) {
  const r = await fetch(path, {
    method: data === undefined ? "GET" : "POST",
    headers:
      data === undefined ? undefined : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    cache: "no-store",
  });
  const value = await r.json();
  if (!r.ok) throw Error(value.error ?? "Montage indisponible.");
  return value;
}
function ClipPreview({ asset }: { asset: StudioMediaAsset | undefined }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="montage-preview">
      {url && asset ? (
        asset.media_type === "image" ? (
          <img src={url} alt={asset.original_filename} />
        ) : (
          <video
            src={url}
            controls
            preload="metadata"
            aria-label={asset.original_filename}
          />
        )
      ) : (
        <span>{asset?.media_type === "video" ? "VIDÉO" : "PHOTO"}</span>
      )}
      {asset && (
        <button
          type="button"
          className="secondary"
          onClick={async () => {
            try {
              setUrl((await api(`/api/media/assets/${asset.id}/preview`)).url);
              setError("");
            } catch (e) {
              setError(e instanceof Error ? e.message : "Aperçu indisponible.");
            }
          }}
        >
          {url ? "Renouveler l’aperçu" : "Voir l’aperçu"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export default function TimelineEditor({
  project,
  canWrite,
  canDelete,
}: {
  project: string;
  canWrite: boolean;
  canDelete: boolean;
}) {
  const [projectInfo, setProjectInfo] = useState<StudioProject | null>(null);
  const [active, setActive] = useState<TimelineDocument | null>(null),
    [versions, setVersions] = useState<StudioTimeline[]>([]),
    [assets, setAssets] = useState<StudioMediaAsset[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(false),
    [drag, setDrag] = useState("");
  const endpoint = `/api/timelines/${project}`;
  async function load() {
    const [d, m] = await Promise.all([
      api(endpoint),
      api(`/api/projects/${project}/order`),
    ]);
    setActive(d.active);
    setProjectInfo(d.project);
    setVersions(d.versions);
    setAssets(m.assets);
    setLoaded(true);
  }
  useEffect(() => {
    let cancelled = false;
    Promise.all([api(endpoint), api(`/api/projects/${project}/order`)])
      .then(([d, m]) => {
        if (!cancelled) {
          setActive(d.active);
          setProjectInfo(d.project);
          setVersions(d.versions);
          setAssets(m.assets);
          setLoaded(true);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint, project]);
  async function command(data: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      await api(endpoint, {
        timeline: active?.id,
        revision: active?.revision,
        ...data,
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sauvegarde impossible.");
    } finally {
      setBusy(false);
    }
  }
  function move(source: string, target: string) {
    if (!active) return;
    const ids = active.clips.map((c) => c.id),
      from = ids.indexOf(source),
      to = ids.indexOf(target);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, source);
    void command({ action: "order", ids });
  }
  const available = assets.filter(
      (a) => a.upload_status === "ready" && !a.deleted_at,
    ),
    byId = new Map(assets.map((a) => [a.id, a]));
  return (
    <section
      className="card montage"
      aria-label="Montage"
      aria-busy={busy}
      data-loaded={loaded}
    >
      <h2>Montage</h2>
      <p>
        Choisissez un style puis ajustez les clips et les textes avant votre
        export MP4.
      </p>
      {error && (
        <>
          <p role="alert">{error}</p>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                await load();
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Chargement impossible.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            Recharger le montage
          </button>
        </>
      )}
      {!loaded && !error && <p role="status">Chargement du montage…</p>}
      {canWrite && loaded && projectInfo && (
        <TemplateGallery
          project={projectInfo}
          assets={available}
          busy={busy}
          active={!!active}
          initialTemplate={active?.presentation?.template.id}
          onGenerate={(template) =>
            void command({
              action: "generate",
              ...(template ? { template } : {}),
            })
          }
        />
      )}
      {active && (
        <>
          <p aria-label="Durée du montage">
            Cible :{" "}
            {active.target_duration_ms === null
              ? "Automatique"
              : `${active.target_duration_ms / 1000} s`}{" "}
            · Actuel : {active.total_duration_ms / 1000} s · Format{" "}
            {active.aspect_ratio}
          </p>
          {active.target_duration_ms !== null &&
            Math.abs(active.target_duration_ms - active.total_duration_ms) >
              250 && (
              <p role="status">
                Écart :{" "}
                {(active.total_duration_ms - active.target_duration_ms) / 1000}{" "}
                s. Ajustez la durée des clips ou ajoutez des médias pour
                atteindre la cible.
              </p>
            )}
          {active.excluded_assets > 0 && (
            <p>
              {active.excluded_assets} média(s) non prêt(s) exclu(s) lors de
              cette génération.
            </p>
          )}
          <label>
            Version du montage
            <select
              value={active.id}
              disabled={!canWrite || busy}
              onChange={(e) =>
                void command({ action: "activate", timeline: e.target.value })
              }
            >
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  Version {v.version} ·{" "}
                  {v.status === "modified" ? "modifiée" : "générée"}
                </option>
              ))}
            </select>
          </label>
          <ol className="montage-clips">
            {active.clips.map((c, i) => (
              <li
                className="montage-clip"
                key={`${c.id}-${active.revision}`}
                data-clip={c.id}
                draggable={canWrite && !busy}
                onDragStart={() => setDrag(c.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (canWrite && !busy) move(drag, c.id);
                }}
              >
                <h3>
                  {i + 1}.{" "}
                  {c.clip_type === "card"
                    ? c.metadata_json.card?.kind === "intro"
                      ? "Introduction"
                      : "Conclusion"
                    : (byId.get(c.asset_id ?? "")?.original_filename ??
                      "Média indisponible")}
                </h3>
                {c.clip_type !== "card" && !byId.has(c.asset_id ?? "") && (
                  <p role="alert">
                    Ce média a été retiré du projet. Retirez ce clip du montage.
                  </p>
                )}
                {c.asset_id && <ClipPreview asset={byId.get(c.asset_id)} />}
                {active.presentation?.overlays
                  .filter((o) => o.clip_key === c.metadata_json.key)
                  .map((o) => (
                    <form
                      key={o.id}
                      aria-label={`Texte ${o.id}`}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void command({
                          action: "text",
                          overlay: o.id,
                          text: new FormData(e.currentTarget).get("text"),
                        });
                      }}
                    >
                      <label>
                        Texte {o.font_role}
                        <textarea
                          name="text"
                          maxLength={500}
                          defaultValue={o.text}
                          disabled={!canWrite || busy}
                        />
                      </label>
                      {canWrite && (
                        <button disabled={busy}>Enregistrer le texte</button>
                      )}
                    </form>
                  ))}
                <p>
                  {c.clip_type === "card"
                    ? "Écran"
                    : c.clip_type === "image"
                      ? "Photo"
                      : "Vidéo"}{" "}
                  · {c.duration_ms / 1000} s ·{" "}
                  {transitionNames[c.transition_in]} ·{" "}
                  {c.clip_type === "card"
                    ? "Fond d’écran"
                    : c.clip_type === "image"
                      ? animationNames[c.animation_type]
                      : "Extrait vidéo"}
                </p>
                {canWrite && (
                  <>
                    <div className="row">
                      <button
                        disabled={busy || i === 0}
                        onClick={() => move(c.id, active.clips[i - 1].id)}
                        aria-label={`Monter le clip ${i + 1}`}
                      >
                        Monter
                      </button>
                      <button
                        disabled={busy || i === active.clips.length - 1}
                        onClick={() => move(c.id, active.clips[i + 1].id)}
                        aria-label={`Descendre le clip ${i + 1}`}
                      >
                        Descendre
                      </button>
                      <button
                        disabled={busy}
                        className="secondary"
                        onClick={() =>
                          void command({ action: "remove", clip: c.id })
                        }
                      >
                        Retirer le clip
                      </button>
                    </div>
                    <ClipForm
                      clip={c}
                      busy={busy}
                      save={(patch) =>
                        command({ action: "edit", clip: c.id, patch })
                      }
                    />
                  </>
                )}
              </li>
            ))}
          </ol>
          {active.clips.length === 0 && (
            <p>Aucun clip. Ajoutez un média ci-dessous.</p>
          )}
          {canWrite && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void command({ action: "add", asset: f.get("asset") });
              }}
            >
              <label>
                Ajouter un média au montage
                <select name="asset" required>
                  {available.map((a) => (
                    <option value={a.id} key={a.id}>
                      {a.original_filename}
                    </option>
                  ))}
                </select>
              </label>
              <button disabled={busy || available.length === 0}>
                Ajouter le clip
              </button>
            </form>
          )}
          {canDelete && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Supprimer cette version du montage ? Les médias sont conservés.",
                  )
                )
                  void command({ action: "delete" });
              }}
            >
              Supprimer cette version
            </button>
          )}
        </>
      )}
      {!active && loaded && (
        <p>
          Aucun montage actif.
          {versions.length > 0 && canWrite && (
            <button
              disabled={busy}
              onClick={() =>
                void command({ action: "activate", timeline: versions[0].id })
              }
            >
              Ouvrir la dernière version
            </button>
          )}
        </p>
      )}
    </section>
  );
}
function ClipForm({
  clip,
  busy,
  save,
}: {
  clip: StudioTimelineClip;
  busy: boolean;
  save: (patch: Record<string, unknown>) => Promise<void>;
}) {
  return (
    <form
      aria-label={`Modifier le clip ${clip.sort_order + 1}`}
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const patch: Record<string, unknown> = {
          transition_in: f.get("transition"),
          transition_duration_ms: Math.round(
            Number(f.get("transition_duration")) * 1000,
          ),
        };
        if (clip.clip_type !== "video") {
          patch.duration_ms = Math.round(Number(f.get("duration")) * 1000);
          if (clip.clip_type === "image")
            patch.animation_type = f.get("animation");
        } else {
          patch.source_start_ms = Math.round(Number(f.get("start")) * 1000);
          patch.source_end_ms = Math.round(Number(f.get("end")) * 1000);
        }
        void save(patch);
      }}
    >
      {clip.clip_type !== "video" ? (
        <>
          <label>
            {clip.clip_type === "card" ? "Durée écran (s)" : "Durée photo (s)"}
            <input
              name="duration"
              type="number"
              min="0.001"
              max="600"
              step="0.001"
              required
              defaultValue={clip.duration_ms / 1000}
            />
          </label>
          <label>
            Animation
            <select
              name="animation"
              disabled={clip.clip_type === "card"}
              defaultValue={clip.animation_type}
            >
              {Object.entries(animationNames).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </>
      ) : (
        <>
          <label>
            Début de l’extrait (s)
            <input
              name="start"
              type="number"
              min="0"
              step="0.001"
              required
              defaultValue={clip.source_start_ms / 1000}
            />
          </label>
          <label>
            Fin de l’extrait (s)
            <input
              name="end"
              type="number"
              min="0.001"
              step="0.001"
              required
              defaultValue={(clip.source_end_ms ?? 0) / 1000}
            />
          </label>
        </>
      )}
      <label>
        Transition
        <select name="transition" defaultValue={clip.transition_in}>
          {Object.entries(transitionNames).map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label>
        Durée transition (s)
        <input
          name="transition_duration"
          type="number"
          min="0"
          step="0.001"
          required
          defaultValue={clip.transition_duration_ms / 1000}
        />
      </label>
      <button disabled={busy}>Enregistrer le clip</button>
    </form>
  );
}
