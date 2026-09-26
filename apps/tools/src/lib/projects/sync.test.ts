import { describe, expect, it } from "vitest";
import { proToolDefaults } from "../pro-engine";
import { createToolProject } from "./model";
import { MemoryProjectRepository } from "./repository";
import { MemorySyncStateRepository, SyncService, type CloudProject, type CloudProjectStore, type CloudPushResult, type ProjectSyncRecord } from "./sync";

function project(name = "Projet", id = "11111111-1111-1111-1111-111111111111") { return createToolProject({ name, toolId: "fleur-6", inputParameters: proToolDefaults["fleur-6"] }, new Date("2026-08-30T10:00:00Z"), id); }
class FakeCloud implements CloudProjectStore {
  pushes: ProjectSyncRecord[] = []; pulls: CloudProject[] = []; next?: CloudPushResult;
  async push(record: ProjectSyncRecord) { this.pushes.push(structuredClone(record)); return this.next ?? { status: "applied" as const, revision: record.revision + 1, project: record.project, cloudUpdatedAt: "2026-08-30T11:00:00Z" }; }
  async pull() { const values = this.pulls; this.pulls = []; return values; }
}

describe("SyncService", () => {
  it("met en file une modification offline puis la pousse", async () => {
    const local = new MemoryProjectRepository(); const state = new MemorySyncStateRepository(); const cloud = new FakeCloud(); const source = project(); await local.put(source);
    const sync = new SyncService(local, state, cloud, "web"); await sync.enqueue(source);
    expect((await state.get(source.id))?.status).toBe("pending"); await sync.sync();
    expect(cloud.pushes).toHaveLength(1); expect(await state.get(source.id)).toMatchObject({ status: "synced", revision: 1, dirty: false });
  });
  it("fusionne la première connexion sans écraser les projets locaux et sans auto-uploader un import", async () => {
    const local = new MemoryProjectRepository(); const state = new MemorySyncStateRepository(); const cloud = new FakeCloud();
    await local.put(project("Créé")); await local.put({ ...project("Importé", "22222222-2222-2222-2222-222222222222"), source: "imported" });
    const sync = new SyncService(local, state, cloud, "ios"); await sync.enqueueInitialProjects();
    expect(await state.list()).toHaveLength(1);
  });
  it("conserve la version locale sous forme de copie lors d'un conflit", async () => {
    const local = new MemoryProjectRepository(); const state = new MemorySyncStateRepository(); const cloud = new FakeCloud(); const source = project("Version Android"); await local.put(source);
    const sync = new SyncService(local, state, cloud, "Android", () => new Date("2026-08-30T12:00:00Z"), () => "33333333-3333-3333-3333-333333333333"); await sync.enqueue(source);
    cloud.next = { status: "conflict", revision: 4, project: project("Version Web"), cloudUpdatedAt: "2026-08-30T11:30:00Z" };
    await sync.sync(); const projects = await local.list();
    expect(projects.map((value) => value.name)).toContain("Version Web"); expect(projects.some((value) => value.name.includes("conflit Android"))).toBe(true);
    expect((await state.get("33333333-3333-3333-3333-333333333333"))?.dirty).toBe(true);
  });
  it("applique un tombstone distant sans faire réapparaître le projet", async () => {
    const local = new MemoryProjectRepository(); const state = new MemorySyncStateRepository(); const cloud = new FakeCloud(); const source = project(); await local.put(source);
    cloud.pulls = [{ project: source, revision: 2, deletedAt: "2026-08-30T12:00:00Z", cloudUpdatedAt: "2026-08-30T12:00:00Z" }];
    await new SyncService(local, state, cloud, "web").sync(); expect(await local.get(source.id)).toBeNull(); expect((await state.get(source.id))?.deletedAt).toBeTruthy();
  });
});
