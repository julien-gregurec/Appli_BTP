/**
 * File locale « à synchroniser » des photos (Lot 4 — préparation hors ligne).
 *
 * Ce n'est PAS le hors-ligne complet du relevé (Lot 3/11) : seules les photos prises sans
 * réseau — ou dont l'envoi a échoué — sont conservées sur l'appareil (octets compressés +
 * lignes préparées) puis envoyées dès que possible, étape par étape :
 *
 *   fichier (bucket) → ligne média → PhotoAnchor → [remplacement de l'ancienne photo]
 *
 * (miniature déposée avant la photo quand elle existe.)
 *
 * États (contrat de la file) : `en_attente` = PENDING_UPLOAD, `en_cours` = UPLOADING,
 * `synchronise` = SYNCED (octets locaux libérés, conservé brièvement pour la déduplication et
 * l'affichage), `echec` = ERROR (refus serveur, action requise).
 *
 * Chaque étape est idempotente (identifiants client, « déjà présent » = succès) et mémorisée :
 * une reprise après coupure ne rejoue que ce qui manque. Une erreur réseau reprogramme
 * l'élément (délai croissant) ; un refus serveur (droits, validation) le met en échec visible,
 * jamais supprimé en silence : c'est l'utilisateur qui relance ou abandonne.
 */

import type { MediaId } from "./ids";
import { MediaRemoteError, type NewElementRow, type NewMediaRow, type PreparedPhoto, type ReleveMediaRepository } from "./media-service";

export const UPLOAD_STATUSES = ["en_attente", "en_cours", "synchronise", "echec"] as const;
export type UploadStatus = (typeof UPLOAD_STATUSES)[number];
export const UPLOAD_STATUS_LABELS: Record<UploadStatus, string> = {
  en_attente: "À synchroniser", en_cours: "Envoi en cours", synchronise: "Synchronisée", echec: "Échec — action requise",
};
/** Noms du contrat de file (mission Lot 4) → valeurs persistées. */
export const UPLOAD_STATUS_CONTRACT = {
  PENDING_UPLOAD: "en_attente", UPLOADING: "en_cours", SYNCED: "synchronise", ERROR: "echec",
} as const satisfies Record<string, UploadStatus>;

/** Durée de conservation d'un élément synchronisé (sans ses octets) avant nettoyage. */
export const SYNCED_RETENTION_MS = 24 * 3_600_000;

export type UploadSteps = { miniature?: boolean; fichier: boolean; media: boolean; ancre: boolean; remplacement: boolean };

export type PendingPhoto = {
  readonly id: string;
  readonly releveId: string;
  readonly entrepriseId: string;
  readonly storagePath: string;
  /** Chemin de la miniature (absente : photo sans miniature). */
  readonly miniaturePath?: string | null;
  readonly mimeType: string;
  readonly media: NewMediaRow;
  readonly anchor: NewElementRow;
  /** Photo à remplacer une fois la nouvelle entièrement déposée. */
  readonly replaceMediaId: string | null;
  readonly label: string;
  status: UploadStatus;
  attempts: number;
  lastError: string | null;
  readonly createdAt: string;
  nextAttemptAt: string | null;
  steps: UploadSteps;
  syncedAt?: string | null;
};

export type StoredBytesKind = "photo" | "miniature";

export interface UploadQueueStore {
  list(): Promise<PendingPhoto[]>;
  /** Enregistre (ou met à jour) un élément ; les octets ne sont fournis qu'à la création. */
  put(item: PendingPhoto, bytes?: Blob | Uint8Array, miniature?: Blob | Uint8Array | null): Promise<void>;
  bytes(id: string, kind?: StoredBytesKind): Promise<Blob | Uint8Array | null>;
  /** Libère les octets locaux (élément synchronisé) sans retirer l'élément. */
  release(id: string): Promise<void>;
  remove(id: string): Promise<void>;
}

