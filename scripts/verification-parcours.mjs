/**
 * Vérification automatisée de Liria Gestion Pro.
 *
 * Deux modes :
 *   - LECTURE (défaut)   : parcourt toutes les pages, signale erreurs console,
 *                          erreurs de page et réponses serveur 500. Aucune écriture,
 *                          donc sans risque même en production.
 *   - ÉCRITURE (--ecriture) : en plus, crée un client puis un chantier de test et
 *                          vérifie qu'ils apparaissent bien. Les données créées sont
 *                          préfixées « [TEST AUTO] » pour être repérables et supprimables.
 *
 * Prérequis (Playwright n'est volontairement PAS dans package.json pour ne pas
 * alourdir les déploiements Vercel) :
 *   npm install --no-save playwright && npx playwright install chromium
 *
 * Utilisation :
 *   LIRIA_AUDIT_URL=https://mon-app.vercel.app \
 *   LIRIA_AUDIT_EMAIL=... LIRIA_AUDIT_PASSWORD=... \
 *   node scripts/verification-parcours.mjs [--ecriture]
 *
 * Sort en code 1 si un problème est détecté (utilisable en automatisation).
 */
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const baseUrl = process.env.LIRIA_AUDIT_URL ?? "http://127.0.0.1:3000";
const email = process.env.LIRIA_AUDIT_EMAIL;
const password = process.env.LIRIA_AUDIT_PASSWORD;
const avecEcriture = process.argv.includes("--ecriture");
const outputDir = path.resolve(process.env.LIRIA_AUDIT_OUTPUT ?? "output/verification");

if (!email || !password) {
  throw new Error("LIRIA_AUDIT_EMAIL et LIRIA_AUDIT_PASSWORD sont obligatoires.");
}

const ROUTES = [
  "/dashboard", "/clients", "/chantiers", "/devis", "/factures", "/prestations",
  "/commandes", "/fournisseurs", "/depenses", "/charges", "/notes-frais",
  "/conges", "/planning", "/employes", "/pointage", "/rentabilite", "/tresorerie",
  "/stock", "/stock/borne", "/stock/reception", "/flotte", "/outillage",
  "/inventaires", "/exports", "/parametres", "/parametres/donnees", "/aide",
];

const incidents = [];
const parcours = [];
const marqueur = `[TEST AUTO] ${new Date().toISOString().slice(0, 16)}`;

function noter(nom, ok, detail = null) {
  parcours.push({ nom, statut: ok ? "ok" : "echec", detail });
  console.log(`${ok ? "✓" : "✗"} ${nom}${detail ? ` — ${detail}` : ""}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  locale: "fr-FR",
  timezoneId: "Europe/Paris",
});
const page = await context.newPage();

page.on("pageerror", (e) => incidents.push({ type: "erreur_page", message: e.message, url: page.url() }));
page.on("console", (m) => {
  if (m.type() === "error") incidents.push({ type: "console", message: m.text(), url: page.url() });
});
page.on("response", (r) => {
  if (r.status() >= 500) incidents.push({ type: "serveur", message: `HTTP ${r.status()}`, url: r.url() });
});

try {
  // ── Connexion ────────────────────────────────────────────────
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 45_000 });
  if (new URL(page.url()).pathname === "/login") {
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await Promise.all([
      page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 }),
      page.getByRole("button", { name: "Se connecter" }).click(),
    ]);
  }
  noter("Connexion", !new URL(page.url()).pathname.startsWith("/login"), page.url());

  // ── Parcours LECTURE : toutes les pages répondent ────────────
  for (const route of ROUTES) {
    let ok = false;
    let detail = null;
    try {
      const rep = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
      const statut = rep?.status() ?? 0;
      const texte = await page.locator("body").innerText();
      const planté = /Application error|Une erreur est survenue|Internal Server Error/i.test(texte);
      ok = statut < 400 && !planté;
      detail = planté ? "page en erreur" : `HTTP ${statut}`;
    } catch (e) {
      detail = e.message.slice(0, 120);
    }
    noter(`Page ${route}`, ok, ok ? null : detail);
  }

  // ── Parcours ÉCRITURE (optionnel) ────────────────────────────
  if (avecEcriture) {
    const nomClient = `${marqueur} Client`;

    // Création d'un client
    let clientOk = false;
    let clientDetail = "introuvable après création";
    try {
      await page.goto(`${baseUrl}/clients/nouveau`, { waitUntil: "networkidle", timeout: 45_000 });
      await page.locator('input[name="nom"]').fill(nomClient);
      const societe = page.locator('input[name="societe"]');
      if (await societe.count()) await societe.fill(`${marqueur} SARL`);
      const delai = page.locator('input[name="delai_paiement_jours"]');
      if (await delai.count()) await delai.fill("30");
      await page.locator('form button[type="submit"]').first().click();
      await page.waitForLoadState("networkidle", { timeout: 45_000 });
      await page.goto(`${baseUrl}/clients`, { waitUntil: "networkidle" });
      clientOk = (await page.locator("body").innerText()).includes(nomClient);
      if (clientOk) clientDetail = "visible dans la liste";
    } catch (e) {
      clientDetail = e.message.slice(0, 120);
    }
    noter("Création client", clientOk, clientDetail);

    // Création d'un chantier rattaché à ce client
    let chantierOk = false;
    let chantierDetail = "introuvable après création";
    const nomChantier = `${marqueur} Chantier`;
    try {
      await page.goto(`${baseUrl}/chantiers/nouveau`, { waitUntil: "networkidle", timeout: 45_000 });
      await page.locator('input[name="nom"]').fill(nomChantier);
      const select = page.locator('select[name="client_id"]');
      if (await select.count()) {
        const options = await select.locator("option").allTextContents();
        const cible = options.find((o) => o.includes(nomClient)) ?? options.find((o) => o.trim());
        if (cible) await select.selectOption({ label: cible });
      }
      await page.locator('form button[type="submit"]').first().click();
      await page.waitForLoadState("networkidle", { timeout: 45_000 });
      await page.goto(`${baseUrl}/chantiers`, { waitUntil: "networkidle" });
      chantierOk = (await page.locator("body").innerText()).includes(nomChantier);
      if (chantierOk) chantierDetail = "visible dans la liste";
    } catch (e) {
      chantierDetail = e.message.slice(0, 120);
    }
    noter("Création chantier", chantierOk, chantierDetail);
  }
} finally {
  await context.close();
  await browser.close();
}

// ── Rapport ────────────────────────────────────────────────────
await mkdir(outputDir, { recursive: true });
const echecs = parcours.filter((p) => p.statut !== "ok");
const rapport = {
  genereAt: new Date().toISOString(),
  baseUrl,
  mode: avecEcriture ? "lecture+ecriture" : "lecture",
  synthese: {
    parcours: parcours.length,
    succes: parcours.length - echecs.length,
    echecs: echecs.length,
    incidents: incidents.length,
  },
  parcours,
  incidents,
};
await writeFile(path.join(outputDir, "rapport.json"), JSON.stringify(rapport, null, 2));

console.log("\n──────── SYNTHÈSE ────────");
console.log(`Parcours : ${rapport.synthese.succes}/${rapport.synthese.parcours} réussis`);
console.log(`Incidents détectés : ${rapport.synthese.incidents}`);
if (echecs.length) console.log("Échecs :", echecs.map((e) => e.nom).join(", "));
if (avecEcriture) console.log(`\nDonnées de test créées, repérables par « ${marqueur} » — à supprimer.`);
console.log(`Rapport complet : ${path.join(outputDir, "rapport.json")}`);

if (echecs.length > 0 || incidents.length > 0) process.exitCode = 1;
