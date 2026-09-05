import { describe, expect, it } from "vitest";
import { createTracingProject } from "./project";
import {
  DRAFT_MAX_AGE_MS,
  MemoryTracingDraftStore,
  WebStorageTracingDraftStore,
  evaluateDraftRecovery,
  tracingDraftStorageKey,
  type TracingDraftPointer,
} from "./draft";
import { tracingStorageScope } from "./repository";

const project = createTracingProject(
  { id: "trace-draft01", name: "Niche entrée", type: "niche" },
  new Date("2026-09-05T10:00:00Z"),
);

function pointer(overrides: Partial<TracingDraftPointer> = {}): TracingDraftPointer {
  return {
    projectId: project.id,
    updatedAt: project.updatedAt,
    savedAt: "2026-09-05T10:00:05.000Z",
    closedCleanly: false,
    ...overrides,
  };
}

class FakeStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string) {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string) {
    this.map.set(key, value);
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
}

describe("pointeur de brouillon (§5)", () => {
  it("préfixe la clé par le scope entreprise", () => {
    expect(tracingDraftStorageKey(tracingStorageScope(null))).toBe("elsatia.atelier.draft");
    expect(tracingDraftStorageKey(tracingStorageScope("ent-9"))).toBe("elsatia.atelier.draft.company:ent-9");
  });

  it("écrit, relit et efface le pointeur", () => {
    const store = new WebStorageTracingDraftStore(new FakeStorage());
    expect(store.read()).toBeNull();
    store.write(pointer());
    expect(store.read()).toMatchObject({ projectId: project.id, closedCleanly: false });
    store.clear();
    expect(store.read()).toBeNull();
  });

  it("retourne null sur un contenu corrompu au lieu de jeter", () => {
    const raw = new FakeStorage();
    raw.setItem("elsatia.atelier.draft", "{pas du json");
    const store = new WebStorageTracingDraftStore(raw);
    expect(store.read()).toBeNull();
  });

  it("la variante mémoire est isolée par instance", () => {
    const store = new MemoryTracingDraftStore();
    store.write(pointer());
    const copy = store.read()!;
    copy.projectId = "muté";
    expect(store.read()?.projectId).toBe(project.id);
  });
});

describe("evaluateDraftRecovery (§5)", () => {
  const now = Date.parse("2026-09-05T10:01:00Z");

  it("ne propose rien sans pointeur", () => {
    expect(evaluateDraftRecovery(null, project, now)).toEqual({ status: "none" });
  });

  it("ne propose rien si le brouillon a été fermé proprement", () => {
    expect(evaluateDraftRecovery(pointer({ closedCleanly: true }), project, now)).toEqual({
      status: "stale",
      reason: "closed",
    });
  });

  it("ne propose rien si le brouillon est trop ancien", () => {
    const old = pointer({ savedAt: new Date(now - DRAFT_MAX_AGE_MS - 1000).toISOString() });
    expect(evaluateDraftRecovery(old, project, now)).toEqual({ status: "stale", reason: "expired" });
  });

  it("ne propose rien si le projet pointé a disparu", () => {
    expect(evaluateDraftRecovery(pointer(), null, now)).toEqual({ status: "stale", reason: "missing" });
  });

  it("n'écrase jamais un projet plus récent que le brouillon", () => {
    const newer = { ...project, updatedAt: "2026-09-05T10:30:00.000Z" };
    expect(evaluateDraftRecovery(pointer(), newer, now)).toEqual({ status: "stale", reason: "superseded" });
  });

  it("propose la reprise quand un brouillon récent non fermé correspond au projet stocké", () => {
    const result = evaluateDraftRecovery(pointer(), project, now);
    expect(result.status).toBe("recoverable");
    if (result.status === "recoverable") {
      expect(result.project.id).toBe(project.id);
      expect(result.pointer.closedCleanly).toBe(false);
    }
  });
});
