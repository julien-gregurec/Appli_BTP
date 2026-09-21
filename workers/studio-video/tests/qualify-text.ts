import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { join } from "node:path";
import {
  buildTemplateTimeline,
  type StudioProject,
  type StudioMediaAsset,
  type TimelineDocument,
} from "../../../packages/studio-domain/src/index.ts";
import { renderTimeline, command } from "../src/render.ts";
const require = createRequire(import.meta.url),
  root = "/tmp/elsatia-studio-lot-f/long-text",
  r = {
    ffmpeg: require("ffmpeg-static") as string,
    ffprobe: (require("ffprobe-static") as { path: string }).path,
    signal: AbortSignal.timeout(600000),
    progress: async () => {},
  };
const a = {
  id: "10000000-0000-0000-0000-000000000001",
  media_type: "image",
  mime_type: "image/png",
  duration_ms: null,
  deleted_at: null,
  upload_status: "ready",
} as StudioMediaAsset;
const title =
  "É À ç — Šibenik, Côte d’Azur, Strasbourg : aménagement et rénovation de très grands espaces européens. "
    .repeat(5)
    .slice(0, 500);
for (const [ratio, width, height] of [
  ["9:16", 1080, 1920],
  ["16:9", 1920, 1080],
  ["1:1", 1080, 1080],
  ["4:5", 1080, 1350],
] as const) {
  const dir = join(root, ratio.replace(":", "x"));
  await mkdir(dir, { recursive: true });
  const p = {
    name: title,
    location_label: "Un lieu très long ".repeat(25),
    target_duration_seconds: 5,
    target_aspect_ratio: ratio,
    project_type: "construction",
  } as StudioProject;
  const d = buildTemplateTimeline(p, [a], {
    templateId: "chantier-pro",
    templateVersion: 1,
    introDuration: 1500,
    outroDuration: 1500,
    company: "Entreprise ".repeat(40),
    logoAssetId: a.id,
  });
  const t = {
    ...d,
    id: "t",
    project_id: "p",
    workspace_id: "w",
    version: 1,
    revision: 1,
    status: "generated",
    created_by: "u",
    created_at: "",
    updated_at: "",
  } as TimelineDocument;
  const output = await renderTimeline(
    t,
    new Map([[a.id, "/tmp/elsatia-studio-lot-f/qualification/fixture.png"]]),
    { width, height, fps: 30 },
    dir,
    r,
  );
  for (const [label, at] of [
    ["intro", 0.75],
    ["outro", 4.25],
  ] as const)
    await command(
      r.ffmpeg,
      [
        "-y",
        "-ss",
        String(at),
        "-i",
        output.output,
        "-frames:v",
        "1",
        join(dir, label + ".png"),
      ],
      r.signal,
    );
  await writeFile(join(dir, "timeline.json"), JSON.stringify(t));
  console.log(ratio + " long text render PASS");
}
