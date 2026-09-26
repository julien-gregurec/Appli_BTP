import type { SupabaseClient } from "@supabase/supabase-js";
import { createProjectId, migrateProject, type ToolProject } from "./model";
import type { ProjectRepository, ProjectStorageScope } from "./repository";

export type ProjectSyncStatus = "local-only" | "pending" | "synced" | "conflict" | "error";
export type ProjectSyncRecord = {
  projectId: string; revision: number; status: ProjectSyncStatus; dirty: boolean;
  project: ToolProject; deletedAt?: string; error?: string; cloudUpdatedAt?: string;
};
export type CloudPushResult = { status: "applied" | "conflict"; revision: number; project: ToolProject; cloudUpdatedAt: string };
export type CloudProject = { project: ToolProject; revision: number; deletedAt?: string; cloudUpdatedAt: string };

export interface SyncStateRepository {
  list(): Promise<ProjectSyncRecord[]>; get(projectId: string): Promise<ProjectSyncRecord | null>;
  put(record: ProjectSyncRecord): Promise<void>; delete(projectId: string): Promise<void>;
}
export interface CloudProjectStore { push(record: ProjectSyncRecord, deviceId: string): Promise<CloudPushResult>; pull(since?: string): Promise<CloudProject[]>; }

const DATABASE = "elsatia-tools-sync"; const STORE = "queue";
export function syncDatabaseName(scope: ProjectStorageScope) { return scope === "local" ? DATABASE : `${DATABASE}-${scope}`; }
export class IndexedDbSyncStateRepository implements SyncStateRepository {
  constructor(private readonly indexedDb: IDBFactory = indexedDB, private readonly scope: ProjectStorageScope = "local") {}
  private open() { return new Promise<IDBDatabase>((resolve, reject) => { const request = this.indexedDb.open(syncDatabaseName(this.scope), 1); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "projectId" }); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  private async request<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) { const database = await this.open(); return new Promise<T>((resolve, reject) => { const transaction = database.transaction(STORE, mode); const request = action(transaction.objectStore(STORE)); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); transaction.oncomplete = () => database.close(); transaction.onerror = () => reject(transaction.error); }); }
  async list() { return this.request<ProjectSyncRecord[]>("readonly", (store) => store.getAll()); }
  async get(projectId: string) { return (await this.request<ProjectSyncRecord | undefined>("readonly", (store) => store.get(projectId))) ?? null; }
  async put(record: ProjectSyncRecord) { await this.request<IDBValidKey>("readwrite", (store) => store.put(record)); }
  async delete(projectId: string) { await this.request<undefined>("readwrite", (store) => store.delete(projectId)); }
}
export class MemorySyncStateRepository implements SyncStateRepository {
  private values = new Map<string, ProjectSyncRecord>();
  async list() { return [...this.values.values()].map((value) => structuredClone(value)); }
  async get(id: string) { return this.values.has(id) ? structuredClone(this.values.get(id)!) : null; }
  async put(record: ProjectSyncRecord) { this.values.set(record.projectId, structuredClone(record)); }
  async delete(id: string) { this.values.delete(id); }
}

export class SupabaseCloudProjectStore implements CloudProjectStore {
  constructor(private readonly client: SupabaseClient, private readonly companyId: string) {}
  async push(record: ProjectSyncRecord, deviceId: string) {
    const payload = { ...record.project, ...(record.deletedAt ? { deletedAt: record.deletedAt } : {}) };
    const { data, error } = await this.client.rpc("tools_sync_project_entreprise", { p_entreprise_id: this.companyId, p_project: payload, p_expected_revision: record.revision, p_device_id: deviceId });
    if (error) throw new Error("Synchronisation cloud impossible.");
    const value = data as { status: "applied" | "conflict"; revision: number; project: unknown; cloud_updated_at: string };
    return { status: value.status, revision: value.revision, project: migrateProject(value.project), cloudUpdatedAt: value.cloud_updated_at };
  }
  async pull(since?: string) {
    let query = this.client.from("tools_projects").select("project_payload,revision,deleted_at,cloud_updated_at").eq("organization_id", this.companyId).order("cloud_updated_at", { ascending: true });
    if (since) query = query.gt("cloud_updated_at", since);
    const { data, error } = await query;
    if (error) throw new Error("Téléchargement des projets impossible.");
    return (data ?? []).map((row) => ({ project: migrateProject(row.project_payload), revision: row.revision, deletedAt: row.deleted_at ?? undefined, cloudUpdatedAt: row.cloud_updated_at }));
  }
}

