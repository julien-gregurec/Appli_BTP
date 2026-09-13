import { beforeEach, it, expect, vi } from "vitest";
import { buildTimeline } from "@elsatia/studio-domain";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock("../src/lib/media-service", () => ({
  authorizeProject: mocks.authorize,
  MediaError: class extends Error {
    constructor(
      message: string,
      public status = 400,
    ) {
      super(message);
    }
  },
}));
import {
  generateStudioTimeline,
  updateTimelineClip,
  reorderTimelineClips,
  setActiveTimeline,
  getStudioTimeline,
} from "../src/lib/timelines";
const id = "54000000-0000-0000-0000-000000000001",
  asset = "54000000-0000-0000-0000-000000000002";
const project = {
  name: "Projet test",
  id,
  workspace_id: id,
  revision: 5,
  target_duration_seconds: 15,
  target_aspect_ratio: "9:16" as const,
};
const assets = [
  {
    id: asset,
    media_type: "image" as const,
    duration_ms: null,
    upload_status: "ready",
    deleted_at: null,
  },
];
const draft = buildTimeline({ project, assets });
const doc = {
  ...draft,
  id,
  project_id: id,
  workspace_id: id,
  version: 1,
  revision: 3,
  status: "generated",
  created_by: id,
  created_at: "",
  updated_at: "",
  clips: draft.clips.map((c) => ({
    ...c,
    id: asset,
    timeline_id: id,
    project_id: id,
    workspace_id: id,
  })),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorize.mockResolvedValue({ client: { rpc: mocks.rpc }, project });
  mocks.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "studio_list_project_media"
        ? assets
        : name === "studio_get_timeline"
          ? doc
          : id,
    error: null,
    status: 200,
  }));
});
it("generation uses a batch and persists snapshot against project revision", async () => {
  await generateStudioTimeline(id);
  expect(mocks.authorize).toHaveBeenCalledWith(id, true);
  expect(
    mocks.rpc.mock.calls.filter((c) => c[0] === "studio_save_timeline"),
  ).toHaveLength(1);
  expect(mocks.rpc).toHaveBeenCalledWith(
    "studio_save_timeline",
    expect.objectContaining({
      p_project_revision: 5,
      p_revision: null,
      p_draft: expect.objectContaining({ total_duration_ms: 15000 }),
    }),
  );
});
it("verified permission failure performs no query", async () => {
  mocks.authorize.mockRejectedValue(new Error("Forbidden"));
  await expect(generateStudioTimeline(id)).rejects.toThrow("Forbidden");
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it("reads one atomic document", async () => {
  expect(await getStudioTimeline(id, id)).toEqual(doc);
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("revision conflicts do not overwrite", async () => {
  await expect(
    updateTimelineClip(id, id, 2, asset, { duration_ms: 4000 }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    mocks.rpc.mock.calls.some((c) => c[0] === "studio_save_timeline"),
  ).toBe(false);
});
it("rejects incomplete or duplicated clip order", async () => {
  await expect(reorderTimelineClips(id, id, 3, [])).rejects.toThrow(
    "Ordre invalide",
  );
  await expect(reorderTimelineClips(id, id, 3, [asset, asset])).rejects.toThrow(
    "Ordre invalide",
  );
  expect(
    mocks.rpc.mock.calls.some((c) => c[0] === "studio_save_timeline"),
  ).toBe(false);
});
for (const status of [401, 403, 404, 409, 503])
  it(`preserves ${status} from persistence`, async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "" }, status });
    await expect(setActiveTimeline(id, id)).rejects.toMatchObject({ status });
  });
it("no ready media returns useful business error", async () => {
  mocks.rpc.mockResolvedValue({ data: [], error: null, status: 200 });
  await expect(generateStudioTimeline(id)).rejects.toThrow(
    "Ajoutez au moins un média",
  );
});

it("editor requires matching revision and rejects foreign asset snapshots before persistence", async () => {
  const { saveStudioEditor } = await import("../src/lib/timelines");
  await expect(saveStudioEditor(id, id, 2, doc)).rejects.toMatchObject({
    status: 409,
  });
  await expect(
    saveStudioEditor(id, id, 3, {
      ...doc,
      clips: [
        { ...doc.clips[0], asset_id: "54000000-0000-0000-0000-000000000099" },
      ],
    }),
  ).rejects.toThrow();
  expect(
    mocks.rpc.mock.calls.some((c) => c[0] === "studio_save_timeline"),
  ).toBe(false);
});
it("editor returns the exact transaction response without a later racy read", async () => {
  const { saveStudioEditor } = await import("../src/lib/timelines");
  mocks.authorize.mockResolvedValue({
    client: { rpc: mocks.rpc },
    project: { ...project, active_timeline_id: id },
  });
  mocks.rpc
    .mockResolvedValueOnce({ data: doc, error: null, status: 200 })
    .mockResolvedValueOnce({ data: assets, error: null, status: 200 })
    .mockResolvedValueOnce({
      data: { ...doc, revision: 4 },
      error: null,
      status: 200,
    });
  const saved = await saveStudioEditor(id, id, 3, doc);
  expect(saved.revision).toBe(4);
  expect(mocks.rpc).toHaveBeenCalledTimes(3);
  expect(mocks.rpc.mock.calls[2][0]).toBe("studio_save_editor");
});
it("explicit selection rejects stale revision, foreign assets and repeated IDs before saving", async () => {
  for (const selection of [
    { ids: [asset], revision: 4 },
    { ids: [id], revision: 5 },
    { ids: [asset, asset], revision: 5 },
    { ids: [], revision: 5 },
  ]) {
    await expect(
      generateStudioTimeline(id, undefined, selection),
    ).rejects.toThrow();
  }
  expect(
    mocks.rpc.mock.calls.some((c) => c[0] === "studio_save_timeline"),
  ).toBe(false);
});
it("explicit selection preserves the user's order with a chronological travel template", async () => {
  const other = "54000000-0000-0000-0000-000000000003";
  mocks.rpc.mockImplementation(async (name: string) => ({
    data:
      name === "studio_list_project_media"
        ? [
            { ...assets[0], captured_at: "2026-01-01", sort_order: 0 },
            {
              ...assets[0],
              id: other,
              captured_at: "2026-01-02",
              sort_order: 1,
            },
          ]
        : id,
    error: null,
    status: 200,
  }));
  await generateStudioTimeline(
    id,
    { templateId: "voyage", templateVersion: 1 },
    { ids: [other, asset], revision: 5 },
  );
  const call = mocks.rpc.mock.calls.find(
    (c) => c[0] === "studio_save_timeline",
  )!;
  const sourceIds: string[] = call[1].p_draft.clips
    .filter((c: { asset_id: string | null }) => c.asset_id)
    .map((c: { asset_id: string }) => c.asset_id);
  expect(
    sourceIds.filter(
      (value, index) => index === 0 || value !== sourceIds[index - 1],
    ),
  ).toEqual([other, asset]);
});
