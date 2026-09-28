import { defineConfig } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

// Suite Playwright DÉDIÉE Studio : tourne contre le banc apps/studio/e2e-dedicated/stack.sh
// (projet Supabase dédié + identité centrale sans base GP). Séparée des specs historiques
// (apps/studio/tests/*.spec.ts, train partagé) : autre testDir, autre configuration, aucun
// globalSetup du train partagé.
const envFile = `${process.env.E2E_DIR ?? "/var/tmp/elsatia-studio-e2e"}/env.sh`;
if (existsSync(envFile))
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = /^export ([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^'(.*)'$/, "$1");
  }
const baseURL = process.env.NEXT_PUBLIC_STUDIO_URL ?? "http://127.0.0.1:3030";
for (const value of [baseURL, process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.ELSATIA_CENTRAL_URL])
  if (!value || new URL(value).hostname !== "127.0.0.1")
    throw new Error("Banc Studio dédié absent : lancez apps/studio/e2e-dedicated/stack.sh start (loopback uniquement).");

const chromium = process.env.E2E_CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

export default defineConfig({
  testDir: "specs",
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: chromium ? { executablePath: chromium } : undefined,
  },
  outputDir: "test-results",
  reporter: process.env.E2E_RESULT
    ? [["list"], ["json", { outputFile: process.env.E2E_RESULT }]]
    : [["list"]],
});
