import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  buildTimeline,
  photoMotion,
  type TimelineDocument,
  type Animation,
  type Transition,
} from "../../../packages/studio-domain/src/timeline.ts";
import { renderTimeline, command, renderMetrics } from "../src/render.ts";
const require = createRequire(import.meta.url),
  root =
    process.env.STUDIO_RENDER_EVIDENCE ||
    (await mkdtemp(join(tmpdir(), "studio-render-qualification-")));
await mkdir(root, { recursive: true });
const r = {
  ffmpeg: require("ffmpeg-static") as string,
  ffprobe: (require("ffprobe-static") as { path: string }).path,
  signal: AbortSignal.timeout(600000),
  progress: async () => {},
};
const image = join(root, "pattern.png"),
  video = join(root, "tone.mp4");
await command(
  r.ffmpeg,
  ["-y", "-f", "lavfi", "-i", "testsrc2=s=640x360", "-frames:v", "1", image],
  r.signal,
);
await command(
  r.ffmpeg,
  [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=s=320x240:r=30",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=440:sample_rate=48000",
    "-t",
    "6",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    video,
  ],
  r.signal,
);
const cases = [
  {
    name: "images-15-preview",
    images: 5,
    videos: 0,
    seconds: 15,
    width: 540,
    height: 960,
  },
  {
    name: "videos-only",
    images: 0,
    videos: 3,
    seconds: 15,
    width: 540,
    height: 960,
  },
  {
    name: "mix-60-standard",
    images: 5,
    videos: 2,
    seconds: 60,
    width: 1080,
    height: 1920,
  },
  {
    name: "voyage-90-preview",
    images: 20,
    videos: 5,
    seconds: 90,
    width: 540,
    height: 960,
  },
  {
    name: "horizontal",
    images: 1,
    videos: 0,
    seconds: 1,
    width: 1920,
    height: 1080,
  },
  {
    name: "square",
    images: 1,
    videos: 0,
    seconds: 1,
    width: 1080,
    height: 1080,
  },
  {
    name: "four-five",
    images: 1,
    videos: 0,
    seconds: 1,
    width: 1080,
    height: 1350,
  },
  {
    name: "effects",
    images: 7,
    videos: 0,
    seconds: 14,
    width: 540,
    height: 960,
  },
];
const results = [];
for (const c of cases) {
  const dir = join(root, c.name);
  await mkdir(dir, { recursive: true });
  const assets = Array.from({ length: c.images + c.videos }, (_, i) => ({
    id: `asset-${i}`,
    media_type: i < c.images ? ("image" as const) : ("video" as const),
    duration_ms: i < c.images ? null : 6000,
    upload_status: "ready" as const,
    deleted_at: null,
  }));
  const draft = buildTimeline({
    project: {
      target_duration_seconds: c.seconds,
      target_aspect_ratio: "9:16",
    },
    assets,
  });
  if (c.name === "effects") {
    const animations: Animation[] = [
      "static",
      "zoom_in",
      "zoom_out",
      "pan_left",
      "pan_right",
      "pan_up",
      "pan_down",
    ];
    const transitions: Transition[] = [
      "cut",
      "fade",
      "dissolve",
      "slide_left",
      "slide_right",
      "zoom",
      "cut",
    ];
    draft.clips.forEach((clip, i) => {
      clip.animation_type = animations[i];
      clip.metadata_json = { motion: photoMotion(animations[i]) };
      clip.transition_in = transitions[i];
      clip.transition_duration_ms = transitions[i] === "cut" ? 0 : 500;
    });
  }
  const t = {
    ...draft,
    id: "t",
    workspace_id: "w",
    project_id: "p",
    version: 1,
    revision: 1,
    status: "generated",
    created_by: "u",
    created_at: "",
    updated_at: "",
  } as TimelineDocument;
  renderMetrics.peakChildRssBytes = 0;
  const start = performance.now();
  const result = await renderTimeline(
    t,
    new Map(
      assets.map((a) => [a.id, a.media_type === "image" ? image : video]),
    ),
    { width: c.width, height: c.height, fps: 30 },
    dir,
    r,
  );
  const row = {
    name: c.name,
    renderMs: performance.now() - start,
    durationMs: c.seconds * 1000,
    width: c.width,
    height: c.height,
    peakChildRssBytes: renderMetrics.peakChildRssBytes,
    nodeRss: process.memoryUsage().rss,
    scratchBytes: result.scratchBytes,
    probe: result.probe,
  };
  results.push(row);
  console.log(JSON.stringify({ ...row, probe: undefined }));
  await writeFile(join(root, "results.json"), JSON.stringify(results, null, 2));
  // Keep only the resulting MP4 and evidence, remove generated intermediates.
  const { readdir } = await import("node:fs/promises");
  for (const f of await readdir(dir))
    if (f !== "output.mp4") await rm(join(dir, f));
}
console.log(`Evidence: ${root}`);
