"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  allowedActions, breadcrumbFor, countByNode, describeAnchor, discardPending, DuplicatePendingPhotoError, enqueuePhoto, paginate,
  processUploadQueue, PHOTO_SOURCE_LABELS, PHOTO_TARGET_LABELS, ReleveMediaService, scopeLabel, selectGallery, UPLOAD_STATUS_LABELS,
  VERSION_TYPE_LABELS, VERSION_TYPES, visiblePending,
  type CaptureCapabilities, type GalleryFilters, type GalleryScope, type PendingPhoto, type PhotoEntry, type PhotoLibrary,
  type PhotoSource, type PhotoTarget, type ReleveActorContext, type ReleveId, type UploadQueueStore, type VersionType,
} from "@elsatia/releve-domain";
import { getElsatiaClient } from "@/lib/auth/client";
import { openUploadQueue } from "@/lib/releve/idb-upload-queue";
import { ficheHref, photosHref, pieceHref, readPhotosSelection, RELEVES_PATH, structureHref } from "@/lib/releve/navigation";
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

type Selection = NonNullable<ReturnType<typeof readPhotosSelection>>;

export function RelevePhotosWorkspace() {
  const state = useReleveService();
  const [selection, setSelection] = useState<Selection | null | undefined>(undefined);
  useEffect(() => {
    const timer = window.setTimeout(() => setSelection(readPhotosSelection(window.location.search)), 0);
    return () => window.clearTimeout(timer);
  }, []);

  return <main className="projects-page">
    <header className="calculator-header shell"><Brand /><Link href={RELEVES_PATH} className="all-tools">Relevés <span>×</span></Link></header>
    {state.status === "locked" && <div className="shell"><ReleveLocked reason={state.reason} /></div>}
    {state.status === "loading" && <p className={`shell ${releveStyles.feedback}`} role="status">Vérification des droits…</p>}
    {state.status === "error" && <p className={`shell ${releveStyles.feedback}`} role="alert">{state.message}</p>}
    {state.status === "ready" && selection === null && <p className={`shell ${releveStyles.feedback}`} role="alert">Relevé introuvable. <Link href={RELEVES_PATH}>Retour aux relevés</Link></p>}
    {state.status === "ready" && selection && <PhotoLibraryEditor key={selection.releveId} releveId={selection.releveId as ReleveId} actor={state.actor} initialScope={selection.scope} openCapture={selection.ajout} />}
  </main>;
}

