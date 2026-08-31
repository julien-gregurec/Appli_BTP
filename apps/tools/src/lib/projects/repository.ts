import { migrateProject, type ToolProject } from "./model";

export interface ProjectRepository {
  list(): Promise<ToolProject[]>;
  get(id: string): Promise<ToolProject | null>;
  put(project: ToolProject): Promise<void>;
  delete(id: string): Promise<void>;
}

const DATABASE_NAME = "elsatia-tools"; const STORE_NAME = "projects"; const DATABASE_VERSION = 1;

export type ProjectStorageScope = `company:${string}` | "local";

export function projectStorageScope(companyId?: string | null): ProjectStorageScope {
  return companyId ? `company:${companyId}` : "local";
}

export function projectDatabaseName(scope: ProjectStorageScope) {
  return scope === "local" ? DATABASE_NAME : `${DATABASE_NAME}-${scope}`;
}

export class IndexedDbProjectRepository implements ProjectRepository {
  constructor(private readonly indexedDb: IDBFactory = indexedDB, private readonly scope: ProjectStorageScope = "local") {}
  private open() {
    return new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.indexedDb.open(projectDatabaseName(this.scope), DATABASE_VERSION);
      request.onupgradeneeded = () => { const database = request.result; if (!database.objectStoreNames.contains(STORE_NAME)) { const store = database.createObjectStore(STORE_NAME, { keyPath: "id" }); store.createIndex("updatedAt", "updatedAt"); store.createIndex("archived", "archived"); } };
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponible."));
    });
  }
  private async request<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
    const database = await this.open();
    return new Promise<T>((resolve, reject) => { const transaction = database.transaction(STORE_NAME, mode); const request = action(transaction.objectStore(STORE_NAME)); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); transaction.oncomplete = () => database.close(); transaction.onerror = () => reject(transaction.error); });
  }
  async list() { const values = await this.request<ToolProject[]>("readonly", (store) => store.getAll()); return values.map(migrateProject).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async get(id: string) { const value = await this.request<ToolProject | undefined>("readonly", (store) => store.get(id)); return value ? migrateProject(value) : null; }
  async put(project: ToolProject) { await this.request<IDBValidKey>("readwrite", (store) => store.put(migrateProject(project))); }
  async delete(id: string) { await this.request<undefined>("readwrite", (store) => store.delete(id)); }
}

export class MemoryProjectRepository implements ProjectRepository {
  private values = new Map<string, ToolProject>();
  async list() { return [...this.values.values()].map(migrateProject).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async get(id: string) { const project = this.values.get(id); return project ? migrateProject(project) : null; }
  async put(project: ToolProject) { this.values.set(project.id, structuredClone(migrateProject(project))); }
  async delete(id: string) { this.values.delete(id); }
}

export function createProjectRepository(scope: ProjectStorageScope = "local"): ProjectRepository {
  if (typeof indexedDB === "undefined") throw new Error("Le stockage de projets n’est pas disponible sur cette plateforme.");
  return new IndexedDbProjectRepository(indexedDB, scope);
}