/** Stockage mémoire (tests, et repli quand IndexedDB est indisponible : navigation privée). */
export class MemoryUploadQueueStore implements UploadQueueStore {
  private readonly items = new Map<string, PendingPhoto>();
  private readonly blobs = new Map<string, Blob | Uint8Array>();
  readonly persistent = false;
  async list() { return [...this.items.values()].map((item) => ({ ...item, steps: { ...item.steps } })).sort((a, b) => a.createdAt.localeCompare(b.createdAt)); }
  async put(item: PendingPhoto, bytes?: Blob | Uint8Array, miniature?: Blob | Uint8Array | null) {
    if (!this.items.has(item.id) && !bytes) throw new Error("Octets requis à la mise en file.");
    this.items.set(item.id, { ...item, steps: { ...item.steps } });
    if (bytes) this.blobs.set(item.id, bytes);
    if (miniature) this.blobs.set(`${item.id}:miniature`, miniature);
  }
  async bytes(id: string, kind: StoredBytesKind = "photo") { return this.blobs.get(kind === "photo" ? id : `${id}:miniature`) ?? null; }
  async release(id: string) { this.blobs.delete(id); this.blobs.delete(`${id}:miniature`); }
  async remove(id: string) { this.items.delete(id); await this.release(id); }
}

/** Nom de base IndexedDB : une file par utilisateur ET par entreprise (jamais d'envoi sous un autre compte). */
export function uploadQueueDatabaseName(userId: string, entrepriseId: string): string {
  return `elsatia-releve-file:${userId}:${entrepriseId}`;
}

/** 5 s, 10 s, 20 s… plafonné à 5 min. */
export function retryDelayMs(attempts: number): number {
  return Math.min(5_000 * 2 ** Math.max(0, attempts - 1), 300_000);
}

/** Photo déjà en file (même SHA-256, même relevé), non abandonnée : on ne la remet pas en file. */
export class DuplicatePendingPhotoError extends Error {
  constructor(public readonly existing: PendingPhoto) { super("Cette photo est déjà en file d'envoi."); this.name = "DuplicatePendingPhotoError"; }
}

export async function findPendingDuplicate(store: UploadQueueStore, releveId: string, empreinteSha256: string): Promise<PendingPhoto | null> {
  return (await store.list()).find((item) => item.releveId === releveId && item.media.metadata.empreinteSha256 === empreinteSha256) ?? null;
}

export async function enqueuePhoto(
  store: UploadQueueStore, prepared: PreparedPhoto, bytes: Blob | Uint8Array,
  options: { label: string; replaceMediaId?: string | null; now?: () => Date; miniature?: Blob | Uint8Array | null },
): Promise<PendingPhoto> {
  const now = (options.now ?? (() => new Date()))().toISOString();
  const duplicate = await findPendingDuplicate(store, prepared.media.releveId, prepared.media.metadata.empreinteSha256);
  if (duplicate) throw new DuplicatePendingPhotoError(duplicate);
  const withMiniature = Boolean(prepared.miniaturePath && options.miniature);
  const item: PendingPhoto = {
    id: prepared.mediaId, releveId: prepared.media.releveId, entrepriseId: prepared.media.entrepriseId, storagePath: prepared.storagePath,
    miniaturePath: withMiniature ? prepared.miniaturePath : null,
    mimeType: prepared.media.mimeType, media: withMiniature ? prepared.media : { ...prepared.media, miniatureStoragePath: null }, anchor: prepared.anchor, replaceMediaId: options.replaceMediaId ?? null,
    label: options.label, status: "en_attente", attempts: 0, lastError: null, createdAt: now, nextAttemptAt: null,
    // Remplacement : la nouvelle photo hérite des rattachements de l'ancienne (RPC), elle n'en crée pas.
    steps: { miniature: !withMiniature, fichier: false, media: false, ancre: Boolean(options.replaceMediaId), remplacement: !options.replaceMediaId },
    syncedAt: null,
  };
  await store.put(item, bytes, withMiniature ? options.miniature : null);
  return item;
}

export type QueueRunResult = { synced: PendingPhoto[]; retrying: PendingPhoto[]; failed: PendingPhoto[] };

export type QueueHooks = {
  /** Remplacement (droits et suppression du fichier gérés par le service). Défaut : RPC seule. */
  replace?: (item: PendingPhoto) => Promise<void>;
  /** Appelé après chaque changement d'état (rafraîchissement de l'interface). */
  onChange?: (item: PendingPhoto) => void;
};

const running = new WeakSet<UploadQueueStore>();

/**
 * Traite les éléments dus (tous si `force`). Une seule exécution à la fois par file. Les
 * éléments `en_cours` hérités d'une exécution interrompue (onglet fermé) sont repris.
 */
