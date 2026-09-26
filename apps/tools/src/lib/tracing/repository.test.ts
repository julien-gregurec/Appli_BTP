import { describe, expect, it } from "vitest";
import { createTracingProject, TRACING_PROJECT_SCHEMA_VERSION } from "./project";
import {
  MemoryTracingProjectRepository,
  TracingProjectExistsError,
  tracingDatabaseName,
  tracingStorageScope,
} from "./repository";
import { touchTracingProject } from "./atelier";

function makeProject(id: string, name: string, at: string) {
  return createTracingProject({ id, name, type: "ceiling" }, new Date(at));
}

describe("TracingProjectRepository (§2)", () => {
  it("cloisonne le stockage par entreprise, avec un namespace distinct de ToolProject", () => {
    expect(tracingDatabaseName(tracingStorageScope(null))).toBe("elsatia-atelier");
    expect(tracingDatabaseName(tracingStorageScope("ent-1"))).not.toBe(tracingDatabaseName(tracingStorageScope("ent-2")));
    expect(tracingDatabaseName(tracingStorageScope(null))).not.toBe("elsatia-tools");
  });

  it("réalise create / get / save / list / delete", async () => {
    const repo = new MemoryTracingProjectRepository();
    const a = makeProject("trace-00000a", "Plafond A", "2026-09-01T10:00:00Z");
    const b = makeProject("trace-00000b", "Mur B", "2026-09-02T10:00:00Z");

    await repo.create(a);
    await repo.create(b);
    expect(await repo.list()).toHaveLength(2);
    expect((await repo.get("trace-00000a"))?.name).toBe("Plafond A");

    const renamed = touchTracingProject(a, { name: "Plafond A2" }, new Date("2026-09-03T10:00:00Z"));
    await repo.save(renamed);
    expect((await repo.get("trace-00000a"))?.name).toBe("Plafond A2");

    await repo.delete("trace-00000b");
    expect(await repo.get("trace-00000b")).toBeNull();
    expect(await repo.list()).toHaveLength(1);
  });

  it("trie la liste par dernière modification décroissante", async () => {
    const repo = new MemoryTracingProjectRepository();
    await repo.create(makeProject("trace-old0001", "Ancien", "2026-01-01T00:00:00Z"));
    await repo.create(makeProject("trace-new0001", "Récent", "2026-09-01T00:00:00Z"));
    expect((await repo.list()).map((p) => p.id)).toEqual(["trace-new0001", "trace-old0001"]);
  });

  it("refuse de créer deux fois le même identifiant (pas d'écrasement silencieux)", async () => {
    const repo = new MemoryTracingProjectRepository();
    const p = makeProject("trace-dup0001", "Doublon", "2026-09-01T10:00:00Z");
    await repo.create(p);
    await expect(repo.create(p)).rejects.toBeInstanceOf(TracingProjectExistsError);
  });

  it("relit un enregistrement v1 stocké en le migrant à la lecture", async () => {
    const current = makeProject("trace-v1v2001", "Legacy", "2026-09-01T10:00:00Z");
    const legacy = { ...JSON.parse(JSON.stringify(current)), schemaVersion: 1 };
    delete legacy.modelId;
    delete legacy.startFromPhoto;

    // Simule un enregistrement écrit par une build antérieure, directement dans le store.
    const repo = new MemoryTracingProjectRepository();
    (repo as unknown as { values: Map<string, unknown> }).values.set(legacy.id, legacy);

    expect((await repo.get(legacy.id))?.schemaVersion).toBe(TRACING_PROJECT_SCHEMA_VERSION);
    expect((await repo.list())[0]?.schemaVersion).toBe(TRACING_PROJECT_SCHEMA_VERSION);
  });

  it("refuse en écriture un projet à une version non courante", async () => {
    const repo = new MemoryTracingProjectRepository();
    const current = makeProject("trace-wv10001", "Legacy write", "2026-09-01T10:00:00Z");
    const legacy = { ...current, schemaVersion: 1 };
    await expect(repo.save(legacy)).rejects.toThrow(/version/i);
  });

  it("refuse d'écrire un projet incohérent", async () => {
    const repo = new MemoryTracingProjectRepository();
    const p = makeProject("trace-bad0001", "Bad", "2026-09-01T10:00:00Z");
    await expect(repo.save({ ...p, type: "roof" as unknown as typeof p.type })).rejects.toThrow(/type/i);
  });
});
