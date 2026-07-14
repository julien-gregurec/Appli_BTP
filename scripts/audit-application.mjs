import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const baseUrl = process.env.LIRIA_AUDIT_URL ?? "http://127.0.0.1:3000";
const email = process.env.LIRIA_AUDIT_EMAIL;
const password = process.env.LIRIA_AUDIT_PASSWORD;
const outputDir = path.resolve(process.env.LIRIA_AUDIT_OUTPUT ?? "output/audit");

if (!email || !password) {
  throw new Error("LIRIA_AUDIT_EMAIL et LIRIA_AUDIT_PASSWORD sont obligatoires.");
}

const routes = [
  "/dashboard", "/mon-espace", "/mes-travaux", "/clients", "/chantiers",
  "/devis", "/devis/nouveau", "/prestations", "/factures", "/commandes",
  "/fournisseurs", "/depenses", "/charges", "/notes-frais", "/conges",
  "/planning", "/employes", "/pointage", "/rentabilite", "/tresorerie",
  "/stock", "/stock/borne", "/flotte", "/outillage", "/depot",
  "/inventaires", "/exports", "/parametres", "/parametres/acces", "/aide",
];
const routesMobile = [
  "/dashboard", "/mon-espace", "/mes-travaux", "/planning", "/pointage",
  "/chantiers", "/devis/nouveau", "/notes-frais", "/stock/borne",
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const incidents = [];
const resultats = [];

async function connecter(context, nom) {
  const page = await context.newPage();
  page.on("pageerror", (error) => incidents.push({ profil: nom, type: "pageerror", message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") incidents.push({ profil: nom, type: "console", message: message.text() });
  });
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 45_000 });
  if (new URL(page.url()).pathname === "/login") {
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 }),
      page.getByRole("button", { name: "Se connecter" }).click(),
    ]);
  }
  if (new URL(page.url()).pathname !== "/dashboard") {
    throw new Error(`Connexion impossible, redirection vers ${page.url()}`);
  }
  return page;
}

async function controlerRoute(page, route, profil, capture = false) {
  const debut = Date.now();
  const reponsesServeur = [];
  const listener = (response) => {
    if (response.status() >= 500) reponsesServeur.push({ status: response.status(), url: response.url() });
  };
  page.on("response", listener);
  let statut = "ok";
  let erreur = null;
  try {
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
    const texte = await page.locator("body").innerText();
    const titre = await page.locator("h1").first().textContent().catch(() => null);
    const cheminFinal = new URL(page.url()).pathname;
    if (!response || response.status() >= 400) throw new Error(`HTTP ${response?.status() ?? "sans réponse"}`);
    if (/Internal Server Error|Application error|This page could not be found/i.test(texte)) throw new Error("Page d’erreur détectée");
    if (reponsesServeur.length) throw new Error(`Réponse serveur ${reponsesServeur[0].status}`);
    const encodage = texte.match(/(?:Ã.|Â.|√.|�)/g)?.slice(0, 5) ?? [];
    resultats.push({ profil, route, cheminFinal, titre: titre?.trim() ?? null, statut, dureeMs: Date.now() - debut, encodage });
    if (encodage.length) incidents.push({ profil, route, type: "encodage", message: encodage.join(" ") });
    if (capture) {
      const nomFichier = `${profil}-${route.replaceAll("/", "-").replace(/^-+/, "") || "accueil"}.png`;
      await page.screenshot({ path: path.join(outputDir, nomFichier), fullPage: true });
    }
  } catch (cause) {
    statut = "erreur";
    erreur = cause instanceof Error ? cause.message : String(cause);
    resultats.push({ profil, route, statut, erreur, dureeMs: Date.now() - debut });
    incidents.push({ profil, route, type: "navigation", message: erreur });
  } finally {
    page.off("response", listener);
  }
}

try {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    permissions: ["geolocation"],
    geolocation: { latitude: 48.8566, longitude: 2.3522, accuracy: 12 },
    recordVideo: { dir: path.join(outputDir, "captures-video"), size: { width: 1440, height: 1000 } },
  });
  const pageDesktop = await connecter(desktop, "desktop");
  for (const route of routes) await controlerRoute(pageDesktop, route, "desktop", ["/dashboard", "/mon-espace", "/mes-travaux", "/planning", "/pointage"].includes(route));
  await pageDesktop.close();
  await desktop.close();

  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    permissions: ["geolocation"],
    geolocation: { latitude: 48.8566, longitude: 2.3522, accuracy: 12 },
  });
  const pageMobile = await connecter(mobile, "mobile");
  for (const route of routesMobile) await controlerRoute(pageMobile, route, "mobile", true);
  await pageMobile.close();
  await mobile.close();
} finally {
  await browser.close();
}

const rapport = {
  genereAt: new Date().toISOString(),
  baseUrl,
  synthese: {
    routesControlees: resultats.length,
    succes: resultats.filter((item) => item.statut === "ok").length,
    echecs: resultats.filter((item) => item.statut !== "ok").length,
    incidents: incidents.length,
  },
  resultats,
  incidents,
};
await writeFile(path.join(outputDir, "rapport.json"), JSON.stringify(rapport, null, 2));
console.log(JSON.stringify(rapport.synthese));
if (rapport.synthese.echecs > 0) process.exitCode = 1;