type Draft = { processed: ProcessedPhoto; previewUrl: string; replace: PhotoEntry | null };
const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" });
const mo = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(2)} Mo`;
const ETAT_LABELS: Record<VersionType, string> = { initial: "Existant", corrige: "Corrigé", projete: "Projeté", as_built: "Tel que construit" };
const SCOPE_LEVEL_LABELS = { chantier: "Chantier", batiment: "Bâtiment", etage: "Étage", zone: "Zone", piece: "Pièce" } as const;

/** Cible de capture par défaut : le nœud dont on regarde la galerie. */
function targetOfScope(scope: GalleryScope): PhotoTarget {
  return scope.kind === "releve" ? { kind: "releve" } : { kind: scope.kind, id: scope.id };
}

function PhotoLibraryEditor({ releveId, actor, initialScope, openCapture }: { releveId: ReleveId; actor: ReleveActorContext; initialScope: GalleryScope; openCapture: boolean }) {
  const client = getElsatiaClient();
  const mediaRepository = useMemo(() => new SupabaseReleveMediaRepository(client), [client]);
  const media = useMemo(() => new ReleveMediaService(mediaRepository, new SupabaseReleveRepository(client), actor), [mediaRepository, client, actor]);
  const [library, setLibrary] = useState<PhotoLibrary | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<GalleryScope>(initialScope);
  const [filters, setFilters] = useState<GalleryFilters>({});
  const [pages, setPages] = useState(1);
  const [captureOpen, setCaptureOpen] = useState(openCapture);
  const [target, setTarget] = useState<PhotoTarget>(targetOfScope(initialScope));
  const [commentaire, setCommentaire] = useState("");
  const [etat, setEtat] = useState<VersionType>("initial");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [camera, setCamera] = useState<{ replace: PhotoEntry | null } | null>(null);
  const [capabilities, setCapabilities] = useState<CaptureCapabilities | null>(null);
  const [queue, setQueue] = useState<{ store: UploadQueueStore; persistent: boolean } | null>(null);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [online, setOnline] = useState(true);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [fullUrl, setFullUrl] = useState<{ id: string; url: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const captureInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const captureSection = useRef<HTMLElement>(null);
  const replaceTarget = useRef<PhotoEntry | null>(null);

  const reload = useCallback(async () => {
    try { setLibrary(await media.library(releveId)); }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Chargement impossible."); }
  }, [media, releveId]);

  const refreshPending = useCallback(async (store: UploadQueueStore) => {
    setPending(visiblePending(await store.list(), releveId));
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
      setPending(visiblePending(await opened.store.list(), releveId));
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

  const gallery = useMemo(() => (library ? selectGallery(library.photos, library.structure, library.elements, scope, filters) : []), [library, scope, filters]);
  const page = useMemo(() => paginate(gallery, pages), [gallery, pages]);
  const counts = useMemo(() => (library ? countByNode(library.photos, library.structure, library.elements) : new Map<string, number>()), [library]);

  // Vignettes : UNE signature groupée par page affichée (miniatures ~15–40 Ko), jamais les
  // originaux. Une URL déjà obtenue n'est JAMAIS remplacée (sinon l'image, hors écran, repasserait
  // en chargement paresseux) et un identifiant en cours de signature n'est pas redemandé.
  const signing = useRef(new Set<string>());
  useEffect(() => {
    if (!library) return;
    const missing = page.visible.filter((photo) => !thumbs[photo.media.id] && !signing.current.has(photo.media.id));
    if (!missing.length) return;
    for (const photo of missing) signing.current.add(photo.media.id);
    media.thumbnailUrls(library.structure.releve, missing.map((photo) => photo.media))
      .then((urls) => setThumbs((current) => ({ ...urls, ...current })))
      .catch(() => undefined)
      .finally(() => { for (const photo of missing) signing.current.delete(photo.media.id); });
  }, [library, page, thumbs, media]);

  // Image complète : seulement pour la photo ouverte.
  useEffect(() => {
    if (!library || !selected) return;
    const photo = library.photos.find((item) => item.media.id === selected);
    if (!photo || fullUrl?.id === selected) return;
    let cancelled = false;
    media.photoUrl(library.structure.releve, photo.media).then((url) => { if (!cancelled) setFullUrl({ id: photo.media.id, url }); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [library, selected, fullUrl, media]);

  useEffect(() => () => { if (draft) URL.revokeObjectURL(draft.previewUrl); }, [draft]);
  useEffect(() => { if (openCapture) captureSection.current?.scrollIntoView({ block: "start" }); }, [openCapture, library]);

  const actions = useMemo(() => new Set(library ? allowedActions(actor, library.structure.releve) : []), [actor, library]);
  const canEdit = actions.has("edit");

  function changeScope(next: GalleryScope) {
    setScope(next); setPages(1); setSelected(null);
    setTarget(targetOfScope(next));
    window.history.replaceState(null, "", photosHref(releveId, { scope: next }));
  }

  async function run(action: () => Promise<unknown>, message: string) {
    setBusy(true); setFeedback("");
    try {
      const outcome = await action();
      await reload();
      // Une action peut préciser son message (ex. fichier conservé par une version figée).
      setFeedback(typeof outcome === "object" && outcome !== null && "feedback" in outcome ? String((outcome as { feedback: unknown }).feedback) : message);
    }
    catch (error) { setFeedback(error instanceof Error ? error.message : "Action impossible."); }
    finally { setBusy(false); }
  }

  async function prepare(file: Blob, source: PhotoSource, meta: { captureAt?: string; lastModified?: number; name?: string | null }, replace: PhotoEntry | null) {
    setBusy(true); setFeedback("Préparation de la photo…");
    try {
      const processed = await processPhoto(file, { source, captureAt: meta.captureAt ?? null, fileLastModified: meta.lastModified ?? null, nomFichier: meta.name ?? null, replaceMediaId: replace?.media.id ?? null });
      if (draft) URL.revokeObjectURL(draft.previewUrl);
      setDraft({ processed, previewUrl: URL.createObjectURL(processed.blob), replace });
      const duplicate = library ? media.findDuplicate(library, processed.metadata.empreinteSha256, processed.metadata.empreinteOrigineSha256) : null;
      setFeedback(duplicate ? "Cette photo est déjà dans le relevé : elle ne sera pas déposée une seconde fois." : "");
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
    const duplicate = media.findDuplicate(library, draft.processed.metadata.empreinteSha256, draft.processed.metadata.empreinteOrigineSha256);
    if (duplicate) { setFeedback("Cette photo est déjà dans le relevé."); setSelected(duplicate.media.id); return; }
    setBusy(true); setFeedback("");
    try {
      const prepared = media.preparePhoto({
        structure: library.structure, elements: library.elements,
        target: draft.replace ? { kind: "releve" } : target, mimeType: draft.processed.blob.type || "image/jpeg", bytes: draft.processed.blob.size,
        metadata: draft.processed.metadata, nomFichier: draft.processed.nomFichier, ordre: library.photos.length,
        thumbnail: draft.processed.miniature ? { bytes: draft.processed.miniature.size } : null,
        commentaire: draft.replace ? null : commentaire, etatDocumente: draft.replace ? draft.replace.media.etatDocumente : etat,
      });
      const label = draft.replace ? "Remplacement de photo" : describeTarget(target, library);
      // En remplacement, la nouvelle photo hérite des rattachements de l'ancienne (RPC) : l'ancre
      // préparée n'est pas écrite (voir `enqueuePhoto`).
      await enqueuePhoto(queue.store, prepared, draft.processed.blob, { label, replaceMediaId: draft.replace?.media.id ?? null, miniature: draft.processed.miniature });
      URL.revokeObjectURL(draft.previewUrl); setDraft(null); setCommentaire("");
      await refreshPending(queue.store);
      if (navigator.onLine) await sync(true);
      else setFeedback("Hors ligne : photo conservée sur l'appareil, envoi automatique au retour du réseau.");
      if (draft.replace) setSelected(prepared.mediaId);
    } catch (error) {
      setFeedback(error instanceof DuplicatePendingPhotoError ? "Cette photo est déjà en file d'envoi." : error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally { setBusy(false); }
  }

  function startReplace(entry: PhotoEntry) {
    replaceTarget.current = entry;
    importInput.current?.click();
  }

  function openCaptureSheet() {
    setCaptureOpen(true);
    window.setTimeout(() => captureSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  if (!library) return <p className={`shell ${releveStyles.feedback}`} role="status">{feedback || "Chargement des photos…"}</p>;
  const { releve } = library.structure;
  const current = library.photos.find((photo) => photo.media.id === selected) ?? null;
  const crumbs = scope.kind === "releve" ? [] : breadcrumbFor(library.structure, { kind: scope.kind, id: scope.id }).slice(1);
  const scopeValue = scope.kind === "releve" ? "releve" : `${scope.kind}:${scope.id}`;
  const scopeOptions = buildScopeOptions(library, counts);
  const versionLabel = (id: string | null) => {
    const version = library.versions.find((item) => item.id === id);
    return version ? `v${version.numero} · ${VERSION_TYPE_LABELS[version.typeVersion]}` : "avant toute version figée";
  };

  return <>
    <section className="tool-hero"><div className="shell">
      <nav aria-label="Fil d'Ariane"><ol className={releveStyles.breadcrumb}>
        <li><Link href={RELEVES_PATH}>Mes relevés</Link></li>
        <li><Link href={ficheHref(releveId)}>{releve.nom}</Link></li>
        {crumbs.map((crumb) => <li key={`${crumb.level}:${crumb.id}`}>
          {crumb.level === "piece" ? <Link href={pieceHref(releveId, crumb.id)}>{crumb.label}</Link>
            : <Link href={structureHref(structureSelectionOf(library, crumb.level, crumb.id))}>{crumb.label}</Link>}
        </li>)}
        <li aria-current="page">Photos</li>
      </ol></nav>
      <p className="eyebrow">PHOTOS TERRAIN · {gallery.length} PHOTO(S){scope.kind !== "releve" ? ` · ${SCOPE_LEVEL_LABELS[scope.kind].toUpperCase()}` : ""}</p>
      <h1 className="projects-title">{scopeLabel(scope, library.structure)}</h1>
      <div className={releveStyles.toolbar}>
        <Link className={releveStyles.secondary} href={structureHref({ releveId })}>Structure</Link>
        <span className={styles.syncBadge} data-online={online} role="status">{online ? "En ligne" : "Hors ligne"}{pending.length ? ` · ${pending.length} à synchroniser` : ""}</span>
      </div>
      <p className={releveStyles.feedback} role="status" aria-live="polite" data-testid="photos-feedback">{feedback}</p>
    </div></section>

    <div className={`shell ${styles.layout}`}>
      {canEdit && <section ref={captureSection} className={styles.capture} aria-label="Ajouter une photo" data-open={captureOpen}>
        <h2>Ajouter une photo</h2>
        {!captureOpen
          ? <button type="button" className={styles.primary} onClick={openCaptureSheet}>Ajouter une photo</button>
          : <>
            <PhotoTargetPicker idPrefix="capture" structure={library.structure} targets={library.targets} value={target} onChange={setTarget} />
            <div className={styles.captureButtons}>
              {capabilities?.liveCamera && <button type="button" className={styles.primary} disabled={busy} onClick={() => setCamera({ replace: null })}>Caméra</button>}
              <button type="button" className={capabilities?.liveCamera ? styles.secondary : styles.primary} disabled={busy} onClick={() => captureInput.current?.click()}>Prendre une photo</button>
              <button type="button" className={styles.secondary} disabled={busy} onClick={() => importInput.current?.click()}>Galerie / fichier</button>
            </div>
            {capabilities && !capabilities.liveCamera && <p className={styles.muted}>{capabilities.liveCameraReason}</p>}
            {queue && !queue.persistent && <p className={styles.alert}>Stockage local indisponible : une photo non envoyée sera perdue si vous fermez la page.</p>}
          </>}
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
          <div><dt>Traitement</dt><dd data-testid="preview-timing">{draft.processed.timings.totalMs} ms</dd></div>
          <div><dt>Localisation</dt><dd>{draft.processed.metadata.gpsRetire ? "GPS d’origine retiré" : "Aucune"}</dd></div>
          <div><dt>{draft.replace ? "Remplace" : "Rattachée à"}</dt><dd>{draft.replace ? (draft.replace.media.commentaire || "photo sélectionnée") : describeTarget(target, library)}</dd></div>
        </dl>
        {!draft.replace && <div className={styles.inlineFields}>
          <label className={styles.field}><span>Commentaire (facultatif)</span>
            <textarea value={commentaire} maxLength={2000} rows={2} placeholder="Constat : fissure, humidité, réseau…" onChange={(event) => setCommentaire(event.target.value)} /></label>
          <label className={styles.field}><span>État documenté</span>
            <select value={etat} onChange={(event) => setEtat(event.target.value as VersionType)}>
              {VERSION_TYPES.map((value) => <option key={value} value={value}>{ETAT_LABELS[value]}</option>)}
            </select></label>
        </div>}
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

      <section aria-label="Galerie" className={styles.gallery}>
        <div className={styles.galleryHead}>
          <h2>Galerie</h2>
          <label className={styles.field}><span>Afficher</span>
            <select value={scopeValue} data-testid="gallery-scope" onChange={(event) => {
              const [kind, id] = event.target.value.split(":");
              changeScope(kind === "releve" ? { kind: "releve" } : { kind: kind as Exclude<GalleryScope["kind"], "releve">, id });
            }}>
              {scopeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select></label>
        </div>
        <div className={styles.filters} role="group" aria-label="Filtres">
          <label className={styles.field}><span>État</span>
            <select value={filters.etat ?? ""} onChange={(event) => { setFilters({ ...filters, etat: (event.target.value || null) as VersionType | null }); setPages(1); }}>
              <option value="">Tous</option>
              {VERSION_TYPES.map((value) => <option key={value} value={value}>{ETAT_LABELS[value]}</option>)}
            </select></label>
          <label className={styles.check}><input type="checkbox" checked={Boolean(filters.recentesJours)} onChange={(event) => setFilters({ ...filters, recentesJours: event.target.checked ? 7 : null })} /> 7 derniers jours</label>
          <label className={styles.check}><input type="checkbox" checked={Boolean(filters.annotees)} onChange={(event) => setFilters({ ...filters, annotees: event.target.checked })} /> Annotées</label>
          <label className={styles.check}><input type="checkbox" checked={Boolean(filters.commentees)} onChange={(event) => setFilters({ ...filters, commentees: event.target.checked })} /> Commentées</label>
        </div>
        {gallery.length === 0 && <p className={styles.muted}>Aucune photo{scope.kind !== "releve" ? " pour ce niveau" : " pour ce relevé"}.</p>}
        <ul className={styles.grid} data-testid="gallery-grid">{page.visible.map((photo) => <li key={photo.media.id}>
          <button type="button" className={styles.thumb} aria-current={photo.media.id === selected} onClick={() => setSelected(photo.media.id)} data-testid="photo-thumb">
            {thumbs[photo.media.id]
              // eslint-disable-next-line @next/next/no-img-element -- URL signée courte d'un bucket privé (miniature).
              ? <img src={thumbs[photo.media.id]} alt={photo.media.commentaire || "Photo de terrain"} loading="lazy" decoding="async" width={240} height={180} />
              : <span className={styles.placeholder}>…</span>}
            <span className={styles.thumbCaption}>
              <strong>{photo.media.commentaire || describeAnchorShort(photo, library)}</strong>
              <small>{photo.media.metadata.priseLe ? dateFormat.format(new Date(photo.media.metadata.priseLe)) : ""}{photo.media.etatDocumente !== "initial" ? ` · ${ETAT_LABELS[photo.media.etatDocumente]}` : ""}{photo.annotations.length ? ` · ${photo.annotations.length} annot.` : ""}</small>
            </span>
          </button>
        </li>)}</ul>
        {page.remaining > 0 && <button type="button" className={styles.secondary} onClick={() => setPages(pages + 1)}>Afficher plus ({page.remaining})</button>}
      </section>

      {current && <PhotoDetail key={current.media.id} entry={current} url={fullUrl?.id === current.media.id ? fullUrl.url : null} library={library} service={media} canEdit={canEdit}
        canRemoveFile={media.canRemoveFile(releve, current.media)} busy={busy} run={run} onReplace={() => startReplace(current)} onClose={() => setSelected(null)}
        onChanged={reload} versionLabel={versionLabel(current.media.versionReferenceId)} sourceLabel={current.media.metadata.source ? PHOTO_SOURCE_LABELS[current.media.metadata.source] : "—"} />}
    </div>

    {canEdit && <div className={styles.actionBar}>
      <button type="button" className={styles.primary} onClick={openCaptureSheet} data-testid="add-photo-bar">Ajouter une photo</button>
    </div>}

    {camera && <CameraCapture onClose={() => setCamera(null)} onCapture={(blob, capturedAt) => { setCamera(null); void prepare(blob, "camera_web", { captureAt: capturedAt, name: null }, camera.replace); }} />}
  </>;
}

/** Relevé entier puis chaque nœud (hiérarchie indentée), avec le nombre de photos. */
function buildScopeOptions(library: PhotoLibrary, counts: Map<string, number>): Array<{ value: string; label: string }> {
  const { structure } = library;
  const alive = <T extends { deletedAt: string | null }>(rows: readonly T[]) => rows.filter((row) => !row.deletedAt);
  const count = (id: string) => ` (${counts.get(id) ?? 0})`;
  const options = [{ value: "releve", label: `Tout le relevé (${library.photos.length})` }];
  for (const chantier of alive(structure.chantiers)) {
    options.push({ value: `chantier:${chantier.id}`, label: `Chantier · ${chantier.nom}${count(chantier.id)}` });
    for (const batiment of alive(structure.batiments).filter((row) => row.chantierId === chantier.id)) {
      options.push({ value: `batiment:${batiment.id}`, label: ` Bâtiment · ${batiment.nom}${count(batiment.id)}` });
      for (const etage of alive(structure.etages).filter((row) => row.batimentId === batiment.id)) {
        options.push({ value: `etage:${etage.id}`, label: `  Étage · ${etage.nom}${count(etage.id)}` });
        for (const zone of alive(structure.zones).filter((row) => row.etageId === etage.id)) {
          options.push({ value: `zone:${zone.id}`, label: `   Zone · ${zone.nom}${count(zone.id)}` });
          for (const piece of alive(structure.pieces).filter((row) => row.zoneId === zone.id)) options.push({ value: `piece:${piece.id}`, label: `    Pièce · ${piece.nom}${count(piece.id)}` });
        }
        for (const piece of alive(structure.pieces).filter((row) => row.etageId === etage.id && !row.zoneId)) options.push({ value: `piece:${piece.id}`, label: `   Pièce · ${piece.nom}${count(piece.id)}` });
      }
    }
  }
  return options;
}

function structureSelectionOf(library: PhotoLibrary, level: string, id: string) {
  const { structure } = library;
  const releveId = structure.releve.id;
  if (level === "chantier") return { releveId, chantierId: id };
  if (level === "batiment") return { releveId, chantierId: structure.batiments.find((row) => row.id === id)?.chantierId ?? null, batimentId: id };
  const etageId = level === "etage" ? id : structure.zones.find((row) => row.id === id)?.etageId ?? null;
  const batimentId = structure.etages.find((row) => row.id === etageId)?.batimentId ?? null;
  return { releveId, chantierId: structure.batiments.find((row) => row.id === batimentId)?.chantierId ?? null, batimentId, etageId };
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
