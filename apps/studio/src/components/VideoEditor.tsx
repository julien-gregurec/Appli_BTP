"use client";
/* eslint-disable @next/next/no-img-element -- Tiny in-memory thumbnails of visited private media only. */
import AnalysisPanel from "./AnalysisPanel";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  animationNames,
  transitionNames,
  fontRoles,
  applyEditorCommand,
  editorHistory,
  editorStep,
  editorUndo,
  editorRedo,
  editorFingerprint,
  type EditorCommand,
  type EditorHistory,
  type TimelineDocument,
  type StudioMediaAsset,
  type TextOverlay,
  type StudioTimelineClip,
  type StudioTimeline,
} from "@elsatia/studio-domain";
import {
  EditorAutosave,
  EditorSaveError,
  type SaveStatus,
} from "../lib/editor-autosave";
import EditorPreview, { editorTime } from "./EditorPreview";
import RenderPanel from "./RenderPanel";

async function request(project: string, body?: unknown) {
  const r = await fetch(`/api/timelines/${project}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const d = await r.json();
  if (!r.ok)
    throw new EditorSaveError(d.error ?? "Sauvegarde indisponible.", r.status);
  return d;
}
export default function VideoEditor({
  initial,
  assets,
  canWrite,
  analysisEnabled = false,
}: {
  initial: TimelineDocument;
  assets: StudioMediaAsset[];
  canWrite: boolean;
  analysisEnabled?: boolean;
}) {
  const [history, setHistory] = useState<EditorHistory>(() =>
    editorHistory(initial),
  );
  const [selected, setSelected] = useState(initial.clips[0]?.id ?? ""),
    [time, setTime] = useState(0),
    [playing, setPlaying] = useState(false);
  const [saveStatus, setStatus] = useState<SaveStatus>("saved"),
    [revision, setRevision] = useState(initial.revision),
    [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState(() =>
    editorFingerprint(initial),
  );
  const volumes = useRef(new Map<string, number>());
  const [versions, setVersions] = useState<StudioTimeline[]>([initial]);
  const [scroll, setScroll] = useState(0),
    [drag, setDrag] = useState(""),
    [media, setMedia] = useState(
      assets.find((a) => a.upload_status === "ready")?.id ?? "",
    ),
    [insertion, setInsertion] = useState("after");
  const save = useRef<EditorAutosave | null>(null),
    latest = useRef(history.present),
    strip = useRef<HTMLDivElement>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});
  const thumbnail = useCallback(
    (id: string, url: string) =>
      setThumbnails((old) =>
        old[id]
          ? old
          : Object.fromEntries([...Object.entries(old).slice(-31), [id, url]]),
      ),
    [],
  );
  const doc = history.present,
    clip = doc.clips.find((c) => c.id === selected),
    clipIndex = doc.clips.findIndex((c) => c.id === selected);
  const fingerprint = useMemo(() => editorFingerprint(doc), [doc]);
  const status: SaveStatus =
    saveStatus === "saved" && fingerprint !== acknowledged
      ? "pending"
      : saveStatus;
  useEffect(() => {
    latest.current = doc;
    save.current?.update(doc);
  }, [doc]);
  useEffect(() => {
    if (!canWrite) return;
    const saver = new EditorAutosave(
      initial,
      async (draft, expectedRevision) => {
        try {
          return await request(initial.project_id, {
            action: "saveEditor",
            timeline: initial.id,
            revision: expectedRevision,
            draft: { clips: draft.clips, presentation: draft.presentation },
          });
        } catch (e) {
          // A lost HTTP response may follow a committed transaction. Only accept an exact read-back.
          const state = await request(initial.project_id).catch(() => null);
          if (
            state?.active?.id === initial.id &&
            editorFingerprint(state.active) === editorFingerprint(draft)
          )
            return state.active;
          throw e;
        }
      },
      (s, r, message, fingerprint) => {
        setAcknowledged(fingerprint);
        setStatus(s);
        setRevision(r);
        setError(message);
      },
    );
    save.current = saver;
    return () => {
      saver.dispose();
      save.current = null;
    };
  }, [initial, canWrite]);
  useEffect(() => {
    if (status === "saved") return;
    const leave = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const navigate = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest("a[href]")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setError(
          "Vos modifications ne sont pas encore enregistrées. Attendez la sauvegarde ou réessayez avant de quitter.",
        );
      }
    };
    window.addEventListener("beforeunload", leave);
    document.addEventListener("click", navigate, true);
    return () => {
      window.removeEventListener("beforeunload", leave);
      document.removeEventListener("click", navigate, true);
    };
  }, [status]);
  function change(command: EditorCommand) {
    if (!canWrite) return;
    try {
      const next = applyEditorCommand(doc, command, assets);
      setHistory(editorStep(history, next));
      if (status !== "error" && status !== "conflict") setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Modification refusée.");
    }
  }
  function choose(c: StudioTimelineClip) {
    setSelected(c.id);
    setPlaying(false);
    setTime(c.timeline_start_ms);
  }
  function move(delta: number) {
    if (!clip || clipIndex + delta < 0 || clipIndex + delta >= doc.clips.length)
      return;
    change({ type: "move", id: clip.id, index: clipIndex + delta });
  }
  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.closest("input,textarea,select") || target.isContentEditable)
      )
        return;
      if (e.code === "Space") {
        if (target instanceof HTMLElement && target.closest("button,a")) return;
        e.preventDefault();
        setPlaying((p) => !p);
      }
      if (!canWrite) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setHistory((s) => (e.shiftKey ? editorRedo(s) : editorUndo(s)));
      }
      if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selected &&
        window.confirm("Retirer ce clip du montage ? Le média sera conservé.")
      ) {
        e.preventDefault();
        setHistory((s) =>
          editorStep(
            s,
            applyEditorCommand(
              s.present,
              { type: "remove", id: selected },
              assets,
            ),
          ),
        );
      }
      if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && e.altKey) {
        e.preventDefault();
        setHistory((s) => {
          const i = s.present.clips.findIndex((c) => c.id === selected),
            next = i + (e.key === "ArrowLeft" ? -1 : 1);
          return i >= 0 && next >= 0 && next < s.present.clips.length
            ? editorStep(
                s,
                applyEditorCommand(
                  s.present,
                  { type: "move", id: selected, index: next },
                  assets,
                ),
              )
            : s;
        });
      }
    }
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [canWrite, selected, assets]);
  const byId = useMemo(() => new Map(assets.map((a) => [a.id, a])), [assets]);
  // Fixed lightweight cells with overscan; DOM and media elements stay bounded at 500/1000 clips.
  const cell = 164,
    start = Math.max(0, Math.floor(scroll / cell) - 3),
    visible = doc.clips.slice(start, start + 18);
  const overlays =
    doc.presentation?.overlays.filter(
      (o) => o.clip_key === clip?.metadata_json.key,
    ) ?? [];
  function newText() {
    if (!clip) return;
    const key = clip.metadata_json.key ?? clip.id;
    change({
      type: "overlay",
      overlay: {
        id: crypto.randomUUID(),
        clip_key: key,
        text: "Nouveau chapitre",
        start_ms: 0,
        end_ms: clip.duration_ms,
        position: "center",
        alignment: "center",
        font_role: "title",
        size_role: "title",
        weight: 700,
        animation: "none",
        background: "dark",
        color: "#ffffff",
        max_lines: 3,
      },
    });
  }
  return (
    <div className="video-editor" data-editor-revision={revision}>
      <AnalysisPanel
        project={doc.project_id}
        canWrite={false}
        enabled={analysisEnabled}
        asset={clip?.asset_id ?? null}
      />
      <div className="editor-toolbar">
        <p>
          <strong>Durée : {editorTime(doc.total_duration_ms)}</strong> · Cible :{" "}
          {doc.target_duration_ms
            ? editorTime(doc.target_duration_ms)
            : "Automatique"}
          {doc.target_duration_ms != null &&
            ` · Écart : ${((doc.total_duration_ms - doc.target_duration_ms) / 1000).toFixed(1)} s`}
        </p>
        {canWrite ? (
          <>
            <span role="status">
              {
                {
                  saved: "Enregistré",
                  pending: "Modifications non enregistrées",
                  saving: "Sauvegarde…",
                  error: "Erreur de sauvegarde",
                  conflict: "Conflit de version",
                }[status]
              }
            </span>
            <button
              disabled={!history.past.length}
              onClick={() => setHistory(editorUndo)}
            >
              Annuler la modification
            </button>
            <button
              disabled={!history.future.length}
              onClick={() => setHistory(editorRedo)}
            >
              Rétablir
            </button>
          </>
        ) : (
          <p>Lecture seule</p>
        )}
      </div>
      {error && (
        <div role="alert">
          {error}
          {status === "error" && (
            <button onClick={() => save.current?.retry()}>
              Réessayer la sauvegarde
            </button>
          )}
          {status === "conflict" && (
            <p>
              Cette version a été modifiée ailleurs. Vos changements restent
              visibles ici. Rechargez uniquement après les avoir examinés.
            </p>
          )}
        </div>
      )}
      <div className="editor-layout">
        <EditorPreview
          doc={doc}
          assets={assets}
          time={time}
          setTime={setTime}
          playing={playing}
          setPlaying={setPlaying}
          onThumbnail={thumbnail}
        />
        <section
          className="editor-properties card"
          aria-label="Propriétés du clip"
        >
          {clip ? (
            <>
              <h2>
                {clip.clip_type === "card"
                  ? clip.metadata_json.card?.kind === "intro"
                    ? "Introduction"
                    : "Fin"
                  : clip.clip_type === "video"
                    ? "Clip vidéo"
                    : "Clip image"}
              </h2>
              <p>
                {byId.get(clip.asset_id ?? "")?.original_filename ?? "Fond uni"}{" "}
                · {(clip.duration_ms / 1000).toFixed(2)} s
              </p>
              {canWrite && (
                <div className="row">
                  <button disabled={clipIndex === 0} onClick={() => move(-1)}>
                    Déplacer à gauche
                  </button>
                  <button
                    disabled={clipIndex === doc.clips.length - 1}
                    onClick={() => move(1)}
                  >
                    Déplacer à droite
                  </button>
                  <button
                    onClick={() =>
                      change({
                        type: "duplicate",
                        id: clip.id,
                        nextId: crypto.randomUUID(),
                      })
                    }
                  >
                    Dupliquer
                  </button>
                  <button
                    onClick={() => change({ type: "remove", id: clip.id })}
                  >
                    Retirer du montage
                  </button>
                </div>
              )}
              <fieldset disabled={!canWrite}>
                <legend>Réglages</legend>
                {clip.clip_type !== "video" ? (
                  <>
                    <label>
                      Durée du clip (secondes)
                      <input
                        type="number"
                        min="0.5"
                        max="600"
                        step="0.1"
                        value={clip.duration_ms / 1000}
                        onChange={(e) =>
                          change({
                            type: "edit",
                            id: clip.id,
                            patch: {
                              duration_ms: Math.round(
                                Number(e.target.value) * 1000,
                              ),
                            },
                          })
                        }
                      />
                    </label>
                    <input
                      aria-label="Durée photo"
                      type="range"
                      min="0.5"
                      max={Math.max(15, clip.duration_ms / 1000)}
                      step="0.1"
                      value={clip.duration_ms / 1000}
                      onChange={(e) =>
                        change({
                          type: "edit",
                          id: clip.id,
                          patch: {
                            duration_ms: Math.round(
                              Number(e.target.value) * 1000,
                            ),
                          },
                        })
                      }
                    />
                  </>
                ) : (
                  <>
                    <p>
                      Source :{" "}
                      {editorTime(
                        byId.get(clip.asset_id ?? "")?.duration_ms ?? 0,
                      )}{" "}
                      · Utilisé : {editorTime(clip.source_start_ms)} →{" "}
                      {editorTime(clip.source_end_ms ?? 0)}
                    </p>
                    <label>
                      Début vidéo (secondes)
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        value={clip.source_start_ms / 1000}
                        onChange={(e) =>
                          change({
                            type: "edit",
                            id: clip.id,
                            patch: {
                              source_start_ms: Math.round(
                                Number(e.target.value) * 1000,
                              ),
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      Fin vidéo (secondes)
                      <input
                        type="number"
                        min="0"
                        max={
                          (byId.get(clip.asset_id ?? "")?.duration_ms ?? 0) /
                          1000
                        }
                        step="0.1"
                        value={(clip.source_end_ms ?? 0) / 1000}
                        onChange={(e) =>
                          change({
                            type: "edit",
                            id: clip.id,
                            patch: {
                              source_end_ms: Math.round(
                                Number(e.target.value) * 1000,
                              ),
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      Volume vidéo : {Math.round(clip.volume * 100)} %
                      <input
                        type="range"
                        min="0"
                        max="100"
                        step="25"
                        value={clip.volume * 100}
                        onChange={(e) =>
                          change({
                            type: "volume",
                            id: clip.id,
                            value: Number(e.target.value) / 100,
                          })
                        }
                      />
                    </label>
                    <button
                      onClick={() => {
                        if (clip.volume > 0)
                          volumes.current.set(clip.id, clip.volume);
                        change({
                          type: "volume",
                          id: clip.id,
                          value: clip.volume
                            ? 0
                            : (volumes.current.get(clip.id) ?? 1),
                        });
                      }}
                    >
                      {clip.volume ? "Couper le son" : "Rétablir le son"}
                    </button>
                  </>
                )}
                <label>
                  Transition
                  <select
                    aria-label="Transition"
                    value={clip.transition_in}
                    onChange={(e) =>
                      change({
                        type: "edit",
                        id: clip.id,
                        patch: {
                          transition_in: e.target
                            .value as StudioTimelineClip["transition_in"],
                          transition_duration_ms:
                            e.target.value === "cut"
                              ? 0
                              : Math.min(400, Math.floor(clip.duration_ms / 2)),
                        },
                      })
                    }
                  >
                    {Object.entries(transitionNames).map(([v, n]) => (
                      <option key={v} value={v}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                {clip.transition_in !== "cut" && (
                  <label>
                    Longueur de transition
                    <select
                      aria-label="Longueur de transition"
                      value={clip.transition_duration_ms}
                      onChange={(e) =>
                        change({
                          type: "edit",
                          id: clip.id,
                          patch: {
                            transition_duration_ms: Number(e.target.value),
                          },
                        })
                      }
                    >
                      {![200, 400, 700].includes(
                        clip.transition_duration_ms,
                      ) && (
                        <option value={clip.transition_duration_ms}>
                          Actuelle
                        </option>
                      )}
                      {[
                        [200, "Courte"],
                        [400, "Moyenne"],
                        [700, "Longue"],
                      ].map(([v, n]) => (
                        <option
                          key={v}
                          value={v}
                          disabled={Number(v) > clip.duration_ms / 2}
                        >
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {clip.clip_type === "image" && (
                  <label>
                    Animation
                    <select
                      aria-label="Animation"
                      value={clip.animation_type}
                      onChange={(e) =>
                        change({
                          type: "edit",
                          id: clip.id,
                          patch: {
                            animation_type: e.target
                              .value as StudioTimelineClip["animation_type"],
                          },
                        })
                      }
                    >
                      {Object.entries(animationNames).map(([v, n]) => (
                        <option key={v} value={v}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label>
                  Cadrage
                  <select
                    aria-label="Cadrage"
                    value={clip.crop_mode}
                    onChange={(e) =>
                      change({
                        type: "crop",
                        id: clip.id,
                        value:
                          e.target.value === "contain" ? "contain" : "cover",
                      })
                    }
                  >
                    <option value="cover">Remplir</option>
                    <option value="contain">Ajuster</option>
                  </select>
                </label>
              </fieldset>
              <section aria-label="Textes du clip">
                <h3>Textes et chapitres</h3>
                {overlays.map((o) => (
                  <OverlayForm
                    key={o.id}
                    overlay={o}
                    clips={doc.clips}
                    duration={clip.duration_ms}
                    disabled={!canWrite}
                    change={change}
                  />
                ))}
                {canWrite && (
                  <button onClick={newText}>Ajouter un texte / chapitre</button>
                )}
              </section>
              {clip.metadata_json.card?.kind === "outro" &&
                doc.presentation && (
                  <label>
                    Logo de fin
                    <select
                      aria-label="Logo de fin"
                      disabled={!canWrite}
                      value={doc.presentation.logo?.asset_id ?? ""}
                      onChange={(e) =>
                        change({
                          type: "logo",
                          logo: e.target.value
                            ? {
                                asset_id: e.target.value,
                                clip_key: clip.metadata_json.key!,
                                position: "top",
                                width: 0.18,
                              }
                            : null,
                        })
                      }
                    >
                      <option value="">Aucun logo</option>
                      {assets
                        .filter(
                          (a) =>
                            a.upload_status === "ready" &&
                            ["image/png", "image/jpeg"].includes(a.mime_type),
                        )
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.original_filename}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
            </>
          ) : (
            <p>Sélectionnez un clip dans la timeline.</p>
          )}
        </section>
      </div>
      <section
        className="editor-timeline card"
        aria-label="Timeline simplifiée"
      >
        <h2>Montage · {doc.clips.length} clips</h2>
        <p>
          Glissez les blocs ou utilisez les boutons de déplacement. Alt +
          flèches déplace le clip sélectionné.
        </p>
        <div
          ref={strip}
          className="editor-strip"
          onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}
          tabIndex={0}
          aria-label="Parcourir les clips"
        >
          <div
            style={{
              width: doc.clips.length * cell,
              height: 136,
              position: "relative",
            }}
          >
            {visible.map((c, i) => (
              <button
                type="button"
                key={c.id}
                data-editor-clip={c.id}
                aria-pressed={selected === c.id}
                aria-label={`Clip ${start + i + 1} : ${byId.get(c.asset_id ?? "")?.original_filename ?? c.metadata_json.card?.kind}`}
                className="editor-block"
                style={{ left: (start + i) * cell, width: cell - 8 }}
                draggable={canWrite}
                onDragStart={() => setDrag(c.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (canWrite && drag)
                    change({ type: "move", id: drag, index: start + i });
                  setDrag("");
                }}
                onClick={() => choose(c)}
              >
                <span className="editor-block-icon">
                  {c.asset_id && thumbnails[c.asset_id] ? (
                    <img
                      alt=""
                      src={thumbnails[c.asset_id]}
                      width="64"
                      height="40"
                    />
                  ) : c.clip_type === "video" ? (
                    "▶"
                  ) : c.clip_type === "card" ? (
                    "T"
                  ) : (
                    "▧"
                  )}
                </span>
                <span>
                  {start + i + 1}.{" "}
                  {byId.get(c.asset_id ?? "")?.original_filename ??
                    (c.metadata_json.card?.kind === "intro"
                      ? "Introduction"
                      : "Fin")}
                </span>
                <small>
                  {(c.duration_ms / 1000).toFixed(1)} s ·{" "}
                  {transitionNames[c.transition_in]}
                </small>
              </button>
            ))}
          </div>
        </div>
        <label>
          Aller au clip
          <input
            type="number"
            min="1"
            max={doc.clips.length}
            value={clipIndex >= 0 ? clipIndex + 1 : ""}
            onChange={(e) => {
              const i = Number(e.target.value) - 1,
                c = doc.clips[i];
              if (c) {
                choose(c);
                strip.current?.scrollTo({ left: i * cell });
              }
            }}
          />
        </label>
        {canWrite && (
          <div className="editor-add">
            <label>
              Média à ajouter ou remplacer
              <select
                aria-label="Média à ajouter ou remplacer"
                value={media}
                onChange={(e) => setMedia(e.target.value)}
              >
                {assets
                  .filter((a) => a.upload_status === "ready" && !a.deleted_at)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.original_filename}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Insérer
              <select
                aria-label="Insérer"
                value={insertion}
                onChange={(e) => setInsertion(e.target.value)}
              >
                <option value="after">Après le clip</option>
                <option value="before">Avant le clip</option>
                <option value="end">À la fin</option>
              </select>
            </label>
            <button
              disabled={!media}
              onClick={() =>
                change({
                  type: "insert",
                  asset: media,
                  id: crypto.randomUUID(),
                  index:
                    insertion === "end" || clipIndex < 0
                      ? doc.clips.length
                      : clipIndex + (insertion === "after" ? 1 : 0),
                })
              }
            >
              Ajouter un média
            </button>
            <button
              disabled={!media || !clip}
              onClick={() =>
                clip && change({ type: "replace", id: clip.id, asset: media })
              }
            >
              Remplacer le média
            </button>
          </div>
        )}
      </section>
      <RenderPanel
        project={initial.project_id}
        canWrite={canWrite}
        editorState={{
          timeline: initial.id,
          revision,
          dirty: status !== "saved",
        }}
      />
      <details
        className="card"
        onToggle={(e) => {
          if (e.currentTarget.open)
            void request(initial.project_id)
              .then((d) => setVersions(d.versions))
              .catch((e) =>
                setError(
                  e instanceof Error ? e.message : "Historique indisponible.",
                ),
              );
        }}
      >
        <summary>Versions du montage</summary>
        {versions.map((v) => (
          <p key={v.id}>
            Version {v.version} ·{" "}
            {v.presentation?.template.id ?? "Montage libre"} · Auteur{" "}
            {v.created_by} · {v.status} · {v.created_at}
            {canWrite && v.id !== initial.id && (
              <button
                disabled={status !== "saved"}
                onClick={async () => {
                  if (window.confirm("Restaurer cette version du montage ?")) {
                    try {
                      await request(initial.project_id, {
                        action: "activate",
                        timeline: v.id,
                      });
                      window.location.reload();
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Activation refusée.",
                      );
                    }
                  }
                }}
              >
                Restaurer la version {v.version}
              </button>
            )}
          </p>
        ))}
        <p>
          Les générations antérieures restent consultables et activables depuis
          le projet. Changer de style crée une nouvelle version. Les éditions
          manuelles ont priorité.
        </p>
      </details>
    </div>
  );
}
function OverlayForm({
  overlay: o,
  clips,
  duration,
  disabled,
  change,
}: {
  overlay: TextOverlay;
  clips: StudioTimelineClip[];
  duration: number;
  disabled: boolean;
  change: (c: EditorCommand) => void;
}) {
  const patch = (p: Partial<TextOverlay>) =>
    change({ type: "overlay", overlay: { ...o, ...p } });
  return (
    <fieldset disabled={disabled} className="editor-text">
      <legend>Texte</legend>
      <label>
        Contenu du texte
        <EditorTextInput value={o.text} onChange={(text) => patch({ text })} />
      </label>
      <label>
        Position du texte
        <select
          aria-label="Position du texte"
          value={`${o.position}-${o.alignment}`}
          onChange={(e) => {
            const [position, alignment] = e.target.value.split("-");
            patch({
              position: position as TextOverlay["position"],
              alignment: alignment as TextOverlay["alignment"],
            });
          }}
        >
          {[
            ["top-center", "Haut"],
            ["center-center", "Centre"],
            ["bottom-center", "Bas"],
            ["top-left", "Haut gauche"],
            ["top-right", "Haut droite"],
            ["bottom-left", "Bas gauche"],
            ["bottom-right", "Bas droite"],
          ].map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label>
        Rôle typographique
        <select
          aria-label="Rôle typographique"
          value={o.font_role}
          onChange={(e) =>
            patch({
              font_role: e.target.value as TextOverlay["font_role"],
              size_role: e.target.value as TextOverlay["size_role"],
            })
          }
        >
          {fontRoles.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>
      <label>
        Début du texte (secondes)
        <input
          type="number"
          min="0"
          max={duration / 1000}
          step=".1"
          value={o.start_ms / 1000}
          onChange={(e) =>
            patch({ start_ms: Math.round(Number(e.target.value) * 1000) })
          }
        />
      </label>
      <label>
        Fin du texte (secondes)
        <input
          type="number"
          min="0"
          max={duration / 1000}
          step=".1"
          value={o.end_ms / 1000}
          onChange={(e) =>
            patch({ end_ms: Math.round(Number(e.target.value) * 1000) })
          }
        />
      </label>
      <label>
        Déplacer le texte vers
        <select
          aria-label="Déplacer le texte vers"
          value={o.clip_key}
          onChange={(e) => {
            const c = clips.find((c) => c.metadata_json.key === e.target.value);
            if (c)
              patch({
                clip_key: e.target.value,
                start_ms: 0,
                end_ms: Math.min(o.end_ms, c.duration_ms),
              });
          }}
        >
          {clips
            .filter((c) => c.metadata_json.key)
            .map((c, i) => (
              <option key={c.id} value={c.metadata_json.key}>
                Clip {i + 1}
              </option>
            ))}
        </select>
      </label>
      {!disabled && (
        <button
          onClick={() => {
            if (o.hidden_text !== undefined) {
              const restored = { ...o, text: o.hidden_text };
              delete restored.hidden_text;
              change({ type: "overlay", overlay: restored });
            } else patch({ text: "", hidden_text: o.text });
          }}
        >
          {o.hidden_text !== undefined
            ? "Afficher le texte"
            : "Masquer le texte"}
        </button>
      )}
      {!disabled && (
        <button onClick={() => change({ type: "removeOverlay", id: o.id })}>
          Supprimer le texte / chapitre
        </button>
      )}
    </fieldset>
  );
}

function EditorTextInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [local, setLocal] = useState(value),
    [received, setReceived] = useState(value);
  if (received !== value) {
    setReceived(value);
    if (local.normalize("NFC").replace(/\s+/gu, " ").trim() !== value)
      setLocal(value);
  }
  return (
    <textarea
      aria-label="Contenu du texte"
      maxLength={500}
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        onChange(e.target.value);
      }}
    />
  );
}
