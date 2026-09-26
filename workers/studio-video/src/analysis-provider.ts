import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { command, probe, type Runtime } from "./render.ts";
import {
  analyzeWithFallback,
  type FrameMetrics,
  type StudioAIProvider,
  type AnalysisSource,
} from "../../../packages/studio-domain/src/analysis.ts";
export class LocalAIProvider implements StudioAIProvider {
  readonly id = "local-opencv";
  constructor(private python: string) {}
  async analyzeImage(
    source: AnalysisSource,
    signal: AbortSignal,
  ): Promise<FrameMetrics[]> {
    return this.measure(source, signal);
  }
  async analyzeVideo(
    source: AnalysisSource,
    signal: AbortSignal,
  ): Promise<FrameMetrics[]> {
    return this.measure(source, signal);
  }
  private async measure(
    source: AnalysisSource,
    signal: AbortSignal,
  ): Promise<FrameMetrics[]> {
    const value: unknown = JSON.parse(
      await command(
        this.python,
        [
          fileURLToPath(new URL("../analysis/measure.py", import.meta.url)),
          ...source.frames,
        ],
        signal,
      ),
    );
    if (!Array.isArray(value) || value.length !== source.frames.length)
      throw Error("MEASURE_INVALID");
    for (const row of value) {
      if (
        !row ||
        typeof row !== "object" ||
        ![
          row.sharpness,
          row.brightness,
          row.dark_fraction,
          row.bright_fraction,
          row.variance,
          row.face_count,
        ].every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0) ||
        !/^[0-9a-f]{16}$/.test(row.dhash) ||
        !Array.isArray(row.histogram) ||
        row.histogram.length !== 24 ||
        !row.histogram.every(
          (n: unknown) => typeof n === "number" && n >= 0 && n <= 1,
        )
      )
        throw Error("MEASURE_INVALID");
    }
    return value as FrameMetrics[];
  }
}
export async function analyzeLocalFile(
  path: string,
  video: boolean,
  directory: string,
  runtime: Runtime,
  python: string,
  external?: StudioAIProvider,
) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    runtime.signal.throwIfAborted();
    hash.update(chunk);
  }
  const info = await probe(path, runtime),
    stream = info.streams.find((s) => s.codec_type === "video")!;
  const duration = video
    ? Math.round(Number(info.format.duration) * 1000)
    : null;
  if (
    video &&
    (!Number.isFinite(duration) ||
      duration! <= 0 ||
      duration! > 24 * 3600 * 1000)
  )
    throw Error("DURATION_INVALID");
  const times = video
    ? [0, 0.25, 0.5, 0.75, 0.95].map((n) => (n * duration!) / 1000)
    : [0];
  const frames: string[] = [];
  for (const [i, time] of times.entries()) {
    const frame = join(directory, `analysis-${i}.png`);
    await command(
      runtime.ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-nostdin",
        "-threads",
        "1",
        "-filter_threads",
        "1",
        "-protocol_whitelist",
        "file,pipe",
        ...(video ? ["-ss", String(time)] : []),
        "-i",
        path,
        "-frames:v",
        "1",
        "-vf",
        "scale=512:512:force_original_aspect_ratio=decrease",
        "-y",
        frame,
      ],
      runtime.signal,
    );
    frames.push(frame);
  }
  return analyzeWithFallback(
    new LocalAIProvider(python),
    external,
    {
      frames,
      width: stream.width!,
      height: stream.height!,
      duration_ms: duration,
      sha256: hash.digest("hex"),
    },
    runtime.signal,
  );
}
