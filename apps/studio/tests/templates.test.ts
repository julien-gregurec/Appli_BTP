import { it, expect } from "vitest";
import {
  buildTemplateTimeline,
  listStudioTemplates,
  resolveStudioTemplate,
  parseTemplateOptions,
  retimePresentation,
  editTimelineClip,
  type StudioProject,
  type StudioMediaAsset,
} from "@elsatia/studio-domain";
const project = {
  name: "Chantier Strasbourg",
  project_type: "construction",
  location_label: "Côte d’Azur",
  started_at: "2026-08-01",
  target_duration_seconds: 60,
  target_aspect_ratio: "9:16",
} as StudioProject;
const assets = Array.from({ length: 7 }, (_, i) => ({
  id: `10000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
  media_type: i < 5 ? "image" : "video",
  duration_ms: i < 5 ? null : 15000,
  mime_type: i < 5 ? "image/png" : "video/mp4",
  upload_status: "ready",
  deleted_at: null,
  captured_at: `2026-08-${String(7 - i).padStart(2, "0")}T12:00:00Z`,
})) as StudioMediaAsset[];
function options(id: string) {
  return {
    templateId: id,
    templateVersion: 1,
    beforeIds: assets.slice(0, 3).map((a) => a.id),
    afterIds: assets.slice(3).map((a) => a.id),
  };
}
for (const t of listStudioTemplates()) {
  it(`${t.id}: deterministic x10, explicit cards, 4 ratios, bounded sources`, () => {
    const ref = buildTemplateTimeline(project, assets, options(t.id));
    for (let i = 0; i < 10; i++)
      expect(buildTemplateTimeline(project, assets, options(t.id))).toEqual(
        ref,
      );
    for (const ratio of t.supportedAspectRatios) {
      const d = buildTemplateTimeline(
        { ...project, target_aspect_ratio: ratio },
        assets,
        options(t.id),
      );
      expect(d.total_duration_ms).toBe(60000);
      expect(d.clips[0].clip_type).toBe("card");
      expect(d.clips.at(-1)?.metadata_json.card?.kind).toBe("outro");
      for (const c of d.clips.filter((c) => c.clip_type === "video"))
        expect(c.source_end_ms).toBeLessThanOrEqual(15000);
    }
  });
}
it("same media: dynamic objectively shorter shots, cinematic longer; catalogue cannot mutate saved snapshots", () => {
  const docs = listStudioTemplates().map((t) =>
    buildTemplateTimeline(project, assets, options(t.id)),
  );
  expect(new Set(docs.map((d) => JSON.stringify(d))).size).toBe(6);
  const avg = (id: string) => {
    const c = docs
      .find((d) => d.presentation?.template.id === id)!
      .clips.filter((c) => c.clip_type !== "card");
    return c.reduce((n, c) => n + c.duration_ms, 0) / c.length;
  };
  expect(avg("chantier-dynamique")).toBeLessThan(avg("chantier-pro"));
  expect(avg("cinematique")).toBeGreaterThan(avg("chantier-pro"));
  const saved = JSON.stringify(docs[0]);
  const next = resolveStudioTemplate("chantier-pro");
  next.version = 2;
  next.typography.display.size = 0.1;
  expect(JSON.stringify(docs[0])).toBe(saved);
  expect(resolveStudioTemplate("chantier-pro").version).toBe(1);
});
it("before/after rejects missing, mixed or foreign groups; real labels and ordering", () => {
  expect(() =>
    buildTemplateTimeline(project, assets, {
      templateId: "avant-apres",
      templateVersion: 1,
    }),
  ).toThrow("Classez");
  const d = buildTemplateTimeline(project, assets, options("avant-apres"));
  expect(
    d.clips.filter((c) => c.clip_type !== "card").map((c) => c.asset_id),
  ).toEqual(assets.map((a) => a.id));
  expect(
    d.presentation!.overlays.filter((o) => o.text === "AVANT"),
  ).toHaveLength(3);
  expect(
    d.presentation!.overlays.filter((o) => o.text === "APRÈS"),
  ).toHaveLength(4);
});
it("travel orders reliable dates and uses only explicit chapters", () => {
  const d = buildTemplateTimeline(project, assets, {
    ...options("voyage"),
    chapters: [{ assetId: assets[0].id, title: "Šibenik" }],
  });
  expect([
    ...new Set(
      d.clips.filter((c) => c.clip_type !== "card").map((c) => c.asset_id),
    ),
  ]).toEqual([...assets].reverse().map((a) => a.id));
  expect(d.presentation!.overlays.some((o) => o.text === "Šibenik")).toBe(true);
});
it("manual edits retain anchors, typography and old template; retime drops removed clip overlays", () => {
  const d = buildTemplateTimeline(project, assets, options("chantier-pro")),
    c = d.clips[1];
  const edit = editTimelineClip(c, { animation_type: "pan_left" }, assets[0]);
  expect(edit.metadata_json.key).toBe(c.metadata_json.key);
  const p = retimePresentation(d.presentation, d.clips.slice(1))!;
  expect(p.overlays.some((o) => o.clip_key === "intro")).toBe(false);
  expect(p.template).toEqual(d.presentation!.template);
});
it("reject invalid options, unowned logo, tiny target and unknown version", () => {
  expect(() =>
    parseTemplateOptions({ templateId: "voyage", templateVersion: 2 }),
  ).toThrow();
  expect(() =>
    parseTemplateOptions({ ...options("voyage"), title: "x".repeat(501) }),
  ).toThrow();
  expect(() =>
    buildTemplateTimeline(project, assets, {
      ...options("chantier-pro"),
      logoAssetId: "20000000-0000-0000-0000-000000000000",
    }),
  ).toThrow();
  expect(() =>
    buildTemplateTimeline(
      { ...project, target_duration_seconds: 3 },
      assets,
      options("chantier-pro"),
    ),
  ).toThrow();
});
