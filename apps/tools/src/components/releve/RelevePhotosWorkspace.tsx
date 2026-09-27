"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  allowedActions, describeAnchor, discardPending, enqueuePhoto, processUploadQueue, PHOTO_TARGET_LABELS, ReleveMediaService, UPLOAD_STATUS_LABELS,
  type CaptureCapabilities, type PendingPhoto, type PhotoEntry, type PhotoLibrary, type PhotoSource, type PhotoTarget,
  type ReleveActorContext, type ReleveId, type UploadQueueStore,
} from "@elsatia/releve-domain";
import { getElsatiaClient } from "@/lib/auth/client";
import { openUploadQueue } from "@/lib/releve/idb-upload-queue";
import { ficheHref, readPhotoCible, readReleveId, RELEVES_PATH, structureHref, type PhotoCibleUrl } from "@/lib/releve/navigation";
import { detectCaptureCapabilities, processPhoto, PhotoProcessingError, type ProcessedPhoto } from "@/lib/releve/photo-processing";
import { SupabaseReleveMediaRepository } from "@/lib/releve/supabase-media-repository";
import { SupabaseReleveRepository } from "@/lib/releve/supabase-repository";
import { Brand } from "../HomeDashboard";
import { CameraCapture } from "./CameraCapture";
import { PhotoDetail } from "./PhotoDetail";
import { PhotoTargetPicker } from "./PhotoTargetPicker";
import releveStyles from "./releve.module.css";
import styles from "./photos.module.css";
import { ReleveLocked } from "./ReleveLocked";
import { useReleveService } from "./use-releve-service";

