import { spawn, execFile } from "node:child_process";
import { writeFile, stat, readdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  TimelineDocument,
  TimelineClipDraft,
} from "../../../packages/studio-domain/src/timeline.ts";
export const renderMetrics = { peakChildRssBytes: 0 };
export class RenderError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
export interface Profile {
  width: number;
  height: number;
  fps: 30;
}
export interface Probe {
  streams: {
    codec_type: string;
    codec_name: string;
    width?: number;
    height?: number;
    r_frame_rate?: string;
    pix_fmt?: string;
    duration?: string;
  }[];
  format: { duration: string; size: string; format_name: string };
}
export interface Runtime {
  ffmpeg: string;
  ffprobe: string;
  signal: AbortSignal;
  progress: (stage: string, percent: number) => Promise<void>;
}
export function frames(ms: number) {
  return Math.round((ms * 30) / 1000);
}
export function validateTimeline(t: TimelineDocument) {
  if (!t.clips.length || t.clips.length > 1000 || t.total_duration_ms > 600000)
    throw new RenderError("TIMELINE_INVALID");
  let end = 0;
  for (const c of t.clips) {
    if (
      c.timeline_start_ms !== end ||
      c.timeline_end_ms !== end + c.duration_ms ||
      frames(c.timeline_end_ms) <= frames(end) ||
      c.playback_rate !== 1 ||
      c.rotation !== 0 ||
      c.scale !== 1 ||
      c.position_x !== 0.5 ||
      c.position_y !== 0.5 ||
      !["cover", "contain"].includes(c.crop_mode) ||
      !Number.isFinite(c.volume) ||
      c.volume < 0 ||
      c.volume > 1 ||
      ![
        "cut",
        "fade",
        "dissolve",
        "slide_left",
        "slide_right",
        "zoom",
      ].includes(c.transition_in) ||
      c.transition_duration_ms < 0 ||
      c.transition_duration_ms > c.duration_ms / 2
    )
      throw new RenderError("TIMELINE_INVALID");
    const m = c.metadata_json.motion;
    if (
      [...m.positionStart, ...m.positionEnd, m.scaleStart, m.scaleEnd].some(
        (x) => !Number.isFinite(x) || x < 0 || x > 2,
      ) ||
      m.scaleStart < 1 ||
      m.scaleEnd < 1 ||
      m.easing !== "linear"
    )
      throw new RenderError("TIMELINE_INVALID");
    end = c.timeline_end_ms;
  }
  if (end !== t.total_duration_ms) throw new RenderError("TIMELINE_INVALID");
}
// Arguments only, no shell. Child environment deliberately excludes all service credentials.
export async function command(
  bin: string,
  args: string[],
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, {
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const monitor = setInterval(() => {
      try {
        if (child.pid)
          execFile(
            "ps",
            ["-o", "rss=", "-p", String(child.pid)],
            (error, out) => {
              if (!error) {
                const bytes = Number(out.trim()) * 1024;
                renderMetrics.peakChildRssBytes = Math.max(
                  renderMetrics.peakChildRssBytes,
                  bytes,
                );
                if (bytes > 1536 * 1024 ** 2) child.kill("SIGKILL");
              }
            },
          );
      } catch {
        /* Optional RSS sampling unavailable in restricted hosts. */
      }
    }, 250);
    let stdout = "",
      stderr = "";
    const stop = () => child.kill("SIGKILL");
    signal.addEventListener("abort", stop, { once: true });
    child.stdout.on("data", (b) => {
      stdout = (stdout + b).slice(-1048576);
    });
    child.stderr.on("data", (b) => {
      stderr = (stderr + b).slice(-16384);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      clearInterval(monitor);
      signal.removeEventListener("abort", stop);
      if (signal.aborted) reject(new RenderError("CANCELLED"));
      else if (code)
        reject(
          Object.assign(new RenderError("RENDER_FAILED"), {
            diagnostic: stderr,
          }),
        );
      else resolve(stdout);
    });
  });
}
export async function probe(path: string, r: Runtime): Promise<Probe> {
  try {
    const result: Probe = JSON.parse(
      await command(
        r.ffprobe,
        [
          "-v",
          "error",
          "-protocol_whitelist",
          "file,pipe",
          "-format_whitelist",
          "mov,image2,jpeg_pipe,png_pipe,webp_pipe,matroska,webm",
          "-show_streams",
          "-show_format",
          "-of",
          "json",
          path,
        ],
        AbortSignal.any([r.signal, AbortSignal.timeout(10000)]),
      ),
    );
    const v = result.streams.find((x) => x.codec_type === "video");
    if (
      !v?.width ||
      !v.height ||
      v.width > 16384 ||
      v.height > 16384 ||
      v.width * v.height > 100000000
    )
      throw new RenderError("ASSET_UNREADABLE");
    return result;
  } catch {
    throw new RenderError("ASSET_UNREADABLE");
  }
}
export function motionFilter(c: TimelineClipDraft, p: Profile, n: number) {
  const m = c.metadata_json.motion,
    lerp = (a: number, b: number) => `${a}+(${b - a})*on/${n}`;
  const fit =
    c.crop_mode === "cover"
      ? `scale=${p.width * 2}:${p.height * 2}:force_original_aspect_ratio=increase,crop=${p.width * 2}:${p.height * 2}`
      : `scale=${p.width * 2}:${p.height * 2}:force_original_aspect_ratio=decrease,pad=${p.width * 2}:${p.height * 2}:(ow-iw)/2:(oh-ih)/2:black`;
  return `${fit},setsar=1,zoompan=z='${lerp(m.scaleStart, m.scaleEnd)}':x='(iw-iw/zoom)*(${lerp(m.positionStart[0], m.positionEnd[0])})':y='(ih-ih/zoom)*(${lerp(m.positionStart[1], m.positionEnd[1])})':d=1:s=${p.width}x${p.height}:fps=30,format=yuv420p`;
}
const base = [
  "-hide_banner",
  "-loglevel",
  "error",
  "-nostdin",
  "-y",
  "-threads",
  "2",
  "-filter_threads",
  "1",
  "-filter_complex_threads",
  "1",
];
const videoCodec = [
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-crf",
  "20",
  "-pix_fmt",
  "yuv420p",
  "-threads",
  "2",
];
export async function renderTimeline(
  t: TimelineDocument,
  files: Map<string, string>,
  p: Profile,
  dir: string,
  r: Runtime,
) {
  validateTimeline(t);
  const segments: string[] = [];
  let previous = "";
  for (const [i, c] of t.clips.entries()) {
    await r.progress("rendering", 10 + Math.floor((i / t.clips.length) * 65));
    r.signal.throwIfAborted();
    const input = files.get(c.asset_id);
    if (!input) throw new RenderError("ASSET_MISSING");
    const info = await probe(input, r),
      v = info.streams.find((s) => s.codec_type === "video");
    if (
      !v ||
      (c.clip_type === "video" && v.codec_name !== "h264") ||
      (c.clip_type === "image" &&
        !["mjpeg", "png", "webp"].includes(v.codec_name))
    )
      throw new RenderError("UNSUPPORTED_CODEC");
    if (
      c.clip_type === "video" &&
      (!c.source_end_ms ||
        c.source_start_ms < 0 ||
        c.source_end_ms > Number(info.format.duration) * 1000 + 50)
    )
      throw new RenderError("TIMELINE_INVALID");
    const n = frames(c.timeline_end_ms) - frames(c.timeline_start_ms),
      seconds = n / 30;
    const raw = join(dir, `clip-${i}.mkv`),
      segment = join(dir, `segment-${i}.mkv`),
      last = join(dir, `last-${i}.png`);
    const args = [
      ...base,
      "-protocol_whitelist",
      "file,pipe",
      ...(c.clip_type === "image"
        ? ["-loop", "1", "-framerate", "30"]
        : ["-ss", String(c.source_start_ms / 1000)]),
      "-i",
      input,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=r=48000:cl=stereo",
    ];
    const hasAudio =
      c.clip_type === "video" &&
      info.streams.some((s) => s.codec_type === "audio");
    const audio = hasAudio
      ? `[0:a]atrim=duration=${c.duration_ms / 1000},asetpts=PTS-STARTPTS,volume=${c.volume},aresample=48000,apad,atrim=duration=${seconds}[a]`
      : `[1:a]atrim=duration=${seconds}[a]`;
    args.push(
      "-filter_complex",
      `[0:v]fps=30,trim=duration=${c.duration_ms / 1000},setpts=PTS-STARTPTS,${motionFilter(c, p, n)}[v];${audio}`,
      "-map",
      "[v]",
      "-map",
      "[a]",
      "-frames:v",
      String(n),
      "-t",
      String(seconds),
      ...videoCodec,
      "-c:a",
      "pcm_s16le",
      "-ar",
      "48000",
      "-ac",
      "2",
      raw,
    );
    await command(r.ffmpeg, args, r.signal);
    // Save the transformed final image BEFORE applying the next transition.
    await command(
      r.ffmpeg,
      [
        ...base,
        "-i",
        raw,
        "-vf",
        `select=eq(n\\,${n - 1})`,
        "-frames:v",
        "1",
        last,
      ],
      r.signal,
    );
    if (c.transition_in === "cut" || !c.transition_duration_ms) {
      segments.push(raw);
    } else {
      const d = c.transition_duration_ms / 1000;
      const prev = previous
        ? ["-loop", "1", "-framerate", "30", "-i", previous]
        : ["-f", "lavfi", "-i", `color=black:s=${p.width}x${p.height}:r=30`];
      const transition = {
        fade: "custom:expr='if(gt(P,0.5),if(eq(PLANE,0),16,128)+(A-if(eq(PLANE,0),16,128))*(2*P-1),if(eq(PLANE,0),16,128)+(B-if(eq(PLANE,0),16,128))*(1-2*P))'",
        dissolve: "fade",
        slide_left: "slideleft",
        slide_right: "slideright",
        zoom: "fade",
      }[c.transition_in];
      const zoom =
        c.transition_in === "zoom"
          ? `,zoompan=z='if(lt(on,${d * 30}),1.1-0.1*on/${d * 30},1)':x='iw/2-iw/zoom/2':y='ih/2-ih/zoom/2':d=1:s=${p.width}x${p.height}:fps=30`
          : "";
      await command(
        r.ffmpeg,
        [
          ...base,
          ...prev,
          "-i",
          raw,
          "-filter_complex",
          `[0:v]format=yuv420p,settb=1/30,trim=duration=${d},setpts=PTS-STARTPTS[a];[1:v]settb=1/30,setpts=PTS-STARTPTS${zoom}[b];[a][b]xfade=transition=${transition}:duration=${d}:offset=0,format=yuv420p[v]`,
          "-map",
          "[v]",
          "-map",
          "1:a",
          "-frames:v",
          String(n),
          "-t",
          String(seconds),
          ...videoCodec,
          "-c:a",
          "copy",
          segment,
        ],
        r.signal,
      );
      segments.push(segment);
    }
    previous = last;
  }
  await r.progress("encoding", 80);
  const list = join(dir, "concat.txt");
  await writeFile(
    list,
    segments.map((s) => `file '${s.replaceAll("'", "'\\''")}'`).join("\n"),
  );
  const output = join(dir, "output.mp4");
  await command(
    r.ffmpeg,
    [
      ...base,
      "-f",
      "concat",
      "-safe",
      "0",
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      list,
      "-map",
      "0:v",
      "-map",
      "0:a",
      ...videoCodec,
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-t",
      String(frames(t.total_duration_ms) / 30),
      "-movflags",
      "+faststart",
      output,
    ],
    r.signal,
  );
  const result = await probe(output, r),
    v = result.streams.find((s) => s.codec_type === "video"),
    a = result.streams.find((s) => s.codec_type === "audio");
  if (
    v?.codec_name !== "h264" ||
    a?.codec_name !== "aac" ||
    v.width !== p.width ||
    v.height !== p.height ||
    v.r_frame_rate !== "30/1" ||
    v.pix_fmt !== "yuv420p" ||
    Math.abs(Number(result.format.duration) * 1000 - t.total_duration_ms) >
      100 ||
    !(Number(result.format.size) > 0)
  )
    throw new RenderError("ENCODE_FAILED");
  const scratch = (
    await Promise.all((await readdir(dir)).map((f) => stat(join(dir, f))))
  ).reduce((n, s) => n + s.size, 0);
  return { output, probe: result, scratchBytes: scratch };
}
