import { describe, it, expect } from "vitest";
import {
  isAllowlisted,
  parseSignupMode,
  signupDecision,
} from "../src/lib/signup-gate";

describe("signup gate", () => {
  it("parses the mode and falls back to open only for unknown/absent values", () => {
    expect(parseSignupMode(undefined)).toBe("open");
    expect(parseSignupMode(" CLOSED ")).toBe("closed");
    expect(parseSignupMode("allowlist")).toBe("allowlist");
    expect(parseSignupMode("nonsense")).toBe("open");
  });
  it("matches full addresses and @domain entries, case-insensitively", () => {
    const list = "Alice@Example.com, @elsatia.fr ,";
    expect(isAllowlisted("alice@example.com", list)).toBe(true);
    expect(isAllowlisted("bob@ELSATIA.FR", list)).toBe(true);
    expect(isAllowlisted("bob@example.com", list)).toBe(false);
    expect(isAllowlisted("x@evil-elsatia.fr", list)).toBe(false);
    expect(isAllowlisted("x@sub.elsatia.fr", list)).toBe(false);
    expect(isAllowlisted("alice@example.com", undefined)).toBe(false);
    expect(isAllowlisted("alice@example.com", "")).toBe(false);
  });
  it("closed refuses everyone except invited addresses", () => {
    expect(signupDecision("closed", "a@b.fr", "@b.fr", false)).toBe(false);
    expect(signupDecision("closed", "a@b.fr", "@b.fr", true)).toBe(true);
  });
  it("allowlist admits listed addresses and invited ones", () => {
    expect(signupDecision("allowlist", "a@b.fr", "@b.fr", false)).toBe(true);
    expect(signupDecision("allowlist", "a@c.fr", "@b.fr", false)).toBe(false);
    expect(signupDecision("allowlist", "a@c.fr", "@b.fr", true)).toBe(true);
  });
  it("open admits everyone", () => {
    expect(signupDecision("open", "a@c.fr", undefined, false)).toBe(true);
  });
});
