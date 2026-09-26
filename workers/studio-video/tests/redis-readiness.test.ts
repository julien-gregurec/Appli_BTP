import { afterEach, expect, it, vi } from "vitest";

// Importing redis-readiness.ts runs its CLI entrypoint (process.exit) unless this is set.
process.env.STUDIO_HEALTHCHECK_SKIP_MAIN = "1";

const state: { info: Record<string, string>; connect: () => Promise<void>; disconnect: () => void } = {
  info: {},
  connect: async () => {},
  disconnect: () => {},
};

vi.mock("ioredis", () => ({
  Redis: class {
    connect = () => state.connect();
    info = async (section: string) => state.info[section] ?? "";
    disconnect = () => state.disconnect();
  },
}));

const server = (version: string) => `# Server\r\nredis_version:${version}\r\nredis_mode:standalone\r\n`;
const memory = (policy: string) => `# Memory\r\nused_memory:1000\r\nmaxmemory_policy:${policy}\r\n`;

afterEach(() => {
  state.info = {};
  state.connect = async () => {};
  state.disconnect = () => {};
});

it("accepts a recent Redis with noeviction", async () => {
  state.info = { server: server("7.4.2"), memory: memory("noeviction") };
  const { checkRedisReadiness } = await import("../src/redis-readiness.ts");
  const result = await checkRedisReadiness("rediss://user:secret@redis.example.com:6380");
  expect(result.findings).toEqual([]);
  expect(result.version).toBe("7.4.2");
});

it("refuses an evicting memory policy (BullMQ keys could be dropped)", async () => {
  state.info = { server: server("7.2.0"), memory: memory("allkeys-lru") };
  const { checkRedisReadiness } = await import("../src/redis-readiness.ts");
  const result = await checkRedisReadiness("rediss://redis.example.com:6380");
  expect(result.findings.map((f) => [f.level, f.code])).toEqual([["error", "REDIS-EVICTION"]]);
});

it("refuses Redis older than BullMQ's minimum and warns below the recommendation", async () => {
  const { evaluate } = await import("../src/redis-readiness.ts");
  expect(evaluate("redis://127.0.0.1:6379", { redis_version: "4.0.14", maxmemory_policy: "noeviction" })[0].code).toBe("REDIS-VERSION");
  expect(evaluate("redis://127.0.0.1:6379", { redis_version: "6.0.9", maxmemory_policy: "noeviction" })[0].code).toBe("REDIS-VERSION-OLD");
  expect(evaluate("redis://127.0.0.1:6379", { redis_version: "6.2.0", maxmemory_policy: "noeviction" })).toEqual([]);
});

it("warns on a remote plain-text Redis, not on a local one", async () => {
  const { evaluate } = await import("../src/redis-readiness.ts");
  const ok = { redis_version: "7.4.2", maxmemory_policy: "noeviction" };
  expect(evaluate("redis://redis.example.com:6379", ok).map((f) => f.code)).toEqual(["REDIS-NO-TLS"]);
  expect(evaluate("redis://127.0.0.1:6379", ok)).toEqual([]);
});

it("reports an unknown policy as a warning when INFO hides it", async () => {
  const { evaluate } = await import("../src/redis-readiness.ts");
  expect(evaluate("rediss://r.example.com", { redis_version: "7.4.2" }).map((f) => f.code)).toEqual(["REDIS-POLICY-UNKNOWN"]);
});

it("always disconnects, even when the connection fails", async () => {
  const disconnect = vi.fn();
  state.disconnect = disconnect;
  state.connect = async () => {
    throw new Error("ECONNREFUSED");
  };
  const { checkRedisReadiness } = await import("../src/redis-readiness.ts");
  await expect(checkRedisReadiness("redis://127.0.0.1:1")).rejects.toThrow("ECONNREFUSED");
  expect(disconnect).toHaveBeenCalledOnce();
});
