import { Redis } from "ioredis";
import { Queue, Worker } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, stat, readdir } from "node:fs/promises";
import { createWriteStream, createReadStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { StudioRenderJob } from "../../../packages/studio-domain/src/render.ts";
import { renderTimeline, RenderError, renderMetrics } from "./render.ts";
import { mayDiscardUpload } from "./cleanup.ts";
const required = (key: string) => {
  const v = process.env[key];
  if (!v) throw Error(`Missing ${key}`);
  return v;
};
const origin = required("NEXT_PUBLIC_SUPABASE_URL"),
  key = required("STUDIO_STORAGE_SERVICE_KEY");
const redis = new URL(required("STUDIO_REDIS_URL"));
const connection = new Redis(redis.href, { maxRetriesPerRequest: null });
const admin = createClient(origin, key, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.any([
          AbortSignal.timeout(15000),
          ...(init?.signal ? [init.signal] : []),
        ]),
      }),
  },
});
const require = createRequire(import.meta.url);
const ffmpeg =
  process.env.STUDIO_FFMPEG_PATH || (require("ffmpeg-static") as string);
const ffprobe =
  process.env.STUDIO_FFPROBE_PATH ||
  (require("ffprobe-static") as { path: string }).path;
const queue = new Queue("studio-renders-v1", { connection });
const scratchRoot =
  process.env.STUDIO_RENDER_TMP || join(tmpdir(), "elsatia-studio-renders");