function conflictName(project: ToolProject, deviceLabel: string, now: Date) {
  const date = new Intl.DateTimeFormat("fr-FR").format(now);
  return `${project.name} — conflit ${deviceLabel} ${date}`.slice(0, 100);
}

export class SyncService {
  constructor(private readonly local: ProjectRepository, private readonly state: SyncStateRepository, private readonly cloud: CloudProjectStore, private readonly deviceId: string, private readonly now = () => new Date(), private readonly id = createProjectId) {}
  async enqueue(project: ToolProject) {
    const current = await this.state.get(project.id);
    await this.state.put({ projectId: project.id, project: migrateProject(project), revision: current?.revision ?? 0, dirty: true, status: "pending" });
  }
  async enqueueDelete(project: ToolProject) {
    const current = await this.state.get(project.id);
    await this.state.put({ projectId: project.id, project: migrateProject(project), revision: current?.revision ?? 0, dirty: true, status: "pending", deletedAt: this.now().toISOString() });
  }
  async enqueueInitialProjects() {
    const known = new Set((await this.state.list()).map((record) => record.projectId));
    for (const project of await this.local.list()) if (!known.has(project.id) && project.source !== "imported") await this.enqueue(project);
  }
  private async preserveConflict(localProject: ToolProject, remote: CloudProject) {
    const timestamp = this.now().toISOString();
    const copy = migrateProject({ ...localProject, id: this.id(), name: conflictName(localProject, this.deviceId, this.now()), createdAt: timestamp, updatedAt: timestamp, source: "duplicated" });
    await this.local.put(copy);
    await this.state.put({ projectId: copy.id, project: copy, revision: 0, dirty: true, status: "conflict" });
    if (remote.deletedAt) await this.local.delete(remote.project.id); else await this.local.put(remote.project);
    await this.state.put({ projectId: remote.project.id, project: remote.project, revision: remote.revision, dirty: false, status: "conflict", deletedAt: remote.deletedAt, cloudUpdatedAt: remote.cloudUpdatedAt });
  }
  async sync() {
    const latestBeforePush = (await this.state.list()).map((item) => item.cloudUpdatedAt).filter((value): value is string => Boolean(value)).sort().at(-1);
    const records = await this.state.list();
    for (const record of records.filter((item) => item.dirty)) {
      try {
        const result = await this.cloud.push(record, this.deviceId);
        if (result.status === "conflict") await this.preserveConflict(record.project, { ...result, deletedAt: undefined });
        else await this.state.put({ ...record, revision: result.revision, dirty: false, status: "synced", cloudUpdatedAt: result.cloudUpdatedAt });
      } catch (error) { await this.state.put({ ...record, status: "error", error: error instanceof Error ? error.message : "Synchronisation impossible." }); }
    }
    for (const remote of await this.cloud.pull(latestBeforePush)) {
      const localRecord = await this.state.get(remote.project.id);
      if (localRecord?.dirty && remote.revision > localRecord.revision) { await this.preserveConflict(localRecord.project, remote); continue; }
      if (remote.deletedAt) await this.local.delete(remote.project.id); else await this.local.put(remote.project);
      await this.state.put({ projectId: remote.project.id, project: remote.project, revision: remote.revision, dirty: false, status: "synced", deletedAt: remote.deletedAt, cloudUpdatedAt: remote.cloudUpdatedAt });
    }
  }
}
