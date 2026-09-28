// Exécuteur RGPD : la base décide, l'exécuteur n'agit que sur Storage et Auth Studio, dans l'ordre
// imposé, et s'arrête au moindre doute (rejoué au cycle suivant).
import { describe, expect, it } from "vitest";
import { runErasureCycle, type ErasureClient } from "../src/lib/erasure-runner";

type Tree = Record<string, Record<string, string[]>>; // bucket → dossier → noms (dossier si suffixe "/")

function fakeClient(opts: {
  mode?: "off" | "dry_run" | "execute";
  due?: { id: string; status: string }[];
  execute?: string;
  queue?: { queue_id: number; bucket: string; object_key: string; kind: "object" | "prefix" }[];
  tree?: Tree;
  removeFails?: boolean;
  finalize?: { data: unknown; error: { code: string } | null };
  deleteStatus?: number;
}) {
  const calls: string[] = [];
  const removed: string[] = [];
  const done = new Set<number>();
  const client: ErasureClient = {
    rpc: async (fn, args) => {
      calls.push(fn);
      switch (fn) {
        case "studio_erasure_due":
          return { data: opts.due ?? [{ id: "r1", status: "pending" }], error: null };
        case "studio_erasure_prepare":
          return { data: opts.mode === "off" ? { outcome: "disabled" } : { outcome: "planned", mode: opts.mode ?? "execute" }, error: null };
        case "studio_erasure_execute":
          return { data: { outcome: opts.execute ?? "db_erased" }, error: null };
        case "studio_erasure_storage_batch":
          return { data: (opts.queue ?? []).filter((q) => !done.has(q.queue_id)), error: null };
        case "studio_erasure_storage_done":
          done.add(args!.p_queue_id as number);
          return { data: true, error: null };
        case "studio_erasure_finalize":
          return opts.finalize ?? { data: "user-1", error: null };
        case "studio_erasure_confirm_auth_deleted":
          return { data: true, error: null };
      }
      throw new Error(`RPC inattendue ${fn}`);
    },
    storage: {
      from: (bucket) => ({
        remove: async (paths) => {
          calls.push(`remove:${bucket}`);
          if (opts.removeFails) return { error: { message: "denied" } };
          removed.push(...paths.map((p) => `${bucket}:${p}`));
          return { error: null };
        },
        list: async (prefix, { offset }) => {
          const names = offset ? [] : (opts.tree?.[bucket]?.[prefix] ?? []);
          return { data: names.map((n) => (n.endsWith("/") ? { name: n.slice(0, -1), id: null } : { name: n, id: "x" })), error: null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id) => {
          calls.push(`deleteUser:${id}`);
          return { error: opts.deleteStatus ? { status: opts.deleteStatus } : null };
        },
      },
    },
  };
  return { client, calls, removed };
}

const ws = "studio/11111111-1111-1111-1111-111111111111";

describe("runErasureCycle", () => {
  it("mode off (défaut) : s'arrête après la première consultation, rien d'autre", async () => {
    const f = fakeClient({ mode: "off", due: [{ id: "r1", status: "pending" }, { id: "r2", status: "pending" }] });
    const s = await runErasureCycle(f.client);
    expect(s.mode).toBe("off");
    expect(f.calls).toEqual(["studio_erasure_due", "studio_erasure_prepare"]);
  });

  it("dry-run : planifie seulement", async () => {
    const f = fakeClient({ mode: "dry_run" });
    const s = await runErasureCycle(f.client);
    expect(s).toMatchObject({ mode: "dry_run", planned: 1, dbErased: 0, completed: 0 });
    expect(f.calls).toEqual(["studio_erasure_due", "studio_erasure_prepare"]);
  });

  it("délai décidé non écoulé / décision manquante : attend, ne touche ni Storage ni Auth", async () => {
    const f = fakeClient({ execute: "grace_period" });
    const s = await runErasureCycle(f.client);
    expect(s.waiting).toBe(1);
    expect(f.calls.some((c) => c.startsWith("remove") || c.startsWith("deleteUser"))).toBe(false);
  });

  it("exécution complète : objets, préfixes (dérivés), utilisateur Auth, constat — dans cet ordre", async () => {
    const f = fakeClient({
      queue: [
        { queue_id: 1, bucket: "studio-originals", object_key: `${ws}/p/a/original.jpg`, kind: "object" },
        { queue_id: 2, bucket: "studio-originals", object_key: `${ws}/`, kind: "prefix" },
      ],
      tree: { "studio-originals": { [ws]: ["p/", "vignette.jpg"], [`${ws}/p`]: ["a/"], [`${ws}/p/a`]: ["derive.webp"] } },
    });
    const s = await runErasureCycle(f.client);
    expect(s).toMatchObject({ mode: "execute", dbErased: 1, completed: 1, errors: 0, objectsRemoved: 3 });
    expect(f.removed).toEqual([
      `studio-originals:${ws}/p/a/original.jpg`,
      `studio-originals:${ws}/p/a/derive.webp`,
      `studio-originals:${ws}/vignette.jpg`,
    ]);
    const order = ["studio_erasure_execute", "remove:studio-originals", "studio_erasure_storage_done", "studio_erasure_finalize", "deleteUser:user-1", "studio_erasure_confirm_auth_deleted"];
    expect(order.map((c) => f.calls.indexOf(c))).toEqual([...order.map((c) => f.calls.indexOf(c))].sort((a, b) => a - b));
  });

  it("Storage refusé : aucun constat, aucune clôture, aucune suppression Auth", async () => {
    const f = fakeClient({ removeFails: true, queue: [{ queue_id: 1, bucket: "studio-renders", object_key: `${ws}/x.mp4`, kind: "object" }] });
    const s = await runErasureCycle(f.client);
    expect(s.errors).toBe(1);
    expect(f.calls).not.toContain("studio_erasure_storage_done");
    expect(f.calls).not.toContain("studio_erasure_finalize");
    expect(f.calls.some((c) => c.startsWith("deleteUser"))).toBe(false);
  });

  it("clôture refusée par la base (DECISION_REQUIRED) : l'utilisateur Auth n'est pas supprimé", async () => {
    const f = fakeClient({ finalize: { data: null, error: { code: "22023" } } });
    const s = await runErasureCycle(f.client);
    expect(s.waiting).toBe(1);
    expect(f.calls.some((c) => c.startsWith("deleteUser"))).toBe(false);
  });

  it("rejeu après suppression Auth déjà faite (404) : constat enregistré", async () => {
    const f = fakeClient({ due: [{ id: "r1", status: "auth_pending" }], deleteStatus: 404 });
    const s = await runErasureCycle(f.client);
    expect(s.completed).toBe(1);
    expect(f.calls).toEqual(["studio_erasure_due", "studio_erasure_finalize", "deleteUser:user-1", "studio_erasure_confirm_auth_deleted"]);
  });

  it("échec Auth autre que 404 : pas de constat", async () => {
    const f = fakeClient({ due: [{ id: "r1", status: "auth_pending" }], deleteStatus: 500 });
    const s = await runErasureCycle(f.client);
    expect(s.errors).toBe(1);
    expect(f.calls).not.toContain("studio_erasure_confirm_auth_deleted");
  });

  it("journal sans donnée personnelle", async () => {
    const lines: string[] = [];
    const f = fakeClient({ queue: [{ queue_id: 1, bucket: "studio-originals", object_key: `${ws}/secret-plage.jpg`, kind: "object" }] });
    await runErasureCycle(f.client, { log: (e, d) => lines.push(JSON.stringify({ e, ...d })) });
    expect(lines.join("\n")).not.toMatch(/secret-plage|user-1|@/);
  });
});