export function RelevePhotosWorkspace() {
  const state = useReleveService();
  const [releveId, setReleveId] = useState<string | null | undefined>(undefined);
  const [cible, setCible] = useState<PhotoCibleUrl | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => { setReleveId(readReleveId(window.location.search)); setCible(readPhotoCible(window.location.search)); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return <main className="projects-page">
    <header className="calculator-header shell"><Brand /><Link href={RELEVES_PATH} className="all-tools">Relevés <span>×</span></Link></header>
    {state.status === "locked" && <div className="shell"><ReleveLocked reason={state.reason} /></div>}
    {state.status === "loading" && <p className={`shell ${releveStyles.feedback}`} role="status">Vérification des droits…</p>}
    {state.status === "error" && <p className={`shell ${releveStyles.feedback}`} role="alert">{state.message}</p>}
    {state.status === "ready" && releveId === null && <p className={`shell ${releveStyles.feedback}`} role="alert">Relevé introuvable. <Link href={RELEVES_PATH}>Retour aux relevés</Link></p>}
    {state.status === "ready" && releveId && <PhotoLibraryEditor key={releveId} releveId={releveId as ReleveId} actor={state.actor} initialTarget={cible} />}
  </main>;
}

type Draft = { processed: ProcessedPhoto; previewUrl: string; replace: PhotoEntry | null };
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });
const mo = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} Mo`;

function PhotoLibraryEditor({ releveId, actor, initialTarget }: { releveId: ReleveId; actor: ReleveActorContext; initialTarget: PhotoCibleUrl | null }) {
  const client = getElsatiaClient();
  const mediaRepository = useMemo(() => new SupabaseReleveMediaRepository(client), [client]);
  const media = useMemo(() => new ReleveMediaService(mediaRepository, new SupabaseReleveRepository(client), actor), [mediaRepository, client, actor]);
  const [library, setLibrary] = useState<PhotoLibrary | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  // Cible reçue de la navigation terrain (fiche pièce, étage) ; vérifiée par le domaine à l'enregistrement.
  const [target, setTarget] = useState<PhotoTarget>(initialTarget ?? { kind: "releve" });
  const [legende, setLegende] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [camera, setCamera] = useState<{ replace: PhotoEntry | null } | null>(null);
  const [capabilities, setCapabilities] = useState<CaptureCapabilities | null>(null);
  const [queue, setQueue] = useState<{ store: UploadQueueStore; persistent: boolean } | null>(null);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [online, setOnline] = useState(true);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const captureInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<PhotoEntry | null>(null);

  const reload = useCallback(async () => {
    try { setLibrary(await media.library(releveId)); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Chargement impossible."); }
  }, [media, releveId]);

  const refreshPending = useCallback(async (store: UploadQueueStore) => {
    setPending((await store.list()).filter((item) => item.releveId === releveId));
  }, [releveId]);

  const sync = useCallback(async (force = false) => {
    if (!queue || !library) return;
    const result = await processUploadQueue(queue.store, mediaRepository, { force, releveId, hooks: { ...media.queueHooks(library.structure.releve), onChange: () => void refreshPending(queue.store) } });
    await refreshPending(queue.store);
    if (result.synced.length) { setFeedback(`${result.synced.length} photo(s) synchronisée(s).`); await reload(); }
    else if (result.failed.length) setFeedback(result.failed[0].lastError ?? "Envoi refusé.");
  }, [queue, library, mediaRepository, releveId, media, refreshPending, reload]);

  useEffect(() => {
    let cancelled = false;
    media.library(releveId).then((loaded) => { if (!cancelled) setLibrary(loaded); })
      .catch((error: unknown) => { if (!cancelled) setFeedback(error instanceof Error ? error.message : "Chargement impossible."); });
    detectCaptureCapabilities().then((value) => { if (!cancelled) setCapabilities(value); }).catch(() => undefined);
    openUploadQueue(actor.userId, actor.tenantId).then(async (opened) => {
      if (cancelled) return;
      setQueue(opened);
      setPending((await opened.store.list()).filter((item) => item.releveId === releveId));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [media, releveId, actor]);

  // Synchronisation : à l'ouverture, au retour du réseau, puis toutes les 30 s pour les éléments dus.
  useEffect(() => {
    if (!queue || !library) return;
    const update = () => { setOnline(navigator.onLine); if (navigator.onLine) void sync(); };
    const first = window.setTimeout(update, 0);
    const timer = window.setInterval(() => { if (navigator.onLine) void sync(); }, 30_000);
    window.addEventListener("online", update); window.addEventListener("offline", update);
    return () => { window.clearTimeout(first); window.clearInterval(timer); window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, [queue, library, sync]);

  // URLs signées (600 s) des photos affichées ; renouvelées au rechargement de la bibliothèque.
  useEffect(() => {
    if (!library) return;
    let cancelled = false;
    Promise.all(library.photos.map(async (photo) => [photo.media.id, await media.photoUrl(library.structure.releve, photo.media).catch(() => "")] as const))
      .then((pairs) => { if (!cancelled) setUrls(Object.fromEntries(pairs.filter(([, url]) => url))); });
    return () => { cancelled = true; };
  }, [library, media]);

  useEffect(() => () => { if (draft) URL.revokeObjectURL(draft.previewUrl); }, [draft]);

  const actions = useMemo(() => new Set(library ? allowedActions(actor, library.structure.releve) : []), [actor, library]);
  const canEdit = actions.has("edit");

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setFeedback("");
    try { await action(); await reload(); setFeedback(message); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Action impossible."); }
    finally { setBusy(false); }
  }

  async function prepare(file: Blob, source: PhotoSource, meta: { captureAt?: string; lastModified?: number; name?: string | null }, replace: PhotoEntry | null) {
    setBusy(true); setFeedback("Préparation de la photo…");
    try {
      const processed = await processPhoto(file, { source, captureAt: meta.captureAt ?? null, fileLastModified: meta.lastModified ?? null, nomFichier: meta.name ?? null, replaceMediaId: replace?.media.id ?? null });
      if (draft) URL.revokeObjectURL(draft.previewUrl);
      setDraft({ processed, previewUrl: URL.createObjectURL(processed.blob), replace });
      setFeedback("");
    } catch (error) {
      setFeedback(error instanceof PhotoProcessingError ? error.message : "Photo illisible.");
    } finally { setBusy(false); }
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>, source: PhotoSource) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const replace = replaceTarget.current; replaceTarget.current = null;
    if (file) void prepare(file, source, { lastModified: file.lastModified, name: file.name }, replace);
  }

  async function save() {
    if (!draft || !library || !queue) return;
    setBusy(true); setFeedback("");
    try {
      const anchorTarget = draft.replace ? null : target;
      const prepared = media.preparePhoto({
        structure: library.structure, elements: library.elements,
        target: anchorTarget ?? { kind: "releve" }, mimeType: draft.processed.blob.type || "image/jpeg", bytes: draft.processed.blob.size,
        metadata: draft.processed.metadata, nomFichier: draft.processed.nomFichier, legende: draft.replace ? null : legende,
        ordre: library.photos.length,
      });
      const label = draft.replace ? "Remplacement de photo" : describeTarget(target, library);
      // En remplacement, la nouvelle photo hérite des rattachements de l'ancienne (RPC) : l'ancre
      // préparée n'est pas écrite (voir `enqueuePhoto`).
      await enqueuePhoto(queue.store, prepared, draft.processed.blob, { label, replaceMediaId: draft.replace?.media.id ?? null });
      URL.revokeObjectURL(draft.previewUrl); setDraft(null); setLegende("");
      await refreshPending(queue.store);
      if (navigator.onLine) await sync(true);
      else setFeedback("Hors ligne : photo conservée sur l'appareil, envoi automatique au retour du réseau.");
      if (draft.replace) setSelected(prepared.mediaId);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally { setBusy(false); }
  }

  function startReplace(entry: PhotoEntry) {
    replaceTarget.current = entry;
    importInput.current?.click();
  }

  if (!library) return <p className={`shell ${releveStyles.feedback}`} role="status">{feedback || "Chargement des photos…"}</p>;
  const { releve } = library.structure;
  const current = library.photos.find((photo) => photo.media.id === selected) ?? null;

  return <>
    <section className="tool-hero"><div className="shell">
      <nav aria-label="Fil d'Ariane"><ol className={releveStyles.breadcrumb}>
        <li><Link href={RELEVES_PATH}>Mes relevés</Link></li>
        <li><Link href={ficheHref(releveId)}>{releve.nom}</Link></li>
        <li>Photos terrain</li>
      </ol></nav>
      <p className="eyebrow">PHOTOS TERRAIN · {library.photos.length} PHOTO(S)</p>
      <h1 className="projects-title">{releve.nom}</h1>
      <div className={releveStyles.toolbar}>
        <Link className={releveStyles.secondary} href={structureHref({ releveId })}>Structure</Link>
        <span className={styles.syncBadge} data-online={online} role="status">{online ? "En ligne" : "Hors ligne"}{pending.length ? ` · ${pending.length} à synchroniser` : ""}</span>
      </div>
      <p className={releveStyles.feedback} role="status" aria-live="polite" data-testid="photos-feedback">{feedback}</p>
    </div></section>

    <div className={`shell ${styles.layout}`}>
      {canEdit && <section className={styles.capture} aria-label="Nouvelle photo">
        <h2>Nouvelle photo</h2>
        <PhotoTargetPicker idPrefix="capture" structure={library.structure} targets={library.targets} value={target} onChange={setTarget} />
        <label className={styles.field}><span>Légende (facultatif)</span><input value={legende} maxLength={200} placeholder="Mur nord, fissure" onChange={(event) => setLegende(event.target.value)} /></label>
        <div className={styles.captureButtons}>
          {capabilities?.liveCamera && <button type="button" className={styles.primary} disabled={busy} onClick={() => setCamera({ replace: null })}>Caméra</button>}
          <button type="button" className={capabilities?.liveCamera ? styles.secondary : styles.primary} disabled={busy} onClick={() => captureInput.current?.click()}>Prendre une photo</button>
          <button type="button" className={styles.secondary} disabled={busy} onClick={() => importInput.current?.click()}>Importer</button>
        </div>
        {capabilities && !capabilities.liveCamera && <p className={styles.muted}>{capabilities.liveCameraReason}</p>}
        {queue && !queue.persistent && <p className={styles.alert}>Stockage local indisponible : une photo non envoyée sera perdue si vous fermez la page.</p>}
        <input ref={captureInput} type="file" accept="image/*" capture="environment" hidden onChange={(event) => onFile(event, "camera_appareil")} data-testid="input-capture" />
        <input ref={importInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={(event) => onFile(event, "import")} data-testid="input-import" />
      </section>}

      {draft && <section className={styles.preview} aria-label="Prévisualisation">
        <h2>{draft.replace ? "Remplacer la photo" : "Prévisualisation"}</h2>
        {/* eslint-disable-next-line @next/next/no-img-element -- aperçu local (blob:) avant envoi. */}
        <img src={draft.previewUrl} alt="Prévisualisation de la photo" className={styles.previewImage} />
        <dl className={styles.facts}>
          <div><dt>Prise de vue</dt><dd>{draft.processed.metadata.priseLe ? dateFormat.format(new Date(draft.processed.metadata.priseLe)) : "Inconnue"}</dd></div>
          <div><dt>Dimensions</dt><dd>{draft.processed.metadata.largeurPx} × {draft.processed.metadata.hauteurPx} px</dd></div>
          <div><dt>Poids</dt><dd data-testid="preview-weight">{mo(draft.processed.originalBytes)} → {mo(draft.processed.blob.size)}</dd></div>
          <div><dt>Localisation</dt><dd>{draft.processed.metadata.gpsRetire ? "GPS d’origine retiré" : "Aucune"}</dd></div>
          <div><dt>{draft.replace ? "Remplace" : "Rattachée à"}</dt><dd>{draft.replace ? (draft.replace.anchors[0]?.donnees.legende || "photo sélectionnée") : describeTarget(target, library)}</dd></div>
        </dl>
        <div className={styles.captureButtons}>
          <button type="button" className={styles.primary} disabled={busy} onClick={() => void save()}>Enregistrer la photo</button>
          <button type="button" className={styles.ghost} disabled={busy} onClick={() => { URL.revokeObjectURL(draft.previewUrl); setDraft(null); }}>Annuler</button>
        </div>
      </section>}

      {pending.length > 0 && <section className={styles.queue} aria-label="À synchroniser">
        <h2>À synchroniser ({pending.length})</h2>
        <ul className={styles.list}>{pending.map((item) => <li key={item.id} data-status={item.status}>
          <span><strong>{item.label}</strong> <small>{UPLOAD_STATUS_LABELS[item.status]}{item.lastError ? ` — ${item.lastError}` : ""}</small></span>
          <span className={styles.rowActions}>
            <button type="button" className={styles.secondary} disabled={busy || !online} onClick={() => void sync(true)}>Réessayer</button>
            <button type="button" className={styles.ghost} onClick={() => { if (queue && window.confirm("Abandonner cette photo non envoyée ?")) void discardPending(queue.store, item.id, mediaRepository).then(() => refreshPending(queue.store)); }}>Abandonner</button>
          </span>
        </li>)}</ul>
      </section>}

      <section aria-label="Photos du relevé" className={styles.gallery}>
        <h2>Photos</h2>
        {library.photos.length === 0 && <p className={styles.muted}>Aucune photo pour ce relevé.</p>}
        <ul className={styles.grid}>{library.photos.map((photo) => <li key={photo.media.id}>
          <button type="button" className={styles.thumb} aria-current={photo.media.id === selected} onClick={() => setSelected(photo.media.id)} data-testid="photo-thumb">
            {urls[photo.media.id]
              // eslint-disable-next-line @next/next/no-img-element -- URL signée courte d'un bucket privé.
              ? <img src={urls[photo.media.id]} alt={photo.anchors[0]?.donnees.legende || "Photo de terrain"} loading="lazy" />
              : <span className={styles.placeholder}>…</span>}
            <span className={styles.thumbCaption}>
              <strong>{photo.anchors[0]?.donnees.legende || describeAnchorShort(photo, library)}</strong>
              <small>{photo.media.metadata.priseLe ? dateFormat.format(new Date(photo.media.metadata.priseLe)) : ""}{photo.annotations.length ? ` · ${photo.annotations.length} annot.` : ""}{photo.anchors[0]?.donnees.reperes?.length ? ` · ${photo.anchors[0].donnees.reperes.length} repère(s)` : ""}</small>
            </span>
          </button>
        </li>)}</ul>
      </section>

      {current && <PhotoDetail key={current.media.id} entry={current} url={urls[current.media.id] ?? null} library={library} service={media} canEdit={canEdit}
        canRemoveFile={media.canRemoveFile(releve, current.media)} busy={busy} run={run} onReplace={() => startReplace(current)} onClose={() => setSelected(null)} />}
    </div>

    {camera && <CameraCapture onClose={() => setCamera(null)} onCapture={(blob, capturedAt) => { setCamera(null); void prepare(blob, "camera_web", { captureAt: capturedAt, name: null }, camera.replace); }} />}
  </>;
}

function describeTarget(target: PhotoTarget, library: PhotoLibrary): string {
  if (target.kind === "releve") return PHOTO_TARGET_LABELS.releve;
  const ancre = target.kind === "plan" ? { kind: "plan" as const, etageId: target.etageId as never, x: target.x, y: target.y }
    : { kind: "entite" as const, ref: { kind: target.kind === "mur" || target.kind === "equipement" ? "element" as const : target.kind, id: target.id } };
  return describeAnchor(ancre, library.structure, library.elements);
}

function describeAnchorShort(photo: PhotoEntry, library: PhotoLibrary): string {
  const anchor = photo.anchors[0];
  return anchor ? describeAnchor(anchor.donnees.ancre, library.structure, library.elements) : "Photo";
}
