import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

/*
 * Recette Playwright DISTANTE (Preview Vercel) — lancée par `npm run preview:qualification`
 * (étapes e2e.gp / e2e.tools / e2e.colors / e2e.reserves), jamais par `npm run test:e2e`.
 *
 * - Une application par exécution : `--project <app>` et E2E_REMOTE_BASE_URL = son origine Preview.
 * - Aucun serveur local, aucune pile Supabase locale : tout vise la Preview confirmée par
 *   scripts/preview/qualification (protection Production déjà passée avant ce lancement).
 * - Traces et vidéos DÉSACTIVÉES : une trace réseau contiendrait les jetons de session des comptes
 *   de recette. Seules des captures d'écran en échec sont conservées (test-results/e2e-remote).
 * - Deployment Protection Vercel : secret « Protection Bypass for Automation » dans
 *   VERCEL_AUTOMATION_BYPASS_SECRET (en-têtes, jamais affiché).
 */
const base = process.env.E2E_REMOTE_BASE_URL;
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const chromiumImpose = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

const use: PlaywrightTestConfig["use"] = {
  baseURL: base,
  actionTimeout: 20_000,
  navigationTimeout: 45_000,
  trace: "off",
  video: "off",
  screenshot: "only-on-failure",
  extraHTTPHeaders: bypass ? { "x-vercel-protection-bypass": bypass, "x-vercel-set-bypass-cookie": "true" } : undefined,
  ...(chromiumImpose ? { launchOptions: { executablePath: chromiumImpose } } : {}),
};

export default defineConfig({
  testDir: "./tests/e2e-remote",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  outputDir: "test-results/e2e-remote",
  reporter: [["list"]],
  projects: [
    { name: "gp", testMatch: /gp\.remote\.spec\.ts$/, use: { ...devices["Desktop Chrome"], ...use } },
    { name: "tools", testMatch: /tools\.remote\.spec\.ts$/, use: { ...devices["Desktop Chrome"], ...use } },
    { name: "colors", testMatch: /colors\.remote\.spec\.ts$/, use: { ...devices["Desktop Chrome"], ...use } },
    { name: "reserves", testMatch: /reserves\.remote\.spec\.ts$/, use: { ...devices["Pixel 7"], ...use } },
  ],
});
