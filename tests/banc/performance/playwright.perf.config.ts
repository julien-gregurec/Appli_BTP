import { defineConfig } from "@playwright/test";

// Mesure de fluidité (GP V1, lot H) sur les bancs construits (vrais composants, données fictives).
// Un seul navigateur, un seul worker, aucun nouvel essai. `BANC_EDITEUR_V2` et `BANC_PLANNING_V2`
// désignent les dossiers construits par les scripts construire.mjs ; `BANC_CAPTURES` reçoit le relevé.
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.banc\.spec\.ts/,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: { viewport: { width: 1440, height: 900 }, locale: "fr-FR" },
  projects: [{ name: "chromium-perf" }],
});
