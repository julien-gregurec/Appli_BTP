import {
  buildTemplateTimeline,
  listStudioTemplates,
  type StudioProject,
  type StudioMediaAsset,
} from "../../../packages/studio-domain/src/index.ts";
import { writeFile } from "node:fs/promises";
const project = {
  name: "Comparaison six styles",
  project_type: "construction",
  location_label: "Strasbourg",
  target_duration_seconds: 60,
  target_aspect_ratio: "9:16",
} as StudioProject;
const assets = Array.from({ length: 7 }, (_, i) => ({
  id: `10000000-0000-0000-0000-00000000000${i}`,
  media_type: i < 5 ? "image" : "video",
  mime_type: i < 5 ? "image/png" : "video/mp4",
  duration_ms: i < 5 ? null : 15000,
  upload_status: "ready",
  deleted_at: null,
})) as StudioMediaAsset[];
const rows = listStudioTemplates().map((t) => {
  const d = buildTemplateTimeline(project, assets, {
      templateId: t.id,
      templateVersion: 1,
      beforeIds: assets.slice(0, 3).map((a) => a.id),
      afterIds: assets.slice(3).map((a) => a.id),
    }),
    body = d.clips.filter((c) => c.clip_type !== "card");
  return {
    template: t.name,
    version: t.version,
    totalMs: d.total_duration_ms,
    bodyClips: body.length,
    averageMs: body.reduce((n, c) => n + c.duration_ms, 0) / body.length,
    transitions: [...new Set(body.map((c) => c.transition_in))],
    motions: [...new Set(body.map((c) => c.animation_type))],
    introMs: d.clips[0].duration_ms,
    outroMs: d.clips.at(-1)!.duration_ms,
    overlays: d.presentation!.overlays.length,
  };
});
console.log(JSON.stringify(rows, null, 2));
if (process.env.STUDIO_TEMPLATE_COMPARISON)
  await writeFile(
    process.env.STUDIO_TEMPLATE_COMPARISON,
    JSON.stringify(rows, null, 2),
  );
