import { expect, it } from "vitest";
import { renderTimeoutSeconds } from "../src/timeouts.ts";

it("keeps the configured floor for short videos", () => {
  expect(renderTimeoutSeconds(undefined, 60_000)).toBe(600);
  expect(renderTimeoutSeconds("900", 60_000)).toBe(900);
});
it("scales with the video length so a 10 minute timeline can finish", () => {
  // Measured ratio is ~2x the duration at 1080p; the budget is 3x + 60 s.
  expect(renderTimeoutSeconds(undefined, 600_000)).toBe(1860);
  expect(renderTimeoutSeconds(undefined, 300_000)).toBe(960);
});
it("clamps hostile or invalid input", () => {
  expect(renderTimeoutSeconds("not-a-number", 0)).toBe(600);
  // The +60 s margin still applies to an empty timeline.
  expect(renderTimeoutSeconds("1", 0)).toBe(60);
  expect(renderTimeoutSeconds("1", 5_000)).toBe(75);
  expect(renderTimeoutSeconds("999999", 0)).toBe(3600);
  expect(renderTimeoutSeconds(undefined, Number.MAX_SAFE_INTEGER)).toBe(7200);
  expect(renderTimeoutSeconds(undefined, -5)).toBe(600);
});
