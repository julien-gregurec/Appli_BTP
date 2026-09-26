import { defineConfig, devices, type PlaywrightTestConfig } from "@playwright/test";

/*
 * Deux applications, deux recettes, une seule configuration.
 *
 * - Gestion Pro (défaut) : `npm run test:e2e`. Base `E2E_BASE_URL` ou 127.0.0.1:3100, serveur
 *   lancé à part, comme avant. Les specs `colors-*` en sont EXCLUES : elles visent un autre
 *   hôte et un autre jeu de données, et les y laisser les envoyait sur Gestion Pro.
 * - Colors : `npm run test:e2e:colors` (pose `E2E_APP=colors`). Base `E2E_COLORS_BASE_URL` ou
 *   127.0.0.1:3010 (le port de `apps/colors`), seules les specs `colors-*`, et deux serveurs
 *   démarrés par Playwright : la pile Supabase locale (passerelle, port 54321) puis Colors
 *   compilé (`next start`). Aucun des deux n'est démarré pour une passe Gestion Pro.
 */
const appColors = process.env.E2E_APP === "colors";
const SPECS_COLORS = /colors-[^/]*\.spec\.ts$/;

const communs: PlaywrightTestConfig["use"] = {
  // Sans plafond explicite, une action visant un élément ABSENT attend indéfiniment et
  // consomme tout le budget du test : l'échec se présente alors comme un dépassement de
  // délai global, à des dizaines de lignes de la vraie cause. Ce plafond fait échouer
  // l'action là où elle est écrite.
  actionTimeout: 15_000,
  navigationTimeout: 30_000,
  trace: "retain-on-failure",
  screenshot: "only-on-failure",
  video: "off",
};

const baseGestionPro = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100";
// `localhost` et non 127.0.0.1 : Colors n'enregistre son service worker que sur https ou sur
// l'hôte nommé `localhost` (ServiceWorkerRegister.tsx). Les parcours hors ligne en dépendent.
const baseColors = process.env.E2E_COLORS_BASE_URL ?? "http://localhost:3010";
const urlPileColors = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321";

const projetsGestionPro: PlaywrightTestConfig["projects"] = [
  { name: "desktop-chromium", testIgnore: SPECS_COLORS, use: { ...devices["Desktop Chrome"] } },
  { name: "iphone-webkit", testIgnore: SPECS_COLORS, use: { ...devices["iPhone 13"] }, grep: /@responsive/ },
  { name: "android-chromium", testIgnore: SPECS_COLORS, use: { ...devices["Pixel 7"] }, grep: /@responsive/ },
  { name: "tablet-webkit", testIgnore: SPECS_COLORS, use: { ...devices["iPad (gen 7)"] }, grep: /@responsive/ },
];

/*
 * Chromium imposé, facultatif : un poste dont le navigateur préinstallé ne correspond pas à la
 * version de Playwright (conteneur de recette sans téléchargement) le désigne ici au lieu de
 * lancer `playwright install`. Sans la variable, rien ne change.
 */
const chromiumImpose = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const lancement = chromiumImpose ? { launchOptions: { executablePath: chromiumImpose } } : {};

const projetsColors: PlaywrightTestConfig["projects"] = [
  { name: "colors", testMatch: SPECS_COLORS, use: { ...devices["Desktop Chrome"], ...lancement, baseURL: baseColors } },
  { name: "colors-mobile", testMatch: SPECS_COLORS, grep: /@responsive/, use: { ...devices["Pixel 7"], ...lancement, baseURL: baseColors } },
];

/*
 * Serveurs de la recette Colors. `reuseExistingServer` hors CI : une pile déjà lancée à la
 * main est réutilisée telle quelle. Les secrets (clés, mots de passe) ne sont jamais écrits
 * ici : ils viennent de l'environnement, et la passerelle refuse de démarrer sans eux.
 */
const serveursColors: PlaywrightTestConfig["webServer"] = [
  {
    command: "node tests/e2e/colors-pile-locale/passerelle.mjs",
    url: `${urlPileColors}/__recette/sante`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: "pipe",
  },
  {
    command: "npm --prefix apps/colors run start",
    url: `${baseColors}/login`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "pipe",
  },
];

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["html", { outputFolder: appColors ? "playwright-report-colors" : "playwright-report", open: "never" }]],
  outputDir: appColors ? "test-results/e2e-colors" : "test-results/e2e",
  use: { ...communs, baseURL: appColors ? baseColors : baseGestionPro },
  projects: appColors ? projetsColors : projetsGestionPro,
  ...(appColors ? { webServer: serveursColors } : {}),
});
