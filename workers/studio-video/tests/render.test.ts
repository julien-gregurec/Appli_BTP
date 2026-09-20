import { it, expect } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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
it("server watermark: drawn bottom-right on the final encode only when the job asks for it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "studio-watermark-"));
  const cornerBrightness = (file: string) =>
    Math.max(
      ...execFileSync(runtime.ffmpeg, [
        "-v",
        "error",
        "-i",
        file,
        "-vf",
        "select=eq(n\\,20),crop=iw*0.6:ih*0.12:iw*0.4:ih*0.86,format=gray",
        "-vsync",
        "0",
        "-f",
        "rawvideo",
        "pipe:1",
      ]),
    );
  try {
    const path = join(dir, "black.png");
    await command(
      runtime.ffmpeg,
      ["-y", "-f", "lavfi", "-i", "color=black:s=270x480", "-frames:v", "1", path],
      runtime.signal,
    );
    const render = async (watermark: boolean) => {
      const out = join(dir, watermark ? "wm" : "plain");
      await mkdir(out);
      const t = doc();
      t.presentation = null;
      return renderTimeline(
        t,
        new Map([["image", path]]),
        { width: 270, height: 480, fps: 30 },
        out,
        { ...runtime, watermark },
      );
    };
    const plain = await render(false),
      marked = await render(true);
    expect(cornerBrightness(plain.output)).toBeLessThan(30);
    expect(cornerBrightness(marked.output)).toBeGreaterThan(100);
    // Same geometry, codec and duration: the watermark never changes the container contract.
    const stream = (r: typeof plain) =>
      r.probe.streams.find((x) => x.codec_type === "video");
    expect(stream(marked)?.width).toBe(stream(plain)?.width);
    expect(stream(marked)?.codec_name).toBe("h264");
    expect(Number(marked.probe.format.duration)).toBeCloseTo(
      Number(plain.probe.format.duration),
      1,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 180000);

// ---- Lot M: imported music -------------------------------------------------
import { musicGraph } from "../src/render.ts";
const TRACK = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const typography = Object.fromEntries(
  ["display", "title", "subtitle", "body", "caption"].map((r) => [
    r,
    { family: "sans", weight: 700, size: 0.05, spacing: 0 },
  ]),
);
function withMusic(
  m: { volume: number; fade_in_ms: number; fade_out_ms: number } | null,
) {
  const t = doc();
  t.presentation = {
    version: 1,
    template: { id: "manual", version: 1, snapshot: {} },
    typography,
    overlays: [],
    logo: null,
    music: m ? { asset_id: TRACK, ...m } : null,
  } as unknown as TimelineDocument["presentation"];
  return t;
}
async function tone(dir: string, name: string, seconds: number) {
  const path = join(dir, name);
  await command(
    runtime.ffmpeg,
    ["-y", "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-ar", "44100", path],
    runtime.signal,
  );
  return path;
}
function windowRms(path: string, from: number, length: number) {
  const pcm = execFileSync(runtime.ffmpeg, [
    "-v", "error", "-ss", String(from), "-t", String(length), "-i", path,
    "-vn", "-ac", "1", "-ar", "8000", "-f", "f32le", "pipe:1",
  ]);
  let sum = 0;
  for (let i = 0; i < pcm.length; i += 4) sum += pcm.readFloatLE(i) ** 2;
  return Math.sqrt(sum / Math.max(1, pcm.length / 4));
}
async function renderWith(
  dir: string,
  t: TimelineDocument,
  files: Map<string, string>,
) {
  const png = join(dir, "image.png");
  await command(
    runtime.ffmpeg,
    ["-y", "-f", "lavfi", "-i", "color=blue:s=64x64", "-frames:v", "1", png],
    runtime.signal,
  );
  files.set("image", png);
  const out = join(dir, `out-${files.size}-${Math.random().toString(36).slice(2)}`);
  await mkdir(out);
  return renderTimeline(t, files, { width: 270, height: 480, fps: 30 }, out, runtime);
}
it.each([
  ["a shorter WAV loops", "short.wav", 0.6, 0.5],
  ["a longer MP3 is cut", "long.mp3", 8, 0.5],
  ["an AAC/M4A track", "song.m4a", 3, 0.5],
])("music: %s, AAC output, exact duration, audible", async (_label, file, seconds, volume) => {
  const dir = await mkdtemp(join(tmpdir(), "studio-music-"));
  try {
    const track = await tone(dir, file, seconds);
    const r = await renderWith(dir, withMusic({ volume, fade_in_ms: 0, fade_out_ms: 0 }), new Map([[TRACK, track]]));
    const audio = r.probe.streams.find((s) => s.codec_type === "audio");
    const video = r.probe.streams.find((s) => s.codec_type === "video");
    expect(audio?.codec_name).toBe("aac");
    expect(video?.codec_name).toBe("h264");
    expect(Number(r.probe.format.duration)).toBeCloseTo(2, 1);
    // lavfi sine peaks at 1/8 full scale: 0.044 RMS at volume 0.5, versus < 0.001 without music.
    expect(windowRms(r.output, 0.1, 0.4)).toBeGreaterThan(0.02);
    // The last half second is still audible: a short track loops instead of going silent.
    expect(windowRms(r.output, 1.4, 0.5)).toBeGreaterThan(0.02);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 180000);
it("music: volume scales the track, 0 is silent, and fades shape the ends", async () => {
  const dir = await mkdtemp(join(tmpdir(), "studio-music-"));
  try {
    const track = await tone(dir, "t.wav", 5);
    const files = () => new Map([[TRACK, track]]);
    const loud = await renderWith(dir, withMusic({ volume: 1, fade_in_ms: 0, fade_out_ms: 0 }), files());
    const soft = await renderWith(dir, withMusic({ volume: 0.25, fade_in_ms: 0, fade_out_ms: 0 }), files());
    const mute = await renderWith(dir, withMusic({ volume: 0, fade_in_ms: 0, fade_out_ms: 0 }), files());
    const faded = await renderWith(dir, withMusic({ volume: 1, fade_in_ms: 800, fade_out_ms: 800 }), files());
    expect(windowRms(loud.output, 0.5, 0.5) / windowRms(soft.output, 0.5, 0.5)).toBeGreaterThan(3);
    expect(windowRms(mute.output, 0.2, 1.5)).toBeLessThan(0.001);
    expect(windowRms(faded.output, 0, 0.1)).toBeLessThan(windowRms(faded.output, 0.9, 0.1) * 0.5);
    expect(windowRms(faded.output, 1.9, 0.1)).toBeLessThan(windowRms(faded.output, 0.9, 0.1) * 0.5);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 240000);
it("music: no track keeps the silent AAC, and a missing or unusable track fails with a precise code", async () => {
  const dir = await mkdtemp(join(tmpdir(), "studio-music-"));
  try {
    const none = await renderWith(dir, withMusic(null), new Map());
    expect(none.probe.streams.find((s) => s.codec_type === "audio")?.codec_name).toBe("aac");
    expect(windowRms(none.output, 0, 1.5)).toBeLessThan(0.001);
    const settings = { volume: 0.5, fade_in_ms: 0, fade_out_ms: 0 };
    await expect(renderWith(dir, withMusic(settings), new Map())).rejects.toMatchObject({ code: "ASSET_MISSING" });
    const text = join(dir, "not-audio.mp3");
    await writeFile(text, "this is not an mp3 file at all");
    await expect(renderWith(dir, withMusic(settings), new Map([[TRACK, text]]))).rejects.toMatchObject({ code: "MUSIC_UNREADABLE" });
    const silentVideo = join(dir, "video.mp4");
    await command(runtime.ffmpeg, ["-y", "-f", "lavfi", "-i", "testsrc=s=64x64:d=1", "-pix_fmt", "yuv420p", silentVideo], runtime.signal);
    await expect(renderWith(dir, withMusic(settings), new Map([[TRACK, silentVideo]]))).rejects.toMatchObject({ code: "MUSIC_UNREADABLE" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}, 240000);
it("music graph clamps fades to short videos and never fades past the end", () => {
  const g = musicGraph({ volume: 0.5, fade_in_ms: 10000, fade_out_ms: 10000 }, 2);
  expect(g).toContain("afade=t=in:st=0:d=2.000");
  expect(g).toContain("afade=t=out:st=0.000:d=2.000");
  expect(g).toContain("atrim=0:2.000");
  expect(g).toContain("alimiter");
  expect(musicGraph({ volume: 1, fade_in_ms: 0, fade_out_ms: 0 }, 60)).not.toContain("afade");
});
