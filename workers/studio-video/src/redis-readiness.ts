import { Redis } from "ioredis";

/**
 * Readiness check of the Redis instance BEFORE the worker is pointed at it (one-shot, operator
 * run — not the container liveness probe, which stays `healthcheck.ts`). It verifies what the
 * liveness ping cannot see and what BullMQ needs from the server itself:
 *
 * - version: BullMQ refuses Redis < 5.0.0 and recommends >= 6.2.0;
 * - `maxmemory-policy` must be `noeviction`: with any evicting policy Redis may silently drop
 *   BullMQ keys (job hashes, locks) under memory pressure. The Postgres outbox re-feeds lost jobs,
 *   so nothing is lost for good, but renders stall until the lease expires — a managed Redis
 *   often defaults to an evicting policy and must be reconfigured.
 *
 * Reads with `INFO` only (commonly allowed on managed Redis where `CONFIG GET` is not). No write.
 * Never prints the URL (it may carry a password).
 */
export type ReadinessFinding = { level: "error" | "warning"; code: string; message: string };

export const MINIMUM_VERSION = "5.0.0";
export const RECOMMENDED_VERSION = "6.2.0";

export function parseInfo(info: string): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const line of info.split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0 && !line.startsWith("#")) fields[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  return fields;
}

function versionLower(actual: string, wanted: string) {
  const a = actual.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const w = wanted.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (w[i] ?? 0)) return (a[i] ?? 0) < (w[i] ?? 0);
  return false;
}

export function evaluate(url: string, fields: Record<string, string>): ReadinessFinding[] {
  const out: ReadinessFinding[] = [];
  const { protocol, hostname } = new URL(url);
  const local = /^(localhost|127\.\d+\.\d+\.\d+|::1|\[::1\])$/.test(hostname);
  if (protocol === "redis:" && !local) {
    out.push({ level: "warning", code: "REDIS-NO-TLS", message: "remote Redis over plain redis:// — prefer rediss:// (TLS)" });
  } else if (protocol !== "redis:" && protocol !== "rediss:") {
    out.push({ level: "error", code: "REDIS-SCHEME", message: "STUDIO_REDIS_URL must use redis:// or rediss://" });
  }
  const version = fields.redis_version;
  if (!version) out.push({ level: "warning", code: "REDIS-VERSION-UNKNOWN", message: "INFO did not report redis_version" });
  else if (versionLower(version, MINIMUM_VERSION)) out.push({ level: "error", code: "REDIS-VERSION", message: `Redis ${version} < ${MINIMUM_VERSION} (refused by BullMQ)` });
  else if (versionLower(version, RECOMMENDED_VERSION)) out.push({ level: "warning", code: "REDIS-VERSION-OLD", message: `Redis ${version} < ${RECOMMENDED_VERSION} (BullMQ recommendation)` });
  const policy = fields.maxmemory_policy;
  if (!policy) out.push({ level: "warning", code: "REDIS-POLICY-UNKNOWN", message: "INFO did not report maxmemory_policy: confirm noeviction with the provider" });
  else if (policy !== "noeviction") out.push({ level: "error", code: "REDIS-EVICTION", message: `maxmemory-policy is ${policy}, BullMQ requires noeviction` });
  return out;
}

export async function checkRedisReadiness(url: string, timeoutMs = 5000) {
  const connection = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: timeoutMs });
  try {
    await connection.connect();
    const fields = { ...parseInfo(await connection.info("server")), ...parseInfo(await connection.info("memory")) };
    return { version: fields.redis_version ?? null, policy: fields.maxmemory_policy ?? null, findings: evaluate(url, fields) };
  } finally {
    connection.disconnect();
  }
}

async function main() {
  const url = process.env.STUDIO_REDIS_URL;
  if (!url) {
    console.error(JSON.stringify({ event: "redis_readiness", ok: false, reason: "missing_STUDIO_REDIS_URL" }));
    process.exit(1);
  }
  try {
    const result = await checkRedisReadiness(url);
    const ok = !result.findings.some((f) => f.level === "error");
    console.log(JSON.stringify({ event: "redis_readiness", ok, ...result }));
    process.exit(ok ? 0 : 1);
  } catch (error) {
    console.error(JSON.stringify({ event: "redis_readiness", ok: false, reason: error instanceof Error ? error.message : "unknown" }));
    process.exit(1);
  }
}

if (process.env.STUDIO_HEALTHCHECK_SKIP_MAIN !== "1") void main();
