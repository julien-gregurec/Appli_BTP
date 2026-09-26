import { Redis } from "ioredis";
import { Queue, Worker } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { StudioMediaAsset } from "../../../packages/studio-domain/src/media.ts";
import {
  analysisEnabled,
  type StudioAIProvider,
} from "../../../packages/studio-domain/src/analysis.ts";
import { analyzeLocalFile } from "./analysis-provider.ts";
import { renderMetrics } from "./render.ts";
if (!analysisEnabled(process.env.STUDIO_AI_ANALYSIS)) {
  console.log("Analysis disabled");
  process.exit(0);
}
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw Error(`Missing ${name}`);
  return value;
};
const origin = required("NEXT_PUBLIC_SUPABASE_URL"),
  key = required("STUDIO_STORAGE_SERVICE_KEY"),
  python = required("STUDIO_ANALYSIS_PYTHON");
const connection = new Redis(required("STUDIO_REDIS_URL"), {
  maxRetriesPerRequest: null,
});
const admin = createClient(origin, key, {
  auth: { persistSession: false },
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
const require = createRequire(import.meta.url),
  ffmpeg =
    process.env.STUDIO_FFMPEG_PATH || (require("ffmpeg-static") as string),
  ffprobe =
    process.env.STUDIO_FFPROBE_PATH ||
    (require("ffprobe-static") as { path: string }).path;
const root =
  process.env.STUDIO_ANALYSIS_TMP || join(tmpdir(), "elsatia-studio-analysis");
await mkdir(root, { recursive: true, mode: 0o700 });
async function rpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const r = await admin.rpc(name, args);
  if (r.error) throw Error("ANALYSIS_DB_UNAVAILABLE");
  return r.data as T;
}
const queue = new Queue("studio-analysis-media-v1", { connection });
let dispatching = false;
async function dispatch() {
  if (dispatching) return;
  dispatching = true;
  try {
    for (const job of await rpc<{ id: string; attempts: number }[]>(
      "studio_analysis_dispatch",
    ))
      await queue.add(
        "analyze",
        { id: job.id },
        {
          jobId: `${job.id}-${job.attempts}`,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
  } catch {
    console.error("analysis_dispatch_unavailable");
  } finally {
    dispatching = false;
  }
}
const controllers = new Set<AbortController>();
// Failure injection is local qualification only, never a configured remote provider.
const injectedFailure = process.env.STUDIO_AI_TEST_PROVIDER_FAILURE === "1";
if (
  injectedFailure &&
  !["localhost", "127.0.0.1"].includes(new URL(origin).hostname)
)
  throw Error("Local failure fixture only");
const external: StudioAIProvider | undefined = injectedFailure
  ? {
      id: "qualification-unavailable",
      analyzeImage: async () => {
        throw Error("PROVIDER_UNAVAILABLE");
      },
      analyzeVideo: async () => {
        throw Error("PROVIDER_UNAVAILABLE");
      },
    }
  : undefined;
const worker = new Worker<{ id: string }>(
  "studio-analysis-media-v1",
  async (message) => {
    const lease = randomUUID(),
      job = await rpc<{
        id: string;
        workspace_id: string;
        asset: StudioMediaAsset;
      } | null>("studio_claim_analysis", {
        p_id: message.data.id,
        p_lease: lease,
      });
    if (!job) return;
    const controller = new AbortController();
    controllers.add(controller);
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(
        600,
        Math.max(
          10,
          Number(process.env.STUDIO_ANALYSIS_TIMEOUT_SECONDS || 120),
        ),
      ) * 1000,
    );
    let syncing = false;
    const heartbeat = setInterval(() => {
      if (syncing) return;
      syncing = true;
      void rpc<boolean>("studio_analysis_touch", {
        p_id: job.id,
        p_lease: lease,
      })
        .then((ok) => {
          if (!ok) controller.abort();
        })
        .catch(() => controller.abort())
        .finally(() => {
          syncing = false;
        });
    }, 2000);
    const start = performance.now();
    let directory = "";
    renderMetrics.peakChildRssBytes = 0;
    try {
      const a = job.asset;
      if (
        a.storage_bucket !== "studio-originals" ||
        !a.storage_key.startsWith(`studio/${job.workspace_id}/`) ||
        a.storage_key.includes("..") ||
        a.file_size_bytes > 1024 ** 3
      )
        throw Error("ASSET_INVALID");
      directory = await mkdtemp(join(root, `${job.id}-${lease}-`));
      const path = join(directory, "original");
      const r = await fetch(
        `${origin}/storage/v1/object/authenticated/studio-originals/${a.storage_key}`,
        {
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          signal: controller.signal,
        },
      );
      if (!r.ok || !r.body) throw Error("ASSET_MISSING");
      let bytes = 0;
      const bound = new Transform({
        transform(chunk, _, done) {
          bytes += chunk.length;
          done(bytes > a.file_size_bytes ? Error("SIZE_INVALID") : null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(r.body as import("node:stream/web").ReadableStream),
        bound,
        createWriteStream(path, { mode: 0o600 }),
        { signal: controller.signal },
      );
      if (bytes !== a.file_size_bytes) throw Error("SIZE_INVALID");
      const measured = await analyzeLocalFile(
        path,
        a.media_type === "video",
        directory,
        {
          ffmpeg,
          ffprobe,
          signal: controller.signal,
          progress: async () => {},
        },
        python,
        external,
      );
      const elapsed = Math.round(performance.now() - start);
      const published = await rpc<boolean>("studio_finish_analysis", {
        p_id: job.id,
        p_lease: lease,
        p_result: measured.result,
        p_elapsed: elapsed,
        p_fallback: measured.fallback,
      });
      console.log(
        JSON.stringify({
          event: published ? "analysis_completed" : "analysis_discarded",
          analysis: job.id,
          elapsed_ms: elapsed,
          provider_calls: 0,
          fallback: measured.fallback,
          node_rss: process.memoryUsage().rss,
          child_peak_rss: renderMetrics.peakChildRssBytes,
        }),
      );
    } catch {
      await rpc("studio_finish_analysis", {
        p_id: job.id,
        p_lease: lease,
        p_result: null,
        p_elapsed: Math.round(performance.now() - start),
        p_error: "ANALYSIS_FAILED",
      }).catch(() => {});
    } finally {
      controllers.delete(controller);
      clearInterval(heartbeat);
      clearTimeout(timeout);
      if (directory) await rm(directory, { recursive: true, force: true });
    }
  },
  {
    connection,
    concurrency: Math.min(
      2,
      Math.max(1, Number(process.env.STUDIO_ANALYSIS_CONCURRENCY || 1)),
    ),
    maxStalledCount: 0,
  },
);
worker.on("error", () => console.error("analysis_queue_unavailable"));
const timer = setInterval(() => void dispatch(), 2000);
await dispatch();
async function stop() {
  clearInterval(timer);
  for (const c of controllers) c.abort();
  await worker.close();
  await queue.close();
  await connection.quit();
  process.exit(0);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
