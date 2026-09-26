"use client";
/* eslint-disable @next/next/no-img-element -- Private original URLs expire; only the current clip is mounted. */
import { useEffect, useRef, useState } from "react";
import {
  safeAreas,
  type TimelineDocument,
  type StudioMediaAsset,
} from "@elsatia/studio-domain";
export function editorTime(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
export default function EditorPreview({
  doc,
  assets,
  time,
  setTime,
  playing,
  setPlaying,
  onThumbnail,
}: {
  doc: TimelineDocument;
  assets: StudioMediaAsset[];
  time: number;
  setTime: (n: number) => void;
  playing: boolean;
  setPlaying: (b: boolean) => void;
  onThumbnail: (id: string, url: string) => void;
}) {
  const clip =
    doc.clips.find(
      (c) => time >= c.timeline_start_ms && time < c.timeline_end_ms,
    ) ?? doc.clips.at(-1);
  const asset = assets.find((a) => a.id === clip?.asset_id);
  const [signed, setSigned] = useState({ id: "", url: "" }),
    [error, setError] = useState(""),
    [renew, setRenew] = useState(0);
  const url = signed.id === asset?.id ? signed.url : "";
  const video = useRef<HTMLVideoElement>(null);
  const clock = useRef(time);
  useEffect(() => {
    clock.current = time;
  }, [time]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      previous = performance.now();
    const tick = (now: number) => {
      clock.current += Math.min(now - previous, 150);
      previous = now;
      if (clock.current >= doc.total_duration_ms) {
        setTime(doc.total_duration_ms);
        setPlaying(false);
        return;
      }
      setTime(clock.current);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, doc.total_duration_ms, setTime, setPlaying]);
  useEffect(() => {
    let cancelled = false;
    if (!asset) return;
    fetch(`/api/media/assets/${asset.id}/preview`, { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (!cancelled) {
          setSigned({ id: asset.id, url: d.url });
          setError("");
        }
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Aperçu indisponible.");
      });
    return () => {
      cancelled = true;
    };
  }, [asset, clip?.asset_id, renew]);
  const local = clip ? Math.max(0, time - clip.timeline_start_ms) : 0;
  useEffect(() => {
    const v = video.current;
    if (!v || !clip || !asset) return;
    const desired =
      clip.clip_type === "card"
        ? (local / 1000) % ((asset.duration_ms ?? 1000) / 1000)
        : (clip.source_start_ms + local) / 1000;
    if (Math.abs(v.currentTime - desired) > 0.25 || !playing)
      v.currentTime = desired;
    v.volume = clip.volume;
    if (playing) void v.play().catch(() => setPlaying(false));
    else v.pause();
  }, [local, clip, asset, playing, url, setPlaying]);
  const area = safeAreas[doc.aspect_ratio],
    motion = clip?.metadata_json.motion;
  const progress = clip ? Math.min(local / clip.duration_ms, 1) : 0;
  const scale = motion
    ? motion.scaleStart + (motion.scaleEnd - motion.scaleStart) * progress
    : 1;
  const x = motion
    ? motion.positionStart[0] +
      (motion.positionEnd[0] - motion.positionStart[0]) * progress
    : 0.5;
  const y = motion
    ? motion.positionStart[1] +
      (motion.positionEnd[1] - motion.positionStart[1]) * progress
    : 0.5;
  const [width, height] = doc.aspect_ratio.split(":").map(Number);
  function thumbnail(element: HTMLImageElement | HTMLVideoElement) {
    if (!asset) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 80;
      canvas.getContext("2d")?.drawImage(element, 0, 0, 128, 80);
      onThumbnail(asset.id, canvas.toDataURL("image/jpeg", 0.65));
    } catch {
      /* Some providers forbid canvas extraction; retain the explicit media placeholder. */
    }
  }
  const style = {
    width: "100%",
    height: "100%",
    objectFit: clip?.crop_mode,
    objectPosition: `${x * 100}% ${y * 100}%`,
    transform: `scale(${scale})`,
  };
  return (
    <section className="editor-preview" aria-label="Aperçu du montage">
      <div
        className="editor-screen"
        style={{
          aspectRatio: `${width}/${height}`,
          background: clip?.metadata_json.card?.color ?? "#000",
        }}
      >
        {url && asset?.media_type === "image" && (
          <img
            key={asset.id}
            crossOrigin="anonymous"
            onLoad={(e) => thumbnail(e.currentTarget)}
            src={url}
            alt={asset.original_filename}
            style={style}
            onError={() =>
              setError(
                "Aperçu expiré ou média indisponible. Renouvelez l’aperçu.",
              )
            }
          />
        )}
        {url && asset?.media_type === "video" && (
          <video
            key={asset.id}
            crossOrigin="anonymous"
            onLoadedData={(e) => thumbnail(e.currentTarget)}
            ref={video}
            src={url}
            playsInline
            preload="metadata"
            style={style}
            aria-label="Source vidéo"
            onError={() =>
              setError(
                "Aperçu expiré ou vidéo indisponible. Renouvelez l’aperçu.",
              )
            }
          />
        )}
        {doc.presentation?.overlays
          .filter(
            (o) =>
              o.clip_key === clip?.metadata_json.key &&
              local >= o.start_ms &&
              local < o.end_ms,
          )
          .map((o) => (
            <div
              key={o.id}
              className="editor-overlay"
              style={{
                left: `${area.x * 100}%`,
                right: `${area.x * 100}%`,
                top:
                  o.position === "top"
                    ? `${area.top * 100}%`
                    : o.position === "center"
                      ? "45%"
                      : undefined,
                bottom:
                  o.position === "bottom" ? `${area.bottom * 100}%` : undefined,
                textAlign: o.alignment,
                color: o.color,
                fontWeight: o.weight,
                fontFamily:
                  doc.presentation?.typography[o.font_role].family === "serif"
                    ? "Georgia, serif"
                    : "Arial, sans-serif",
                fontSize: `${(doc.presentation?.typography[o.size_role].size ?? 0.04) * 350}px`,
                background: o.background === "dark" ? "#0009" : undefined,
              }}
            >
              {o.text}
            </div>
          ))}
      </div>
      <p>
        Aperçu de travail : ordre, découpe, son et textes. Le MP4 rendu fait foi
        pour les transitions, la typographie et le logo.
      </p>
      {clip?.asset_id && !asset && (
        <p role="alert">Média indisponible. Remplacez ou retirez ce clip.</p>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button onClick={() => setRenew((n) => n + 1)}>
            Renouveler l’aperçu
          </button>
        </p>
      )}
      <div className="row">
        <button
          disabled={!doc.clips.length}
          onClick={() => {
            if (time >= doc.total_duration_ms) setTime(0);
            setPlaying(!playing);
          }}
        >
          {playing ? "Pause" : "Lire"}
        </button>
        <output>
          {editorTime(time)} / {editorTime(doc.total_duration_ms)}
        </output>
      </div>
      <input
        aria-label="Tête de lecture"
        type="range"
        min="0"
        max={Math.max(1, doc.total_duration_ms)}
        step="33"
        value={Math.min(time, doc.total_duration_ms)}
        onChange={(e) => {
          setPlaying(false);
          setTime(Number(e.target.value));
        }}
      />
    </section>
  );
}
