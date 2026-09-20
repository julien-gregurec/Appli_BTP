import { describe, it, expect, vi, beforeEach } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("../src/lib/storage-admin", () => ({ storageAdmin: () => ({ rpc }) }));
import { interpretSignupPermitted, parseSignupMode } from "../src/lib/signup-gate";
import { registrationGate } from "../src/lib/entitlement";

describe("signup gate (fail-closed)", () => {
  it("absent or unknown mode is closed, never open", () => {
    expect(parseSignupMode(undefined)).toBe("closed");
    expect(parseSignupMode(null)).toBe("closed");
    expect(parseSignupMode("")).toBe("closed");
    expect(parseSignupMode("nonsense")).toBe("closed");
    expect(parseSignupMode(" CLOSED ")).toBe("closed");
    expect(parseSignupMode("Open")).toBe("open");
    expect(parseSignupMode("allowlist")).toBe("allowlist");
  });
  it("only an explicit true without error admits", () => {
    expect(interpretSignupPermitted(true, null)).toBe(true);
    expect(interpretSignupPermitted(false, null)).toBe(false);
    expect(interpretSignupPermitted(null, null)).toBe(false);
    expect(interpretSignupPermitted("true", null)).toBe(false);
    expect(interpretSignupPermitted(1, null)).toBe(false);
    expect(interpretSignupPermitted(true, { code: "42501" })).toBe(false);
  });
});

describe("registrationGate.canSignUp (same predicate as the database hook)", () => {
  beforeEach(() => {
    rpc.mockReset();
  });
  it("asks the database function with the normalized address", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await registrationGate.canSignUp("  A@B.FR ")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("studio_signup_permitted", { p_email: "a@b.fr" });
  });
  it("refuses when the database refuses", async () => {
    rpc.mockResolvedValue({ data: false, error: null });
    expect(await registrationGate.canSignUp("a@b.fr")).toBe(false);
  });
  it("refuses on an RPC error (no fail-open)", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await registrationGate.canSignUp("a@b.fr")).toBe(false);
  });
  it("refuses when the call itself throws (no fail-open)", async () => {
    rpc.mockImplementation(() => Promise.reject(new Error("network")));
    expect(await registrationGate.canSignUp("a@b.fr")).toBe(false);
  });
});
