import { afterEach, expect, it, vi } from "vitest";

// Importing healthcheck.ts runs its CLI entrypoint (process.exit) unless this is set — it must
// be set before the first dynamic import below, not inside a test body.
process.env.STUDIO_HEALTHCHECK_SKIP_MAIN = "1";

const state: { connect: () => Promise<void>; ping: () => Promise<string>; disconnect: () => void } = {
  connect: async () => {},
  ping: async () => "PONG",
  disconnect: () => {},
};

vi.mock("ioredis", () => ({
  Redis: class {
    connect = () => state.connect();
    ping = () => state.ping();
    disconnect = () => state.disconnect();
  },
}));

afterEach(() => {
  state.connect = async () => {};
  state.ping = async () => "PONG";
  state.disconnect = () => {};
  vi.restoreAllMocks();
});

it("reports healthy when Redis answers PONG", async () => {
  const { pingRedis } = await import("../src/healthcheck.ts");
  await expect(pingRedis("redis://example.invalid:6379")).resolves.toBe(true);
});

it("reports unhealthy on an unexpected reply", async () => {
  state.ping = async () => "SOMETHING_ELSE";
  const { pingRedis } = await import("../src/healthcheck.ts");
  await expect(pingRedis("redis://example.invalid:6379")).resolves.toBe(false);
});

it("propagates a connection failure instead of hanging", async () => {
  state.connect = async () => {
    throw new Error("ECONNREFUSED");
  };
  const { pingRedis } = await import("../src/healthcheck.ts");
  await expect(pingRedis("redis://example.invalid:6379")).rejects.toThrow("ECONNREFUSED");
});

it("always disconnects, even on failure", async () => {
  const disconnect = vi.fn();
  state.disconnect = disconnect;
  state.ping = async () => {
    throw new Error("timeout");
  };
  const { pingRedis } = await import("../src/healthcheck.ts");
  await expect(pingRedis("redis://example.invalid:6379")).rejects.toThrow("timeout");
  expect(disconnect).toHaveBeenCalledOnce();
});
