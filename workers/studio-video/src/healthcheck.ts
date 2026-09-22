import { Redis } from "ioredis";

/**
 * Liveness check for the render worker container. Verifies only the one dependency whose loss
 * makes the process unable to make progress at all (Redis, the BullMQ transport). It does not
 * (and cannot, without side effects) verify Supabase reachability, disk space, or ffmpeg — those
 * failures already surface as per-job "failed" events (see worker.ts) rather than a dead process,
 * so they should not restart a worker that is otherwise mid-render.
 */
export async function pingRedis(
  url: string,
  timeoutMs = 5000,
): Promise<boolean> {
  const connection = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: timeoutMs,
  });
  try {
    await connection.connect();
    const reply = await connection.ping();
    return reply === "PONG";
  } finally {
    connection.disconnect();
  }
}

async function main() {
  const url = process.env.STUDIO_REDIS_URL;
  if (!url) {
    console.error(JSON.stringify({ event: "healthcheck_failed", reason: "missing_STUDIO_REDIS_URL" }));
    process.exit(1);
  }
  try {
    const ok = await pingRedis(url);
    if (!ok) throw new Error("unexpected_ping_reply");
    process.exit(0);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "healthcheck_failed",
        reason: error instanceof Error ? error.message : "unknown",
      }),
    );
    process.exit(1);
  }
}

if (process.env.STUDIO_HEALTHCHECK_SKIP_MAIN !== "1") void main();
