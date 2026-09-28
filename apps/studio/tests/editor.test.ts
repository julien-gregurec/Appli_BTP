import { describe, it, expect, vi, afterEach } from "vitest";
import {
  applyEditorCommand,
  buildTimeline,
  editorHistory,
  editorStep,
  editorUndo,
  editorRedo,
  editorCoalesce,
  editorFingerprint,
  parseEditorDraft,
  type TimelineDocument,
} from "@elsatia/studio-domain";
import {
  EditorAutosave,
  EditorSaveError,
  saveFailureMessage,
} from "../src/lib/editor-autosave";
const id = (n: number) =>
  `54000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const assets = [
  {
    id: id(1),
    media_type: "image" as const,
    duration_ms: null,
    upload_status: "ready",
    deleted_at: null,
  },
  {
    id: id(2),
    media_type: "video" as const,
    duration_ms: 18000,
    upload_status: "ready",
    deleted_at: null,
  },
];
function document(): TimelineDocument {
  const draft = buildTimeline({
    project: { target_duration_seconds: 15, target_aspect_ratio: "9:16" },
    assets,
  });
  return {
    ...draft,
    id: id(10),
    project_id: id(11),
    workspace_id: id(12),
    version: 1,
    revision: 1,
    status: "generated",
    created_by: id(13),
    created_at: "",
    updated_at: "",
    clips: draft.clips.map((c, i) => ({
      ...c,
      id: id(100 + i),
      timeline_id: id(10),
      project_id: id(11),
      workspace_id: id(12),
      metadata_json: { ...c.metadata_json, key: id(100 + i) },
    })),
  };
}
describe("canonical editor commands", () => {
  it("reorder retains all choices and recalculates positions", () => {
    const d = document(),
      next = applyEditorCommand(
        d,
        { type: "move", id: d.clips[0].id, index: 1 },
        assets,
      );
    expect(next.clips[1].metadata_json).toEqual(d.clips[0].metadata_json);
    expect(next.clips[1].timeline_start_ms).toBe(next.clips[0].duration_ms);
    expect(d.clips[0].sort_order).toBe(0);
  });
  it("delete preserves assets and undo/redo restores exact composition", () => {
    const d = document(),
      s = editorStep(
        editorHistory(d),
        applyEditorCommand(d, { type: "remove", id: d.clips[0].id }, assets),
      );
    expect(s.present.clips).toHaveLength(1);
    expect(assets).toHaveLength(2);
    expect(editorUndo(s).present).toEqual(d);
    expect(editorRedo(editorUndo(s)).present).toEqual(s.present);
  });
  it("allows duplicate source with unique identities and arbitrary insertion", () => {
    let d = document();
    d = applyEditorCommand(
      d,
      { type: "duplicate", id: d.clips[0].id, nextId: id(200) },
      assets,
    );
    d = applyEditorCommand(
      d,
      { type: "insert", asset: assets[0].id, id: id(201), index: 0 },
      assets,
    );
    expect(d.clips).toHaveLength(4);
    expect(new Set(d.clips.map((c) => c.id)).size).toBe(4);
    expect(d.clips[0].asset_id).toBe(assets[0].id);
    expect(() =>
      applyEditorCommand(
        d,
        { type: "duplicate", id: d.clips[0].id, nextId: id(200) },
        assets,
      ),
    ).toThrow();
  });
  it("trim is bounded, duration and volume are applied without changing sources", () => {
    let d = document();
    const c = d.clips[1];
    d = applyEditorCommand(
      d,
      {
        type: "edit",
        id: c.id,
        patch: { source_start_ms: 4000, source_end_ms: 11000 },
      },
      assets,
    );
    expect(d.clips[1].duration_ms).toBe(7000);
    expect(() =>
      applyEditorCommand(
        d,
        { type: "edit", id: c.id, patch: { source_end_ms: 19000 } },
        assets,
      ),
    ).toThrow();
    d = applyEditorCommand(
      d,
      { type: "volume", id: c.id, value: 0.25 },
      assets,
    );
    expect(d.clips[1].volume).toBe(0.25);
    d = applyEditorCommand(d, { type: "volume", id: c.id, value: 0 }, assets);
    expect(d.clips[1].volume).toBe(0);
  });
  it("replace preserves position duration and transition where compatible", () => {
    const d = document(),
      c = d.clips[0],
      r = applyEditorCommand(
        d,
        { type: "replace", id: c.id, asset: assets[1].id },
        assets,
      ).clips[0];
    expect(r.id).toBe(c.id);
    expect(r.duration_ms).toBe(c.duration_ms);
    expect(r.transition_in).toBe(c.transition_in);
    expect(r.animation_type).toBe("static");
  });
  it("validates untrusted snapshot, source, crop, volume, motion and ids", () => {
    const d = document();
    expect(parseEditorDraft(d, d, assets)).toEqual({
      ...d,
      presentation: null,
    });
    for (const patch of [
      { volume: 2 },
      { asset_id: id(999) },
      { playback_rate: 2 },
      { id: "bad" },
      { rotation: 20 },
      { duration_ms: NaN },
      { clip_type: "video" },
    ]) {
      const bad = structuredClone(d);
      Object.assign(bad.clips[0], patch);
      expect(() => parseEditorDraft(bad, d, assets)).toThrow();
    }
  });
  it("snapshot ignores object key order and unrelated response metadata", () => {
    const d = document(),
      reordered = JSON.parse(JSON.stringify(d), (_k, v) =>
        v && typeof v === "object" && !Array.isArray(v)
          ? Object.fromEntries(Object.entries(v).reverse())
          : v,
      );
    expect(editorFingerprint(reordered)).toBe(editorFingerprint(d));
    expect(() => parseEditorDraft(reordered, d, assets)).not.toThrow();
  });
  it("crop and animation survive serialization and undo", () => {
    const d = document(),
      c = d.clips[0];
    let next = applyEditorCommand(
      d,
      { type: "crop", id: c.id, value: "contain" },
      assets,
    );
    next = applyEditorCommand(
      next,
      {
        type: "edit",
        id: c.id,
        patch: {
          animation_type: "pan_up",
          duration_ms: 4000,
          transition_in: "cut",
        },
      },
      assets,
    );
    expect(
      parseEditorDraft(JSON.parse(JSON.stringify(next)), d, assets).clips[0],
    ).toMatchObject({
      crop_mode: "contain",
      animation_type: "pan_up",
      duration_ms: 4000,
      transition_in: "cut",
    });
  });
  it("is usable with 500 clips and history is bounded", () => {
    let d = document();
    d = {
      ...d,
      clips: Array.from({ length: 500 }, (_, i) => ({
        ...d.clips[0],
        id: id(i + 1000),
        metadata_json: { ...d.clips[0].metadata_json, key: id(i + 1000) },
        duration_ms: 1000,
        transition_in: "cut" as const,
        transition_duration_ms: 0,
      })),
    };
    const start = performance.now();
    d = applyEditorCommand(
      d,
      { type: "move", id: d.clips[499].id, index: 0 },
      assets,
    );
    expect(d.total_duration_ms).toBe(500000);
    expect(performance.now() - start).toBeLessThan(1000);
    let state = editorHistory(d);
    for (let i = 0; i < 60; i++)
      state = editorStep(
        state,
        applyEditorCommand(
          state.present,
          { type: "move", id: state.present.clips[0].id, index: 1 },
          assets,
        ),
      );
    expect(state.past).toHaveLength(40);
  });
});
afterEach(() => vi.useRealTimers());
describe("single-flight autosave", () => {
  it("debounces rapid edits and persists last version", async () => {
    vi.useFakeTimers();
    const d = document(),
      write = vi.fn(async (doc: TimelineDocument) => ({ ...doc, revision: 2 })),
      notify = vi.fn(),
      s = new EditorAutosave(d, write, notify);
    for (let i = 0; i < 10; i++)
      s.update(
        applyEditorCommand(
          d,
          { type: "volume", id: d.clips[1].id, value: i / 10 },
          assets,
        ),
      );
    await vi.advanceTimersByTimeAsync(600);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0].clips[1].volume).toBe(0.9);
    expect(s.status).toBe("saved");
    s.dispose();
  });
  it("never overwrites edits made while acknowledgement is in flight", async () => {
    vi.useFakeTimers();
    const d = document();
    let resolve!: (d: TimelineDocument) => void;
    const write = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<TimelineDocument>((r) => {
            resolve = r;
          }),
      )
      .mockImplementation(async (doc: TimelineDocument) => ({
        ...doc,
        revision: 3,
      }));
    const s = new EditorAutosave(d, write, vi.fn());
    const a = applyEditorCommand(
        d,
        { type: "volume", id: d.clips[1].id, value: 0.5 },
        assets,
      ),
      b = applyEditorCommand(
        d,
        { type: "volume", id: d.clips[1].id, value: 0.25 },
        assets,
      );
    s.update(a);
    await vi.advanceTimersByTimeAsync(600);
    s.update(b);
    expect(write).toHaveBeenCalledTimes(1);
    resolve({ ...a, revision: 2 });
    await vi.advanceTimersByTimeAsync(600);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][1]).toBe(2);
    expect(write.mock.calls[1][0].clips[1].volume).toBe(0.25);
    expect(s.status).toBe("saved");
    s.dispose();
  });
  it("keeps local changes on network error and supports explicit retry", async () => {
    vi.useFakeTimers();
    const d = document(),
      a = applyEditorCommand(d, { type: "remove", id: d.clips[0].id }, assets),
      write = vi
        .fn()
        .mockRejectedValueOnce(new Error("Network"))
        .mockResolvedValue({ ...a, revision: 2 }),
      s = new EditorAutosave(d, write, vi.fn());
    s.update(a);
    await vi.advanceTimersByTimeAsync(600);
    expect(s.status).toBe("error");
    s.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(write.mock.calls[1][0]).toEqual(a);
    expect(s.status).toBe("saved");
    s.dispose();
  });
  it("halts on conflict, never retries or silently overwrites another tab", async () => {
    vi.useFakeTimers();
    const d = document(),
      write = vi.fn().mockRejectedValue(new EditorSaveError("Conflit", 409)),
      s = new EditorAutosave(d, write, vi.fn());
    s.update(
      applyEditorCommand(d, { type: "remove", id: d.clips[0].id }, assets),
    );
    await vi.advanceTimersByTimeAsync(600);
    s.retry();
    s.update(d);
    await vi.advanceTimersByTimeAsync(2000);
    expect(s.status).toBe("conflict");
    expect(write).toHaveBeenCalledTimes(1);
    s.dispose();
  });
});

it("database bookkeeping timestamps do not masquerade as an edit conflict", () => {
  const d = document(),
    roundtrip = {
      ...d,
      clips: d.clips.map((c) => ({
        ...c,
        created_at: "new timestamp",
        updated_at: "new timestamp",
      })),
    };
  expect(editorFingerprint(roundtrip)).toBe(editorFingerprint(d));
});

it("text editing preserves layer order and supports hide/show without losing content", () => {
  let d = document();
  const overlay = {
    id: "test-title",
    clip_key: d.clips[0].metadata_json.key!,
    text: "Été en famille",
    start_ms: 0,
    end_ms: 1000,
    position: "top" as const,
    alignment: "left" as const,
    font_role: "title" as const,
    size_role: "title" as const,
    weight: 700 as const,
    animation: "none" as const,
    background: "none" as const,
    color: "#ffffff",
    max_lines: 3,
  };
  d = applyEditorCommand(d, { type: "overlay", overlay }, assets);
  d = applyEditorCommand(
    d,
    { type: "overlay", overlay: { ...overlay, id: "second", text: "Date" } },
    assets,
  );
  d = applyEditorCommand(
    d,
    {
      type: "overlay",
      overlay: { ...overlay, text: "", hidden_text: overlay.text },
    },
    assets,
  );
  expect(d.presentation!.overlays[0]).toMatchObject({
    id: "test-title",
    text: "",
    hidden_text: "Été en famille",
  });
  expect(
    parseEditorDraft(d, document(), assets).presentation!.overlays[0]
      .hidden_text,
  ).toBe("Été en famille");
  d = applyEditorCommand(d, { type: "overlay", overlay }, assets);
  expect(d.presentation!.overlays[0].text).toBe("Été en famille");
  expect(editorUndo(editorStep(editorHistory(document()), d)).present).toEqual(
    document(),
  );
  expect(() =>
    applyEditorCommand(
      d,
      { type: "overlay", overlay: { ...overlay, start_ms: 100000 } },
      assets,
    ),
  ).toThrow();
});

describe("Lot S2 editor resilience", () => {
  it("coalesces merged edits into a single undo step", () => {
    const d = document();
    const a = applyEditorCommand(
        d,
        { type: "volume", id: d.clips[1].id, value: 0.5 },
        assets,
      ),
      b = applyEditorCommand(
        d,
        { type: "volume", id: d.clips[1].id, value: 0.25 },
        assets,
      );
    let h = editorStep(editorHistory(d), a);
    h = editorCoalesce(h, b);
    expect(h.past).toHaveLength(1);
    expect(h.present.clips[1].volume).toBe(0.25);
    expect(editorUndo(h).present).toEqual(d);
    expect(editorCoalesce(h, b)).toBe(h);
  });
  it("flushes unsaved edits once when the editor is closed", async () => {
    vi.useFakeTimers();
    const d = document(),
      a = applyEditorCommand(d, { type: "remove", id: d.clips[0].id }, assets),
      write = vi.fn(async (doc: TimelineDocument) => ({ ...doc, revision: 2 })),
      notify = vi.fn(),
      s = new EditorAutosave(d, write, notify);
    s.update(a);
    s.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(1);
    expect(write.mock.calls[0][0]).toEqual(a);
    const calls = notify.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    expect(write).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls.length).toBe(calls);
  });
  it("sends edits made while a save is in flight when closing", async () => {
    vi.useFakeTimers();
    const d = document();
    let resolve!: (doc: TimelineDocument) => void;
    const first = applyEditorCommand(
        d,
        { type: "volume", id: d.clips[1].id, value: 0.5 },
        assets,
      ),
      last = applyEditorCommand(
        d,
        { type: "volume", id: d.clips[1].id, value: 0.25 },
        assets,
      ),
      write = vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<TimelineDocument>((r) => {
              resolve = r;
            }),
        )
        .mockImplementation(async (doc: TimelineDocument) => ({
          ...doc,
          revision: 3,
        })),
      s = new EditorAutosave(d, write, vi.fn());
    s.update(first);
    await vi.advanceTimersByTimeAsync(600);
    s.update(last);
    s.dispose();
    expect(write).toHaveBeenCalledTimes(1);
    resolve({ ...first, revision: 2 });
    await vi.advanceTimersByTimeAsync(0);
    expect(write).toHaveBeenCalledTimes(2);
    expect(write.mock.calls[1][0].clips[1].volume).toBe(0.25);
    expect(write.mock.calls[1][1]).toBe(2);
  });
  it("recovers by itself from a transient failure with backoff", async () => {
    vi.useFakeTimers();
    const d = document(),
      a = applyEditorCommand(d, { type: "remove", id: d.clips[0].id }, assets),
      write = vi
        .fn()
        .mockRejectedValueOnce(new EditorSaveError("boom", 503))
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValue({ ...a, revision: 2 }),
      s = new EditorAutosave(d, write, vi.fn());
    s.update(a);
    await vi.advanceTimersByTimeAsync(600);
    expect(s.status).toBe("error");
    await vi.advanceTimersByTimeAsync(2000);
    expect(write).toHaveBeenCalledTimes(2);
    expect(s.status).toBe("error");
    await vi.advanceTimersByTimeAsync(4000);
    expect(write).toHaveBeenCalledTimes(3);
    expect(s.status).toBe("saved");
    s.dispose();
  });
  it.each([400, 401, 403, 404])(
    "does not retry a %i and gives a specific message",
    async (status) => {
      vi.useFakeTimers();
      const d = document(),
        write = vi.fn().mockRejectedValue(new EditorSaveError("refus", status)),
        notify = vi.fn(),
        s = new EditorAutosave(d, write, notify);
      s.update(
        applyEditorCommand(d, { type: "remove", id: d.clips[0].id }, assets),
      );
      await vi.advanceTimersByTimeAsync(600);
      await vi.advanceTimersByTimeAsync(120000);
      expect(write).toHaveBeenCalledTimes(1);
      expect(s.status).toBe("error");
      expect(saveFailureMessage(new EditorSaveError("refus", status)).retryable).toBe(
        false,
      );
      s.dispose();
    },
  );
  it("classifies failures", () => {
    expect(saveFailureMessage(new TypeError("fetch failed")).retryable).toBe(true);
    expect(saveFailureMessage(new EditorSaveError("x", 500)).retryable).toBe(true);
    expect(saveFailureMessage(new EditorSaveError("x", 429)).retryable).toBe(true);
    expect(saveFailureMessage(new EditorSaveError("x", 401)).message).toMatch(/session/);
    expect(saveFailureMessage(new EditorSaveError("x", 403)).message).toMatch(/droit/);
  });
});

describe("Lot M music command", () => {
  const audio = (over: Record<string, unknown> = {}) =>
    ({
      id: id(900),
      media_type: "audio" as const,
      duration_ms: null,
      upload_status: "ready",
      deleted_at: null,
      ...over,
    }) as unknown as (typeof assets)[number];
  const music = { asset_id: id(900), volume: 0.6, fade_in_ms: 500, fade_out_ms: 1500 };
  it("adds, replaces and removes a track, and undo restores the previous state", () => {
    const pool = [...assets, audio(), audio({ id: id(901) })];
    let h = editorHistory(document());
    h = editorStep(h, applyEditorCommand(h.present, { type: "music", music }, pool));
    expect(h.present.presentation?.music).toEqual(music);
    const replaced = { ...music, asset_id: id(901), volume: 1 };
    h = editorStep(h, applyEditorCommand(h.present, { type: "music", music: replaced }, pool));
    expect(h.present.presentation?.music?.asset_id).toBe(id(901));
    h = editorStep(h, applyEditorCommand(h.present, { type: "music", music: null }, pool));
    expect(h.present.presentation?.music).toBeNull();
    expect(editorUndo(h).present.presentation?.music?.asset_id).toBe(id(901));
    expect(editorUndo(editorUndo(h)).present.presentation?.music?.asset_id).toBe(id(900));
  });
  it.each([
    ["a photo", audio({ media_type: "image" })],
    ["a video", audio({ media_type: "video" })],
    ["a pending upload", audio({ upload_status: "pending" })],
    ["a deleted track", audio({ deleted_at: "2026-01-01" })],
  ])("refuses %s as music", (_label, asset) => {
    expect(() =>
      applyEditorCommand(document(), { type: "music", music }, [...assets, asset]),
    ).toThrow(/Musique indisponible/);
  });
  it("refuses tracks that are not in the project pool and out-of-range settings", () => {
    expect(() =>
      applyEditorCommand(document(), { type: "music", music }, assets),
    ).toThrow(/Musique indisponible/);
    for (const bad of [
      { ...music, volume: 1.5 },
      { ...music, volume: -0.1 },
      { ...music, fade_in_ms: -1 },
      { ...music, fade_out_ms: 20000 },
      { ...music, fade_in_ms: 1.5 },
      { ...music, extra: true },
      { asset_id: id(900), volume: 1 },
      { ...music, asset_id: "not-a-uuid" },
    ])
      expect(() =>
        applyEditorCommand(document(), { type: "music", music: bad as never }, [...assets, audio()]),
      ).toThrow(/Musique invalide/);
  });
  it("audio is never a clip: insertion of a track is refused and generation ignores audio", () => {
    expect(() =>
      applyEditorCommand(
        document(),
        { type: "insert", asset: id(900), id: id(950), index: 0 },
        [...assets, audio()],
      ),
    ).toThrow();
    const built = buildTimeline({
      project: { target_duration_seconds: 15, target_aspect_ratio: "9:16" },
      assets: [...assets, audio()],
    });
    expect(built.clips.every((c) => c.asset_id !== id(900))).toBe(true);
  });
  it("music survives text edits and parseEditorDraft round-trips it", () => {
    const pool = [...assets, audio()];
    let d = applyEditorCommand(document(), { type: "music", music }, pool);
    d = applyEditorCommand(d, { type: "remove", id: d.clips[0].id }, pool);
    expect(d.presentation?.music).toEqual(music);
    expect(parseEditorDraft(d, d, pool).presentation?.music).toEqual(music);
  });
});
