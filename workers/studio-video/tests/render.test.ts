import { it, expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { buildTimeline } from "../../../packages/studio-domain/src/timeline.ts";
import {
  renderTimeline,
  command,
  frames,
  validateTimeline,
} from "../src/render.ts";
import type { TimelineDocument } from "../../../packages/studio-domain/src/timeline.ts";
const require = createRequire(import.meta.url);
const runtime = {
  ffmpeg: require("ffmpeg-static") as string,
  ffprobe: (require("ffprobe-static") as { path: string }).path,
  signal: AbortSignal.timeout(120000),
  progress: async () => {},
};
function audioRms(path: string) {
  const pcm = execFileSync(runtime.ffmpeg, [
    "-v",
    "error",
    "-i",
    path,
    "-t",
    "2",
    "-vn",
    "-ac",
    "1",
    "-ar",
    "8000",
    "-f",
    "f32le",
    "pipe:1",
  ]);
  let sum = 0;
  for (let i = 0; i < pcm.length; i += 4) sum += pcm.readFloatLE(i) ** 2;
  return Math.sqrt(sum / (pcm.length / 4));
}
function doc() {
  return {
    ...buildTimeline({
      project: { target_aspect_ratio: "9:16", target_duration_seconds: 2 },
      assets: [
        {
          id: "image",
          media_type: "image",
          duration_ms: null,
          upload_status: "ready",
          deleted_at: null,
        },
      ],
    }),
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
}
it("absolute frame boundaries and zero-frame rejection", () => {
  expect(frames(1000)).toBe(30);
  const t = doc();
  t.clips[0].duration_ms = 1;
  t.clips[0].timeline_end_ms = 1;
  expect(() => validateTimeline(t)).toThrow("TIMELINE_INVALID");
});
it("real short render: motion, silent AAC, H264, frames, duration", async () => {
  const dir = await mkdtemp(join(tmpdir(), "studio-render-test-"));
  try {
    const path = join(dir, "image.png");
    await command(
      runtime.ffmpeg,
      ["-y", "-f", "lavfi", "-i", "testsrc2=s=320x240", "-frames:v", "1", path],
      runtime.signal,
    );
    const result = await renderTimeline(
      doc(),
      new Map([["image", path]]),
      { width: 270, height: 480, fps: 30 },
      dir,
      runtime,
    );
    expect(
      result.probe.streams.find((x) => x.codec_type === "video")?.codec_name,
    ).toBe("h264");
    expect(Number(result.probe.format.duration)).toBeCloseTo(2, 1);
    expect(result.scratchBytes).toBeGreaterThan(0);
    expect(audioRms(result.output)).toBeLessThan(0.000001);
  } catch (e) {
    if (e && typeof e === "object" && "diagnostic" in e)
      console.error(e.diagnostic);
    throw e;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 120000);
it("MOV H264: trims past source silence and preserves proportional clip volume", async () => {
  const dir = await mkdtemp(join(tmpdir(), "studio-audio-trim-"));
  try {
    const source = join(dir, "source.mov");
    await command(
      runtime.ffmpeg,
      [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc2=s=64x64:r=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:sample_rate=48000",
        "-af",
        "volume='if(lt(t,2),0,1)':eval=frame",
        "-t",
        "6",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        source,
      ],
      runtime.signal,
    );
    const t = doc();
    t.clips[0].clip_type = "video";
    t.clips[0].source_start_ms = 2000;
    t.clips[0].source_end_ms = 4000;
    t.clips[0].animation_type = "static";
    t.clips[0].transition_in = "cut";
    t.clips[0].transition_duration_ms = 0;
    t.clips[0].metadata_json.motion = {
      scaleStart: 1,
      scaleEnd: 1,
      positionStart: [0.5, 0.5],
      positionEnd: [0.5, 0.5],
      easing: "linear",
    };
    const render = () =>
      renderTimeline(
        t,
        new Map([["image", source]]),
        { width: 64, height: 64, fps: 30 },
        dir,
        runtime,
      );
    t.clips[0].volume = 1;
    const full = audioRms((await render()).output);
    expect(full).toBeGreaterThan(0.05);
    t.clips[0].volume = 0.25;
    const quarter = audioRms((await render()).output);
    expect(quarter / full).toBeCloseTo(0.25, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 120000);
it("cancellation terminates a live encoder", async () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 100);
  try {
    await expect(
      command(
        runtime.ffmpeg,
        ["-f", "lavfi", "-i", "testsrc2=s=64x64", "-f", "null", "-"],
        controller.signal,
      ),
    ).rejects.toThrow("CANCELLED");
  } finally {
    clearTimeout(timer);
  }
});
it("corrupt source fails within its independent probe deadline", async () => {
  const { writeFile } = await import("node:fs/promises");
  const { probe } = await import("../src/render.ts");
  const dir = await mkdtemp(join(tmpdir(), "studio-probe-corrupt-"));
  try {
    const path = join(dir, "bad.jpg");
    await writeFile(path, Buffer.alloc(1024, 1));
    await expect(probe(path, runtime)).rejects.toThrow("ASSET_UNREADABLE");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 15000);
for (const property of ["scale", "rotation", "playback_rate"] as const)
  it(`reject unsupported ${property}, never invent transforms`, () => {
    const t = doc();
    t.clips[0][property] = 3;
    expect(() => validateTimeline(t)).toThrow("TIMELINE_INVALID");
  });
it("mapping preserves the timeline object", () => {
  const t = doc(),
    before = JSON.stringify(t);
  validateTimeline(t);
  expect(JSON.stringify(t)).toBe(before);
});
it("fade spends exactly half its duration fading to black, then half fading in", async () => {
  const { execFileSync } = await import("node:child_process");
  const dir = await mkdtemp(join(tmpdir(), "studio-fade-"));
  try {
    const files = new Map<string, string>();
    for (const color of ["red", "blue"]) {
      const path = join(dir, `${color}.png`);
      await command(
        runtime.ffmpeg,
        [
          "-y",
          "-f",
          "lavfi",
          "-i",
          `color=${color}:s=64x64`,
          "-frames:v",
          "1",
          path,
        ],
        runtime.signal,
      );
      files.set(color, path);
    }
    const t = doc(),
      draft = buildTimeline({
        project: { target_aspect_ratio: "1:1", target_duration_seconds: 4 },
        assets: ["red", "blue"].map((id) => ({
          id,
          media_type: "image",
          duration_ms: null,
          upload_status: "ready",
          deleted_at: null,
        })),
      });
    Object.assign(t, draft);
    t.clips[0].transition_in = "cut";
    t.clips[0].transition_duration_ms = 0;
    const result = await renderTimeline(
      t,
      files,
      { width: 64, height: 64, fps: 30 },
      dir,
      runtime,
    );
    const bytes = execFileSync(runtime.ffmpeg, [
      "-v",
      "error",
      "-i",
      result.output,
      "-vf",
      "select=eq(n\\,64),scale=1:1,format=rgb24",
      "-vsync",
      "0",
      "-f",
      "rawvideo",
      "pipe:1",
    ]);
    expect(bytes[0]).toBeGreaterThan(80);
    expect(bytes[0]).toBeLessThan(150);
    expect(bytes[2]).toBeLessThan(15);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 120000);
