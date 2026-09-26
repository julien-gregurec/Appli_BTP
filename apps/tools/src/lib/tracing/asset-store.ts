/**
 * §39, §40, §44 — Stockage local des octets d'une image de référence.
 *
 * Décision (§40) : le `TracingProject` ne transporte **jamais** les octets d'une image. Il
 * ne garde qu'un `assetRef` opaque ; les octets vivent dans un magasin IndexedDB dédié, en
 * `Blob`. C'est ce qui évite un base64 de plusieurs mégaoctets dans le JSON du projet, et
 * ce qui permet d'effacer une photo sans toucher au tracé.
 *
 * §44 — vie privée : tout reste sur l'appareil. Aucun envoi vers un service externe n'est
 * effectué ici, et aucun n'est prévu sans demande explicite de l'utilisateur.
 *
 * ## Pourquoi une base distincte de `elsatia-atelier`
 *
 * IMAGE-VECTORIZATION-CANONICAL-RECONCILIATION-V1 §4 — les projets vivent dans la base
 * `elsatia-atelier` (`repository.ts`), en version 1. Y ajouter un magasin d'images aurait exigé
 * d'incrémenter sa version, donc de faire passer une migration IndexedDB à TOUS les projets
 * déjà enregistrés — pour une donnée qui n'a ni le même cycle de vie ni la même taille qu'un
 * document projet, et qu'on veut pouvoir purger sans jamais toucher aux tracés.
 *
 * La base est en revanche cloisonnée par le même périmètre que les projets (`local` /
 * `company:<id>`) : une photo de chantier d'une société ne doit pas être lisible depuis un
 * autre périmètre simplement parce qu'elle est rangée ailleurs.
 */

import type { ReferenceImageFormat } from "./reference-image";

export type StoredReferenceAsset = {
  ref: string;
  blob: Blob;
  format: ReferenceImageFormat;
  widthPx: number;
  heightPx: number;
  byteSize: number;
  createdAt: string;
};

export type PutReferenceAssetInput = {
  ref: string;
  blob: Blob;
  format: ReferenceImageFormat;
  widthPx: number;
  heightPx: number;
  createdAt?: string;
};

export interface ReferenceAssetStore {
  put(input: PutReferenceAssetInput): Promise<StoredReferenceAsset>;
  get(ref: string): Promise<StoredReferenceAsset | null>;
  delete(ref: string): Promise<void>;
  listRefs(): Promise<string[]>;
}

const DATABASE_NAME = "elsatia-atelier-assets";
const STORE_NAME = "assets";
const DATABASE_VERSION = 1;

/** Même cloisonnement que les projets (`repository.ts`). */
export type AssetStorageScope = `company:${string}` | "local";

export function assetStorageScope(companyId?: string | null): AssetStorageScope {
  return companyId ? `company:${companyId}` : "local";
}

export function assetDatabaseName(scope: AssetStorageScope): string {
  return scope === "local" ? DATABASE_NAME : `${DATABASE_NAME}-${scope}`;
}

/** Identifiant opaque d'un asset — même fabrique d'identifiants que les projets. */
export function createAssetRef(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `ref-${crypto.randomUUID()}`;
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  return `ref-${Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function isValidAssetRef(ref: unknown): ref is string {
  return typeof ref === "string" && /^ref-[a-zA-Z0-9-]{8,80}$/.test(ref);
}

function normalize(input: PutReferenceAssetInput): StoredReferenceAsset {
  if (!isValidAssetRef(input.ref)) throw new Error("Référence d'image invalide.");
  if (!input.blob || typeof input.blob.size !== "number") throw new Error("Aucune donnée image à enregistrer.");
  if (!Number.isInteger(input.widthPx) || !Number.isInteger(input.heightPx) || input.widthPx < 1 || input.heightPx < 1) {
    throw new Error("Dimensions d'image invalides.");
  }
  return {
    ref: input.ref,
    blob: input.blob,
    format: input.format,
    widthPx: input.widthPx,
    heightPx: input.heightPx,
    byteSize: input.blob.size,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export class IndexedDbReferenceAssetStore implements ReferenceAssetStore {
  constructor(
    private readonly indexedDb: IDBFactory = indexedDB,
    private readonly scope: AssetStorageScope = "local",
  ) {}

  private open() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.indexedDb.open(assetDatabaseName(this.scope), DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "ref" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Stockage des images indisponible."));
    });
  }

  private async request<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = action(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.oncomplete = () => database.close();
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async put(input: PutReferenceAssetInput) {
    const record = normalize(input);
    await this.request<IDBValidKey>("readwrite", (store) => store.put(record));
    return record;
  }

  async get(ref: string) {
    if (!isValidAssetRef(ref)) return null;
    const value = await this.request<StoredReferenceAsset | undefined>("readonly", (store) => store.get(ref));
    return value ?? null;
  }

  async delete(ref: string) {
    if (!isValidAssetRef(ref)) return;
    await this.request<undefined>("readwrite", (store) => store.delete(ref));
  }

  async listRefs() {
    const keys = await this.request<IDBValidKey[]>("readonly", (store) => store.getAllKeys());
    return keys.filter((key): key is string => typeof key === "string");
  }
}

/** Implémentation mémoire — tests et environnements sans IndexedDB. */
export class MemoryReferenceAssetStore implements ReferenceAssetStore {
  private readonly values = new Map<string, StoredReferenceAsset>();

  async put(input: PutReferenceAssetInput) {
    const record = normalize(input);
    this.values.set(record.ref, record);
    return record;
  }

  async get(ref: string) {
    return this.values.get(ref) ?? null;
  }

  async delete(ref: string) {
    this.values.delete(ref);
  }

  async listRefs() {
    return [...this.values.keys()];
  }
}

export function createReferenceAssetStore(scope: AssetStorageScope = "local"): ReferenceAssetStore {
  if (typeof indexedDB === "undefined") throw new Error("Le stockage des images n'est pas disponible sur cette plateforme.");
  return new IndexedDbReferenceAssetStore(indexedDB, scope);
}

/**
 * Supprime les images orphelines : celles qui ne sont plus référencées par aucun projet.
 * À appeler après suppression d'un projet ou d'une image (§39).
 */
export async function pruneOrphanAssets(store: ReferenceAssetStore, referencedRefs: readonly string[]): Promise<string[]> {
  const referenced = new Set(referencedRefs);
  const stored = await store.listRefs();
  const removed: string[] = [];
  for (const ref of stored) {
    if (referenced.has(ref)) continue;
    await store.delete(ref);
    removed.push(ref);
  }
  return removed;
}
