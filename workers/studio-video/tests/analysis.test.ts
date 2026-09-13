import { beforeAll, afterAll, it, expect } from "vitest";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { analyzeLocalFile } from "../src/analysis-provider.ts";
import { command, type Runtime } from "../src/render.ts";
import { isNearDuplicate } from "../../../packages/studio-domain/src/analysis.ts";
const require = createRequire(import.meta.url),
  python = process.env.STUDIO_ANALYSIS_PYTHON || "python3";
const runtime: Runtime = {
  ffmpeg: require("ffmpeg-static"),
  ffprobe: require("ffprobe-static").path,
  signal: AbortSignal.timeout(120000),
  progress: async () => {},
};
let dir: string;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "studio-vision-test-"));
  await command(python, [resolve("analysis/fixtures.py"), dir], runtime.signal);
}, 30000);
afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});
async function image(name: string) {
  const scratch = join(dir, `scratch-${name.replace(/\W/g, "")}`);
  await mkdir(scratch, { recursive: true });
  return (
    await analyzeLocalFile(
      join(dir, name),
      false,
      scratch,
      runtime,
      python,
    ).catch((e) => {
      console.error(name, e.diagnostic ?? e.message);
      throw e;
    })
  ).result;
}
it("real decoded sharpness and exposure distinguish controlled images", async () => {
  const sharp = await image("sharp.png"),
    blur = await image("blur.png"),
    dark = await image("dark.png"),
    bright = await image("bright.png");
  expect(sharp.sharpness_score).toBeGreaterThan(blur.sharpness_score);
  expect(sharp.quality_score).toBeGreaterThan(blur.quality_score);
  expect(sharp.quality_score).toBeGreaterThan(dark.quality_score);
  expect(dark.exposure).toBe("very-dark");
  expect(bright.exposure).toBe("overexposed");
  expect(sharp.face_count).toBe(0);
}, 30000);
it("exact hash, perceptual near match and distinct false-positive guard", async () => {
  const a = await image("sharp.png"),
    again = await image("sharp.png"),
    near = await image("near.jpg"),
    other = await image("media-010.jpg");
  expect(a.sha256).toBe(again.sha256);
  expect(a.sha256).not.toBe(near.sha256);
  expect(isNearDuplicate(a, near)).toBe(true);
  expect(isNearDuplicate(a, other)).toBe(false);
}, 30000);
it("detects a public-domain face without identity and reports orientation", async () => {
  const scratch = join(dir, "face");
  await mkdir(scratch);
  const face = (
    await analyzeLocalFile(
      resolve("tests/analysis-fixtures/face-public-domain.png"),
      false,
      scratch,
      runtime,
      python,
    )
  ).result;
  expect(face.face_count).toBeGreaterThanOrEqual(1);
  expect(face.focus?.every((n) => n >= 0 && n <= 1)).toBe(true);
  expect(Object.keys(face).some((k) => /identity|embedding|name/.test(k))).toBe(
    false,
  );
  expect((await image("portrait.png")).orientation).toBe("vertical");
}, 30000);
it("video uses five sampled frames and no every-frame analysis", async () => {
  const path = join(dir, "sample.mp4"),
    scratch = join(dir, "video");
  await mkdir(scratch);
  await command(
    runtime.ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=size=320x240:rate=10",
      "-t",
      "2",
      "-c:v",
      "libx264",
      "-threads",
      "1",
      "-pix_fmt",
      "yuv420p",
      path,
    ],
    runtime.signal,
  );
  const result = (await analyzeLocalFile(path, true, scratch, runtime, python))
    .result;
  expect(result.samples).toHaveLength(5);
  expect(result.duration_ms).toBe(2000);
  expect(result.orientation).toBe("horizontal");
}, 30000);
