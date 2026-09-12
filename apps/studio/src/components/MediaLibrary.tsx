"use client";
/* eslint-disable @next/next/no-img-element -- Private signed and blob previews must bypass the image optimizer. */
/* Signed capabilities only. No Supabase Auth session or privileged credential in the browser. */
import { useEffect, useRef, useState, useCallback } from "react";
import { Upload } from "tus-js-client";
import {
  validateFile,
  bytes,
  type StudioMediaAsset,
  type MediaLimits,
  type UploadAuthorization,
} from "../lib/media-contract";
type Entry = {
  id: string;
  file: File;
  progress: number;
  status: "queued" | "uploading" | "paused" | "ready" | "failed" | "cancelled";
  error?: string;
  asset?: StudioMediaAsset;
  upload?: Upload;
  stop?: () => void;
  localUrl?: string;
};
async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const r = await fetch(`/api/media/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Opération impossible.");
  return data;
}
function Preview({ asset }: { asset: StudioMediaAsset }) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  const open = async () => {
    try {
      setError("");
      setUrl((await api<{ url: string }>(`assets/${asset.id}/preview`)).url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Aperçu indisponible.");
    }
  };
  return (
    <div className="media-preview">
      {url ? (
        asset.media_type === "image" ? (
          <img src={url} alt={asset.original_filename} loading="lazy" />
        ) : (
          <video
            src={url}
            controls
            preload="metadata"
            aria-label={asset.original_filename}
          />
        )
      ) : (
        <div className="media-placeholder">
          {asset.media_type === "image" ? "PHOTO" : "VIDÉO"}
        </div>
      )}
      {asset.upload_status === "ready" && (
        <button className="secondary" onClick={open}>
          {url ? "Renouveler l’aperçu" : "Voir l’aperçu"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
export default function MediaLibrary({
  project,
  limits,
  canWrite,
}: {
  project: string;
  limits: MediaLimits;
  canWrite: boolean;
}) {
  const entries = useRef<Entry[]>([]),
    active = useRef(0),
    mounted = useRef(true);
  const [rows, setRows] = useState<Entry[]>([]),
    [assets, setAssets] = useState<StudioMediaAsset[]>([]),
    [error, setError] = useState(""),
    [hasMore, setHasMore] = useState(false),
    [loading, setLoading] = useState(false);
  const refresh = useCallback(async () => {
    try {
      const r = await api<{ assets: StudioMediaAsset[] }>(
        `projects/${project}`,
      );
      setAssets(r.assets);
      setHasMore(r.assets.length === 24);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bibliothèque indisponible.");
    }
  }, [project]);
  const paint = () => {
    if (mounted.current) setRows(entries.current.map((e) => ({ ...e })));
  };
  useEffect(() => {
    mounted.current = true;
    void api<{ assets: StudioMediaAsset[] }>(`projects/${project}`)
      .then((r) => {
        if (mounted.current) {
          setAssets(r.assets);
          setHasMore(r.assets.length === 24);
        }
      })
      .catch(() => {
        if (mounted.current) setError("Bibliothèque indisponible.");
      });
    const list = entries.current;
    return () => {
      mounted.current = false;
      for (const e of list) {
        if (e.status === "uploading") e.status = "paused";
        void e.upload?.abort();
        e.stop?.();
        if (e.localUrl) URL.revokeObjectURL(e.localUrl);
      }
    };
  }, [project]);
  const run = async (entry: Entry) => {
    entry.status = "uploading";
    entry.error = "";
    active.current++;
    paint();
    try {
      const auth = entry.asset
        ? await api<UploadAuthorization>(
            `assets/${entry.asset.id}/authorize`,
            "POST",
          )
        : await api<UploadAuthorization>(
            `projects/${project}/reserve`,
            "POST",
            {
              requestId: entry.id,
              name: entry.file.name,
              mime: entry.file.type,
              size: entry.file.size,
            },
          );
      entry.asset = auth.asset;
      if (entry.status !== "uploading") return;
      if (!auth.complete) {
        await new Promise<void>((resolve, reject) => {
          entry.stop = () => reject(new Error("Transfert en pause."));
          const upload =
            entry.upload ??
            new Upload(entry.file, {
              endpoint: auth.endpoint,
              headers: {
                apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
                "x-signature": auth.token!,
              },
              chunkSize: 6 * 1024 * 1024,
              uploadDataDuringCreation: false,
              retryDelays: [0, 1000, 3000],
              storeFingerprintForResuming: false,
              removeFingerprintOnSuccess: true,
              metadata: {
                bucketName: auth.asset.storage_bucket,
                objectName: auth.asset.storage_key,
                contentType: entry.file.type,
                cacheControl: "0",
              },
              onProgress: (sent, total) => {
                entry.progress = Math.floor((sent / total) * 100);
                paint();
              },
              onSuccess: () => resolve(),
              onError: () =>
                reject(
                  new Error(
                    "Transfert interrompu. Utilisez Réessayer pour reprendre.",
                  ),
                ),
            });
          upload.options.headers = {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
            "x-signature": auth.token!,
          };
          upload.options.onSuccess = () => resolve();
          upload.options.onError = () =>
            reject(
              new Error(
                "Transfert interrompu. Utilisez Réessayer pour reprendre.",
              ),
            );
          entry.upload = upload;
          upload.start();
        });
      }
      if (entry.status !== "uploading") return;
      await api(`assets/${auth.asset.id}/confirm`, "POST");
      entry.status = "ready";
      if (entry.localUrl) {
        URL.revokeObjectURL(entry.localUrl);
        entry.localUrl = undefined;
      }
      entry.progress = 100;
      await refresh();
    } catch (e) {
      if (entry.status === "uploading") {
        entry.status = "failed";
        entry.error =
          e instanceof Error ? e.message : "Transfert interrompu. Réessayez.";
      }
    } finally {
      active.current--;
      paint();
      pump();
    }
  };
  function pump() {
    if (!mounted.current) return;
    for (const e of entries.current) {
      if (active.current >= limits.concurrency) break;
      if (e.status === "queued") void run(e);
    }
  }
  function add(files: FileList | File[]) {
    for (const file of Array.from(files)) {
      if (entries.current.length >= limits.project_assets) {
        setError(`Maximum ${limits.project_assets} fichiers dans cette file.`);
        break;
      }
      const e: Entry = {
        id: crypto.randomUUID(),
        file,
        progress: 0,
        status: "queued",
      };
      try {
        validateFile(file.name, file.type, file.size, limits);
        if (file.type.startsWith("image/"))
          e.localUrl = URL.createObjectURL(file);
      } catch (err) {
        e.status = "failed";
        e.error = err instanceof Error ? err.message : "Fichier refusé.";
      }
      entries.current.push(e);
    }
    paint();
    pump();
  }
  async function pause(e: Entry) {
    e.status = "paused";
    await e.upload?.abort();
    e.stop?.();
    paint();
  }
  // Cancellation is implemented as pause then a tombstone; network retry reuses asset and TUS URL.
  async function remove(asset: StudioMediaAsset) {
    try {
      await api(`assets/${asset.id}`, "DELETE");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Suppression impossible.");
    }
  }
  return (
    <>
      {canWrite && (
        <section
          className="card drop-zone"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            add(e.dataTransfer.files);
          }}
          aria-label="Importer des médias"
        >
          <h2>Ajouter des photos et vidéos</h2>
          <p>
            Glissez vos fichiers ici ou sélectionnez-les sur votre appareil.
          </p>
          <label className="file-label">
            Choisir des fichiers
            <input
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime"
              onChange={(e) => {
                if (e.target.files) add(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          <p className="muted">
            Images : {bytes(limits.image_bytes)} · Vidéos H.264 :{" "}
            {bytes(limits.video_bytes)} · {limits.concurrency} transferts
            simultanés.
          </p>
          <p className="muted">
            Reprise TUS dans cet onglet. Gardez-le ouvert pendant l’import.
          </p>
        </section>
      )}
      {rows.length > 0 && (
        <section aria-label="Transferts">
          <h2>Transferts</h2>
          <ul className="upload-list">
            {rows.map((e) => (
              <li key={e.id} data-status={e.status}>
                {e.localUrl && (
                  <img
                    src={e.localUrl}
                    alt=""
                    loading="lazy"
                    decoding="async"
                  />
                )}
                <div>
                  <strong>{e.file.name}</strong>
                  <p>
                    {bytes(e.file.size)} · {e.file.type}
                  </p>
                  <progress
                    value={e.progress}
                    max={100}
                    aria-label={`Progression ${e.file.name}`}
                  />
                  <span role="status">
                    {e.status === "ready"
                      ? "Importé"
                      : e.status === "uploading"
                        ? `Transfert ${e.progress} %`
                        : e.status === "paused"
                          ? "En pause"
                          : e.status === "queued"
                            ? "En attente"
                            : e.status === "cancelled"
                              ? "Annulé"
                              : "Erreur"}
                  </span>
                  {e.error && <p role="alert">{e.error}</p>}
                </div>
                {(e.status === "failed" || e.status === "paused") && (
                  <button
                    className="secondary"
                    onClick={() => {
                      try {
                        validateFile(
                          e.file.name,
                          e.file.type,
                          e.file.size,
                          limits,
                        );
                        const live = entries.current.find(
                          (item) => item.id === e.id,
                        );
                        if (live) live.status = "queued";
                        pump();
                        paint();
                      } catch {
                        paint();
                      }
                    }}
                  >
                    Réessayer
                  </button>
                )}
                {e.status === "uploading" && (
                  <button
                    className="secondary"
                    onClick={() => {
                      const live = entries.current.find(
                        (item) => item.id === e.id,
                      );
                      if (live) void pause(live);
                    }}
                  >
                    Pause
                  </button>
                )}
                {["queued", "paused", "failed"].includes(e.status) && (
                  <button
                    className="text-button"
                    onClick={async () => {
                      const live = entries.current.find(
                        (item) => item.id === e.id,
                      );
                      if (live) live.status = "cancelled";
                      if (e.asset) await remove(e.asset);
                      paint();
                    }}
                  >
                    Annuler
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      {error && <p role="alert">{error}</p>}
      <section aria-label="Médias importés">
        <h2>Médias du projet</h2>
        <p>
          {assets.length}
          {hasMore ? " +" : ""} médias affichés ·{" "}
          {bytes(assets.reduce((n, a) => n + a.file_size_bytes, 0))} réservés
          sur cette page
        </p>
        <div className="media-grid">
          {assets.map((asset) => (
            <article className="card media-card" key={asset.id}>
              <Preview asset={asset} />
              <h3>{asset.original_filename}</h3>
              <p>
                {asset.upload_status === "ready"
                  ? "Prêt"
                  : asset.upload_status === "failed"
                    ? "Fichier refusé"
                    : "En attente"}{" "}
                · {bytes(asset.file_size_bytes)}
              </p>
              {asset.width && (
                <p>
                  {asset.width} × {asset.height}
                  {asset.duration_ms
                    ? ` · ${(asset.duration_ms / 1000).toFixed(1)} s`
                    : ""}
                </p>
              )}
              {canWrite && (
                <button
                  className="text-button"
                  onClick={() => void remove(asset)}
                  aria-label={`Supprimer ${asset.original_filename}`}
                >
                  Supprimer
                </button>
              )}
            </article>
          ))}
        </div>
        {hasMore && (
          <button
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                const r = await api<{ assets: StudioMediaAsset[] }>(
                  `projects/${project}?offset=${assets.length}`,
                );
                setAssets((a) => [...a, ...r.assets]);
                setHasMore(r.assets.length === 24);
              } finally {
                setLoading(false);
              }
            }}
          >
            Afficher plus
          </button>
        )}
      </section>
    </>
  );
}
