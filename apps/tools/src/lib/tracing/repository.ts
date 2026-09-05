/**
 * §2 / §10 — Repository local dédié aux `TracingProject` de l'Atelier.
 *
 * Distinct du repository `ToolProject` (`../projects/repository.ts`) : namespace IndexedDB
 * propre (`elsatia-atelier`), store propre (`tracing-projects`). On s'en inspire sans le
 * copier — même contrat CRUD, même cloisonnement par entreprise, mêmes variantes
 * IndexedDB + mémoire (tests).
 *
 * `TracingProjectRepository` est une interface : une future synchronisation cloud
 * (cf. `../projects/sync.ts`) pourra fournir une autre implémentation sans toucher aux
 * appelants. Aucun projet complet n'est stocké en `localStorage` (§2).
 */

import { validateTracingProject, type TracingProject } from "./project";
import { migrateTracingProject } from "./migration";

export interface TracingProjectRepository {
  list(): Promise<TracingProject[]>;
  get(id: string): Promise<TracingProject | null>;
  /** Insère un nouveau tracé. Échoue si l'identifiant existe déjà. */
  create(project: TracingProject): Promise<TracingProject>;
  /** Écrit (insert-or-update) l'état courant d'un tracé — voie de l'autosave. */
  save(project: TracingProject): Promise<TracingProject>;
  delete(id: string): Promise<void>;
}

const DATABASE_NAME = "elsatia-atelier";
const STORE_NAME = "tracing-projects";
const DATABASE_VERSION = 1;

export type TracingStorageScope = `company:${string}` | "local";

export function tracingStorageScope(companyId?: string | null): TracingStorageScope {
  return companyId ? `company:${companyId}` : "local";
}

export function tracingDatabaseName(scope: TracingStorageScope): string {
  return scope === "local" ? DATABASE_NAME : `${DATABASE_NAME}-${scope}`;
}

export class TracingProjectExistsError extends Error {}

/** Lecture tolérante d'un enregistrement stocké (peut être à une version antérieure). */
function readStored(value: unknown): TracingProject {
  return migrateTracingProject(value);
}

/** Écriture : on n'accepte que la version courante, strictement validée. */
function forWrite(project: TracingProject): TracingProject {
  return validateTracingProject(project);
}

export class IndexedDbTracingProjectRepository implements TracingProjectRepository {
  constructor(
    private readonly indexedDb: IDBFactory = indexedDB,
    private readonly scope: TracingStorageScope = "local",
  ) {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = this.indexedDb.open(tracingDatabaseName(this.scope), DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Stockage de l'Atelier indisponible."));
    });
  }

  private async request<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
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

  async list(): Promise<TracingProject[]> {
    const values = await this.request<unknown[]>("readonly", (store) => store.getAll() as IDBRequest<unknown[]>);
    return values.map(readStored).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<TracingProject | null> {
    const value = await this.request<unknown>("readonly", (store) => store.get(id) as IDBRequest<unknown>);
    return value ? readStored(value) : null;
  }

  async create(project: TracingProject): Promise<TracingProject> {
    const validated = forWrite(project);
    if (await this.get(validated.id)) throw new TracingProjectExistsError("Un tracé porte déjà cet identifiant.");
    await this.request<IDBValidKey>("readwrite", (store) => store.put(validated));
    return validated;
  }

  async save(project: TracingProject): Promise<TracingProject> {
    const validated = forWrite(project);
    await this.request<IDBValidKey>("readwrite", (store) => store.put(validated));
    return validated;
  }

  async delete(id: string): Promise<void> {
    await this.request<undefined>("readwrite", (store) => store.delete(id) as IDBRequest<undefined>);
  }
}

export class MemoryTracingProjectRepository implements TracingProjectRepository {
  private readonly values = new Map<string, TracingProject>();

  async list(): Promise<TracingProject[]> {
    return [...this.values.values()].map(readStored).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<TracingProject | null> {
    const value = this.values.get(id);
    return value ? readStored(value) : null;
  }

  async create(project: TracingProject): Promise<TracingProject> {
    const validated = forWrite(project);
    if (this.values.has(validated.id)) throw new TracingProjectExistsError("Un tracé porte déjà cet identifiant.");
    this.values.set(validated.id, structuredClone(validated));
    return validated;
  }

  async save(project: TracingProject): Promise<TracingProject> {
    const validated = forWrite(project);
    this.values.set(validated.id, structuredClone(validated));
    return validated;
  }

  async delete(id: string): Promise<void> {
    this.values.delete(id);
  }
}

export function createTracingProjectRepository(scope: TracingStorageScope = "local"): TracingProjectRepository {
  if (typeof indexedDB === "undefined") {
    throw new Error("Le stockage de l'Atelier n'est pas disponible sur cette plateforme.");
  }
  return new IndexedDbTracingProjectRepository(indexedDB, scope);
}