export async function processUploadQueue(
  store: UploadQueueStore, repository: ReleveMediaRepository,
  options: { now?: () => Date; force?: boolean; releveId?: string; hooks?: QueueHooks } = {},
): Promise<QueueRunResult> {
  const result: QueueRunResult = { synced: [], retrying: [], failed: [] };
  if (running.has(store)) return result;
  running.add(store);
  const now = options.now ?? (() => new Date());
  try {
    for (const item of await store.list()) {
      if (item.status === "synchronise") {
        // Nettoyage : un élément synchronisé n'est gardé qu'un temps (sans ses octets).
        if (item.syncedAt && now().getTime() - Date.parse(item.syncedAt) > SYNCED_RETENTION_MS) await store.remove(item.id);
        continue;
      }
      if (options.releveId && item.releveId !== options.releveId) continue;
      if (item.status === "echec" && !options.force) continue;
      if (!options.force && item.nextAttemptAt && item.nextAttemptAt > now().toISOString()) continue;
      item.status = "en_cours"; item.attempts += 1; item.lastError = null;
      await store.put(item); options.hooks?.onChange?.(item);
      try {
        if (item.steps.miniature === false && item.miniaturePath) {
          const miniature = await store.bytes(item.id, "miniature");
          if (!miniature) throw new MediaRemoteError("Miniature locale introuvable (stockage du navigateur effacé ?).", "invalid");
          await repository.uploadObject(item.miniaturePath, miniature, "image/jpeg");
          item.steps.miniature = true; await store.put(item);
        }
        if (!item.steps.fichier) {
          const bytes = await store.bytes(item.id);
          if (!bytes) throw new MediaRemoteError("Fichier local introuvable (stockage du navigateur effacé ?).", "invalid");
          await repository.uploadObject(item.storagePath, bytes, item.mimeType);
          item.steps.fichier = true; await store.put(item);
        }
        if (!item.steps.media) { await repository.insertMedia(item.media); item.steps.media = true; await store.put(item); }
        if (!item.steps.ancre) { await repository.insertElement(item.anchor); item.steps.ancre = true; await store.put(item); }
        if (!item.steps.remplacement && item.replaceMediaId) {
          if (options.hooks?.replace) await options.hooks.replace(item);
          else await repository.replacePhoto(item.replaceMediaId as MediaId, item.media.id);
          item.steps.remplacement = true; await store.put(item);
        }
        item.status = "synchronise"; item.syncedAt = now().toISOString(); item.nextAttemptAt = null;
        await store.put(item); await store.release(item.id);
        result.synced.push(item);
      } catch (error) {
        const remote = error instanceof MediaRemoteError ? error : null;
        item.lastError = error instanceof Error ? error.message : "Envoi impossible.";
        if (!remote || remote.kind === "network") {
          item.status = "en_attente";
          item.nextAttemptAt = new Date(now().getTime() + retryDelayMs(item.attempts)).toISOString();
          result.retrying.push(item);
        } else {
          item.status = "echec"; item.nextAttemptAt = null;
          result.failed.push(item);
        }
        await store.put(item);
      }
      options.hooks?.onChange?.(item);
    }
  } finally {
    running.delete(store);
  }
  return result;
}

/**
 * Abandon explicite d'un élément (l'utilisateur renonce à la photo non envoyée). Si le fichier
 * avait déjà été déposé sans que sa ligne média existe, on tente de le retirer du bucket
 * (sinon il ne serait rattaché à rien ; la purge RGPD d'entreprise le couvre de toute façon).
 */
export async function discardPending(store: UploadQueueStore, id: string, repository?: ReleveMediaRepository): Promise<void> {
  const item = (await store.list()).find((candidate) => candidate.id === id);
  if (item && repository && !item.steps.media) {
    const paths = [...(item.steps.fichier ? [item.storagePath] : []), ...(item.steps.miniature && item.miniaturePath ? [item.miniaturePath] : [])];
    if (paths.length) { try { await repository.removeObjects(paths); } catch { /* meilleur effort */ } }
  }
  await store.remove(id);
}

/** Éléments à montrer à l'utilisateur (non synchronisés) pour un relevé. */
export function visiblePending(items: readonly PendingPhoto[], releveId: string): PendingPhoto[] {
  return items.filter((item) => item.releveId === releveId && item.status !== "synchronise");
}