await mkdir(scratchRoot, { recursive: true, mode: 0o700 });
async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const r = await admin.rpc(name, args);
  if (r.error) throw new RenderError("RENDER_FAILED");
  return r.data as T;
}
let dispatching = false;
async function dispatch() {
  if (dispatching) return;
  dispatching = true;
  try {
    for (const id of await rpc<string[]>("studio_render_dispatch"))
      await queue.add(
        "render",
        { id },
        { jobId: id, attempts: 1, removeOnComplete: true, removeOnFail: true },
      );
  } catch {
    console.error(JSON.stringify({ event: "dispatch_unavailable" }));
  } finally {
    dispatching = false;
  }
}
const controllers = new Set<AbortController>();
const worker = new Worker<{ id: string }>(
  "studio-renders-v1",
  async (message) => {
    const lease = randomUUID(),
      job = await rpc<StudioRenderJob | null>("studio_claim_render", {
        p_job: message.data.id,
        p_lease: lease,
      });
    if (!job) return;
    const controller = new AbortController();
    controllers.add(controller);
    let stage = "preparing",
      percent = 1,
      pushing: Promise<void> | null = null,
      published = false;
    const sync = async () => {
      if (pushing) return pushing;
      pushing = (async () => {
        const ok = await rpc<boolean>("studio_render_progress", {
          p_job: job.id,
          p_lease: lease,
          p_status: stage,
          p_progress: percent,
        });
        if (!ok) controller.abort();
      })()
        .catch(() => {
          controller.abort();
        })
        .finally(() => {
          pushing = null;
        });
      return pushing;
    };
    const heartbeat = setInterval(() => void sync(), 1000);
    const timeout = setTimeout(
      () => controller.abort(new RenderError("RENDER_TIMEOUT")),
      Math.min(
        3600,
        Math.max(30, Number(process.env.STUDIO_RENDER_TIMEOUT_SECONDS || 600)),
      ) * 1000,
    );
    let dir = "";
    const objectKey = `studio/${job.workspace_id}/${job.project_id}/renders/${job.id}/${lease}/output.mp4`;
    renderMetrics.peakChildRssBytes = 0;
    let diskLimit: ReturnType<typeof setInterval> | undefined;
    const start = performance.now();
    let downloaded = 0;
    try {
      dir = await mkdtemp(join(scratchRoot, `${job.id}-${lease}-`));
      diskLimit = setInterval(() => {
        void readdir(dir)
          .then((files) => Promise.all(files.map((f) => stat(join(dir, f)))))
          .then((items) => {
            if (items.reduce((n, s) => n + s.size, 0) > 10 * 1024 ** 3)
              controller.abort(new RenderError("RESOURCE_LIMIT"));
          })
          .catch(() => controller.abort(new RenderError("RENDER_FAILED")));
      }, 1000);
      await sync();
      controller.signal.throwIfAborted();
      const files = new Map<string, string>();
      for (const [i, a] of job.snapshot.assets.entries()) {
        if (
          a.storage_bucket !== "studio-originals" ||
          !a.storage_key.startsWith(`studio/${job.workspace_id}/`) ||
          a.storage_key.includes("..")
        )
          throw new RenderError("ASSET_MISSING");
        const r = await fetch(
          `${origin}/storage/v1/object/authenticated/studio-originals/${a.storage_key}`,
          {
            headers: { apikey: key, Authorization: `Bearer ${key}` },
            signal: controller.signal,
          },
        );
        if (!r.ok || !r.body)
          throw new RenderError(
            r.status === 404 || r.status === 400
              ? "ASSET_MISSING"
              : "STORAGE_DOWNLOAD_FAILED",
          );
        const path = join(
          dir,
          `source-${i}.${a.media_type === "video" ? "mp4" : a.mime_type === "image/png" ? "png" : a.mime_type === "image/webp" ? "webp" : "jpg"}`,
        );
        let bytes = 0;
        const bound = new Transform({
          transform(chunk, _, done) {
            bytes += chunk.length;
            downloaded += chunk.length;
            if (bytes > a.file_size_bytes || downloaded > 5 * 1024 ** 3)
              done(new RenderError("ASSET_UNREADABLE"));
            else done(null, chunk);
          },
        });
        const reader = r.body.getReader();
        async function* chunks() {
          try {
            for (;;) {
              const x = await reader.read();
              if (x.done) break;
              yield x.value;
            }
          } finally {
            reader.releaseLock();
          }
        }
        await pipeline(
          Readable.from(chunks()),
          bound,
          createWriteStream(path, { mode: 0o600 }),
          { signal: controller.signal },
        );
        if (bytes !== a.file_size_bytes)
          throw new RenderError("ASSET_UNREADABLE");
        files.set(a.id, path);
      }
      const result = await renderTimeline(
        job.snapshot.timeline,
        files,
        { width: job.width, height: job.height, fps: 30 },
        dir,
        {
          ffmpeg,
          ffprobe,
          signal: controller.signal,
          progress: async (s, p) => {
            stage = s;
            percent = p;
            await sync();
            controller.signal.throwIfAborted();
          },
        },
      );
      stage = "uploading";
      percent = 95;
      await sync();
      controller.signal.throwIfAborted();
      const size = (await stat(result.output)).size;
      if (size > 1024 ** 3) throw new RenderError("STORAGE_UPLOAD_FAILED");
      const uploadOptions: RequestInit & { duplex: "half" } = {
        method: "POST",
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "video/mp4",
          "Content-Length": String(size),
          "x-upsert": "false",
        },
        body: Readable.toWeb(createReadStream(result.output)) as ReadableStream,
        duplex: "half",
        signal: controller.signal,
      };
      const upload = await fetch(
        `${origin}/storage/v1/object/studio-renders/${objectKey}`,
        uploadOptions,
      );
      if (!upload.ok) throw new RenderError("STORAGE_UPLOAD_FAILED");
      const output = await rpc<string | null>("studio_complete_render", {
        p_job: job.id,
        p_lease: lease,
        p_bytes: size,
        p_duration: Math.round(Number(result.probe.format.duration) * 1000),
      });
      if (!output) throw new RenderError("CANCELLED");
      published = true;
      console.log(
        JSON.stringify({
          event: "completed",
          job: job.id,
          renderMs: performance.now() - start,
          durationMs: job.snapshot.timeline.total_duration_ms,
          scratchBytes: result.scratchBytes,
          nodeRss: process.memoryUsage().rss,
          peakChildRssBytes: renderMetrics.peakChildRssBytes,
        }),
      );
    } catch (error) {
      const code = controller.signal.aborted
        ? controller.signal.reason instanceof RenderError
          ? controller.signal.reason.code
          : "CANCELLED"
        : error instanceof RenderError
          ? error.code
          : "RENDER_FAILED";
      if (
        process.env.STUDIO_RENDER_DIAGNOSTICS === "1" &&
        error instanceof Error &&
        "diagnostic" in error
      )
        console.error(String(error.diagnostic));
      await rpc("studio_render_progress", {
        p_job: job.id,
        p_lease: lease,
        p_status: "failed",
        p_progress: percent,
        p_error: code,
      }).catch(() => undefined);
      console.error(JSON.stringify({ event: "failed", job: job.id, code }));
    } finally {
      controllers.delete(controller);
      clearInterval(diskLimit);
      clearInterval(heartbeat);
      clearTimeout(timeout);
      if (pushing) await pushing;
      try {
        if (!published) {
          // A lost completion response is ambiguous: retain the object unless DB
          // positively confirms this lease is terminal and has no published output.
          const state = await admin
            .from("studio_render_jobs")
            .select("status,lease_token")
            .eq("id", job.id)
            .maybeSingle();
          if (mayDiscardUpload(state.data, state.error, lease))
            await admin.storage
              .from("studio-renders")
              .remove([objectKey])
              .catch(() => undefined);
        }
      } finally {
        if (dir) await rm(dir, { recursive: true, force: true });
      }
    }
  },
  { connection, concurrency: 1, maxStalledCount: 0 },
);
worker.on("error", () =>
  console.error(JSON.stringify({ event: "queue_unavailable" })),
);
const timer = setInterval(() => void dispatch(), 2000);
await dispatch();
async function stop() {
  clearInterval(timer);
  for (const controller of controllers) controller.abort();
  await worker.close();
  await queue.close();
  await connection.quit();
  process.exit(0);
}
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
