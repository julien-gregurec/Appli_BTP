import { defineConfig } from "@playwright/test";

// Recette du banc de l'éditeur v2 (hors application, actions simulées). Un seul navigateur, un seul
// worker, aucun nouvel essai : un échec est un échec. `BANC_EDITEUR_V2` désigne le dossier construit par
// construire.mjs ; `BANC_CAPTURES` le dossier des captures.
export default defineConfig({
  testDir: ".",
  testMatch: /.*\.banc\.spec\.ts/,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: { viewport: { width: 1440, height: 900 }, locale: "fr-FR" },
  projects: [{ name: "chromium-banc" }],
});
