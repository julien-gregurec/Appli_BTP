import { expect, it } from "vitest";
import { mayDiscardUpload } from "../src/cleanup.ts";

it.each(["completed", "uploading", "queued"])(
  "retains %s uploads after an ambiguous completion",
  (status) => {
    expect(
      mayDiscardUpload({ status, lease_token: "lease" }, null, "lease"),
    ).toBe(false);
  },
);
it("retains uploads when DB is unavailable or ownership differs", () => {
  expect(mayDiscardUpload(null, Error("network"), "lease")).toBe(false);
  expect(
    mayDiscardUpload({ status: "failed", lease_token: "other" }, null, "lease"),
  ).toBe(false);
});
it.each(["failed", "cancelled"])(
  "discards only a definitively %s matching attempt",
  (status) => {
    expect(
      mayDiscardUpload({ status, lease_token: "lease" }, null, "lease"),
    ).toBe(true);
  },
);
