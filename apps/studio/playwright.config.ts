import { defineConfig } from "@playwright/test";
import { readFileSync } from "node:fs";
// Local-only credentials; never load the root application environment.
for (const line of readFileSync(
  new URL(".env.local", import.meta.url),
  "utf8",
).split("\n")) {
  const match = /^([A-Z_]+)=(.*)$/.exec(line);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
}
const baseURL = process.env.NEXT_PUBLIC_STUDIO_URL ?? "http://127.0.0.1:3030";
for (const value of [baseURL, process.env.NEXT_PUBLIC_SUPABASE_URL]) {
  if (!value || new URL(value).hostname !== "127.0.0.1")
    throw new Error("Studio E2E requires an isolated loopback environment.");
}
export default defineConfig({
  testDir: "tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  retries: 0,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: {
    baseURL,
    channel: process.env.STUDIO_E2E_CHANNEL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  reporter: [["list"]],
  webServer: {
    command: "npm run start",
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
