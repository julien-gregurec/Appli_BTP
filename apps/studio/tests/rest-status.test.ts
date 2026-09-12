import { describe, expect, it } from "vitest";
import { restErrorStatus, isTransportError } from "../src/lib/rest-status";
describe("REST classification without business retries", () => {
  it.each([401, 403, 404, 409, 429])("preserves HTTP %i", (status) => {
    expect(restErrorStatus({ code: "42501" }, status)).toBe(status);
  });
  it.each([0, 500, 502, 503, 504])(
    "classifies HTTP %i as unavailable",
    (status) => {
      expect(restErrorStatus({ code: "" }, status)).toBe(503);
    },
  );
  it.each([
    "PGRST000",
    "PGRST001",
    "PGRST002",
    "PGRST003",
    "08006",
    "53300",
    "57P01",
  ])("recognizes runtime %s", (code) => {
    expect(restErrorStatus({ code })).toBe(503);
  });
  it("keeps SQL permissions, validation and conflicts distinct", () => {
    expect(restErrorStatus({ code: "42501" })).toBe(403);
    expect(restErrorStatus({ code: "22023" })).toBe(400);
    expect(restErrorStatus({ code: "40001" })).toBe(409);
    expect(restErrorStatus({ code: "40001" }, 500)).toBe(409);
    expect(restErrorStatus({ code: "XX000" })).toBe(500);
  });
  it.each(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "UND_ERR_SOCKET"])(
    "recognizes transport %s",
    (code) => {
      expect(
        isTransportError(new TypeError("fetch failed", { cause: { code } })),
      ).toBe(true);
    },
  );
  it("does not reinterpret validation as network", () => {
    expect(isTransportError(new SyntaxError("bad json"))).toBe(false);
    expect(isTransportError(new Error("permission denied"))).toBe(false);
    expect(isTransportError(new DOMException("deadline", "TimeoutError"))).toBe(
      true,
    );
  });
});
