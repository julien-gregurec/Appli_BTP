import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  outputDir: "test-results/e2e",
  use: {
    baseURL,
    // Sans plafond explicite, une action visant un élément ABSENT attend indéfiniment et
    // consomme tout le budget du test : l'échec se présente alors comme un dépassement de
    // délai global, à des dizaines de lignes de la vraie cause. Ce plafond fait échouer
    // l'action là où elle est écrite.
    // Budgets calibrés sur une machine CHARGÉE. Le poste de recette héberge plusieurs
    // piles Supabase simultanées ; on y a mesuré des authentifications à plus de dix
    // secondes et des navigations sous service worker au-delà de trente. Des plafonds
    // trop serrés y font échouer la recette sur la contention, jamais sur une
    // régression — c'est le pire des deux mondes : du rouge qui n'apprend rien.
    actionTimeout: 30_000,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone-webkit", use: { ...devices["iPhone 13"] }, grep: /@responsive/ },
    { name: "android-chromium", use: { ...devices["Pixel 7"] }, grep: /@responsive/ },
    { name: "tablet-webkit", use: { ...devices["iPad (gen 7)"] }, grep: /@responsive/ },
  ],
});
