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
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    { name: "desktop-chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "iphone-webkit", use: { ...devices["iPhone 13"] }, grep: /@responsive/ },
    { name: "android-chromium", use: { ...devices["Pixel 7"] }, grep: /@responsive/ },
    { name: "tablet-webkit", use: { ...devices["iPad (gen 7)"] }, grep: /@responsive/ },

    // Recette du pilote mobile authentifié (ELSATIA-GP-MOBILE-AUTHENTICATED-PILOT-CLOSURE-V1).
    //
    // Ces profils portent leur propre marque `@pilote` plutôt que de réutiliser
    // `@responsive` : la recette du pilote comprend des scénarios qui n'ont RIEN de
    // responsive — reprise de file hors ligne, purge au changement de compte, refus sous
    // une autre identité — et qui doivent tourner sur un moteur mobile parce que c'est là
    // que le pilote aura lieu, pas parce qu'ils éprouvent une largeur.
    // Ouvre une session par rôle et la conserve. Voir la note de tête de
    // `pilote-mobile-sessions.setup.ts` : /login n'accepte que 10 tentatives par tranche de
    // 10 minutes et par IP, ce qui interdit à chaque test de se reconnecter.
    { name: "pilote-sessions", testMatch: /pilote-mobile-sessions\.setup\.ts/ },

    { name: "pilote-android", use: { ...devices["Pixel 7"] }, grep: /@pilote/, dependencies: ["pilote-sessions"] },
    { name: "pilote-iphone", use: { ...devices["iPhone 13"] }, grep: /@pilote/, dependencies: ["pilote-sessions"] },

    // Firefox n'a pas de profil « téléphone » chez Playwright et ne sert ici qu'à un point
    // précis : `indexedDB.databases()` y est ABSENTE, ce qui rendait la purge locale
    // inopérante (réserve R4). On l'éprouve donc en fenêtre de bureau étroite.
    {
      name: "pilote-firefox",
      use: { ...devices["Desktop Firefox"], viewport: { width: 390, height: 844 } },
      grep: /@purge/,
      dependencies: ["pilote-sessions"],
    },
  ],
});
