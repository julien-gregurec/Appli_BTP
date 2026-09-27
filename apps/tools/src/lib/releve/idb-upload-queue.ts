/**
 * Stockage IndexedDB de la file « à synchroniser » (Lot 4). Une base par utilisateur ET par
 * entreprise (`uploadQueueDatabaseName`) : une photo en attente ne sera jamais envoyée sous
 * un autre compte. Les octets sont stockés en `ArrayBuffer` (plus robuste que `Blob` sur les
 * anciens WebKit). Repli mémoire si IndexedDB est indisponible (navigation privée stricte) :
 * l'interface le signale, la photo est alors perdue si l'onglet est fermé avant l'envoi.
 */
import { MemoryUploadQueueStore, uploadQueueDatabaseName, type PendingPhoto, type UploadQueueStore } from "@elsatia/releve-domain";

const ITEMS = "items";
const BYTES = "bytes";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
}

export class IndexedDbUploadQueueStore implements UploadQueueStore {
  readonly persistent = true;
  private constructor(private readonly db: IDBDatabase) {}

  static async open(name: string): Promise<IndexedDbUploadQueueStore> {
    const open = indexedDB.open(name, 1);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains(ITEMS)) db.createObjectStore(ITEMS, { keyPath: "id" });
      if (!db.objectStoreNames.contains(BYTES)) db.createObjectStore(BYTES);
    };
    return new IndexedDbUploadQueueStore(await request(open));
  }

  async list(): Promise<PendingPhoto[]> {
    const tx = this.db.transaction(ITEMS, "readonly");
    const items = await request(tx.objectStore(ITEMS).getAll() as IDBRequest<PendingPhoto[]>);
    return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async put(item: PendingPhoto, bytes?: Blob | Uint8Array): Promise<void> {
    const buffer = bytes ? (bytes instanceof Uint8Array ? bytes.slice().buffer : await bytes.arrayBuffer()) : null;
    const tx = this.db.transaction([ITEMS, BYTES], "readwrite");
    tx.objectStore(ITEMS).put(JSON.parse(JSON.stringify(item)));
    if (buffer) tx.objectStore(BYTES).put(buffer, item.id);
    await done(tx);
  }

  async bytes(id: string): Promise<Uint8Array | null> {
    const tx = this.db.transaction(BYTES, "readonly");
    const buffer = await request(tx.objectStore(BYTES).get(id) as IDBRequest<ArrayBuffer | undefined>);
    return buffer ? new Uint8Array(buffer) : null;
  }

  async remove(id: string): Promise<void> {
    const tx = this.db.transaction([ITEMS, BYTES], "readwrite");
    tx.objectStore(ITEMS).delete(id);
    tx.objectStore(BYTES).delete(id);
    await done(tx);
  }
}

export type OpenedQueue = { store: UploadQueueStore; persistent: boolean };

/** Ouvre la file de l'utilisateur pour l'entreprise active ; repli mémoire documenté. */
export async function openUploadQueue(userId: string, entrepriseId: string): Promise<OpenedQueue> {
  if (typeof indexedDB !== "undefined") {
    try {
      const store = await IndexedDbUploadQueueStore.open(uploadQueueDatabaseName(userId, entrepriseId));
      // Meilleur effort : demande au navigateur de ne pas évincer la file sous pression de stockage.
      void navigator.storage?.persist?.().catch(() => false);
      return { store, persistent: true };
    } catch { /* repli mémoire ci-dessous */ }
  }
  return { store: new MemoryUploadQueueStore(), persistent: false };
}
