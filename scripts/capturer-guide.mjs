// Capture les vraies pages de Liria Gestion Pro pour illustrer le manuel utilisateur.
// Se connecte réellement, découvre les identifiants existants, puis photographie
// listes, formulaires, fiches détail et documents imprimés, en desktop et en mobile.
//
// Identifiants fournis par l'environnement (jamais écrits dans le dépôt) :
//   LIRIA_AUDIT_URL, LIRIA_AUDIT_EMAIL, LIRIA_AUDIT_PASSWORD
// Sortie : output/audit/*.png + output/audit/manifeste.json

import { chromium } from "playwright";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";

const baseUrl = process.env.LIRIA_AUDIT_URL ?? "http://127.0.0.1:3000";
const email = process.env.LIRIA_AUDIT_EMAIL;
const password = process.env.LIRIA_AUDIT_PASSWORD;
const outputDir = path.resolve(process.env.LIRIA_AUDIT_OUTPUT ?? "output/audit");

if (!email || !password) throw new Error("LIRIA_AUDIT_EMAIL et LIRIA_AUDIT_PASSWORD sont obligatoires.");

// Listes et formulaires à photographier. `detail` = motif des fiches à découvrir depuis la liste.
const SECTIONS = [
  { cle: "dashboard", route: "/dashboard", mobile: true },
  { cle: "mon-espace", route: "/mon-espace", mobile: true },
  { cle: "mes-travaux", route: "/mes-travaux", mobile: true },
  { cle: "clients", route: "/clients", mobile: true, detail: /^\/clients\/[0-9a-f-]{36}$/ },
  { cle: "clients-nouveau", route: "/clients/nouveau" },
  { cle: "chantiers", route: "/chantiers", mobile: true, detail: /^\/chantiers\/[0-9a-f-]{36}$/ },
  { cle: "chantiers-nouveau", route: "/chantiers/nouveau" },
  { cle: "devis", route: "/devis", mobile: true, detail: /^\/devis\/[0-9a-f-]{36}$/ },
  { cle: "devis-nouveau", route: "/devis/nouveau", mobile: true },
  { cle: "prestations", route: "/prestations" },
  { cle: "factures", route: "/factures", mobile: true, detail: /^\/factures\/[0-9a-f-]{36}$/ },
  { cle: "commandes", route: "/commandes", detail: /^\/commandes\/[0-9a-f-]{36}$/ },
  { cle: "fournisseurs", route: "/fournisseurs" },
  { cle: "connecteurs", route: "/connecteurs" },
  { cle: "depenses", route: "/depenses" },
  { cle: "charges", route: "/charges" },
  { cle: "notes-frais", route: "/notes-frais", mobile: true },
  { cle: "notes-frais-exports", route: "/notes-frais/exports" },
  { cle: "conges", route: "/conges", mobile: true },
  { cle: "planning", route: "/planning", mobile: true },
  { cle: "employes", route: "/employes", mobile: true, detail: /^\/employes\/[0-9a-f-]{36}$/ },
  { cle: "pointage", route: "/pointage", mobile: true },
  { cle: "rentabilite", route: "/rentabilite" },
  { cle: "tresorerie", route: "/tresorerie" },
  { cle: "stock", route: "/stock", mobile: true, detail: /^\/stock\/[0-9a-f-]{36}$/ },
  { cle: "stock-borne", route: "/stock/borne", mobile: true },
  { cle: "flotte", route: "/flotte", mobile: true },
  { cle: "outillage", route: "/outillage", mobile: true, detail: /^\/outillage\/[0-9a-f-]{36}$/ },
  { cle: "depot", route: "/depot" },
  { cle: "inventaires", route: "/inventaires" },
  { cle: "exports", route: "/exports" },
  { cle: "parametres", route: "/parametres" },
  { cle: "parametres-acces", route: "/parametres/acces" },
  { cle: "parametres-import", route: "/parametres/import" },
  { cle: "parametres-notes-frais", route: "/parametres/notes-frais" },
  { cle: "aide", route: "/aide", mobile: true },
  // /plateforme n'est volontairement pas capturé : le compte de démo n'y a aucun
  // droit (404 attendu). Ces écrans relèvent de l'éditeur, pas du manuel client.
];

// Documents imprimés : construits à partir des identifiants découverts.
const IMPRESSIONS = [
  { cle: "impression-devis", base: "/imprimer/devis", source: "devis" },
  { cle: "impression-facture", base: "/imprimer/factures", source: "factures" },
  { cle: "impression-commande", base: "/imprimer/commandes", source: "commandes" },
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const captures = [];
const echecs = [];
const identifiants = {}; // cle de section -> [uuid…]

async function connecter(context) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/login`, { waitUntil: "networkidle", timeout: 60_000 });
  if (new URL(page.url()).pathname === "/login") {
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(password);
    await Promise.all([
      page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 }),
      page.getByRole("button", { name: "Se connecter" }).click(),
    ]);
  }
  return page;
}

async function capturer(page, profil, cle, route) {
  const nom = `${profil}-${cle}.png`;
  try {
    // `domcontentloaded` d'abord : certaines pages (exports, planning) gardent des
    // requêtes ouvertes et n'atteignent jamais `networkidle`.
    const reponse = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (!reponse || reponse.status() >= 400) throw new Error(`HTTP ${reponse?.status() ?? "?"}`);
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    const chemin = new URL(page.url()).pathname;
    if (chemin.startsWith("/login")) throw new Error("session perdue");
    // Laisse les graphiques et images finir de s'afficher.
    await page.waitForTimeout(700);
    const titre = await page.locator("h1").first().textContent().catch(() => null);
    await page.screenshot({ path: path.join(outputDir, nom), fullPage: true });
    captures.push({ profil, cle, route, fichier: nom, titre: titre?.trim() ?? null });
    console.log(`  ✓ ${nom}`);
    return true;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    echecs.push({ profil, cle, route, message });
    console.log(`  ✗ ${nom} — ${message}`);
    return false;
  }
}

// Récupère les identifiants des fiches depuis une page de liste.
async function decouvrirIds(page, motif) {
  const hrefs = await page.locator("a[href]").evaluateAll((liens) => liens.map((a) => a.getAttribute("href")));
  const ids = [];
  for (const href of hrefs) {
    if (!href) continue;
    const chemin = href.split("?")[0];
    if (motif.test(chemin)) {
      const id = chemin.split("/").pop();
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

try {
  const desktop = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    locale: "fr-FR", timezoneId: "Europe/Paris",
    permissions: ["geolocation"],
    geolocation: { latitude: 45.764043, longitude: 4.835659 }, // Lyon
  });
  const page = await connecter(desktop);
  console.log("Connexion OK — captures desktop :");

  for (const section of SECTIONS) {
    const ok = await capturer(page, "desktop", section.cle, section.route);
    if (ok && section.detail) {
      const ids = await decouvrirIds(page, section.detail);
      identifiants[section.cle] = ids;
      if (ids[0]) await capturer(page, "desktop", `${section.cle}-fiche`, `${section.route}/${ids[0]}`);
    }
  }

  // Documents imprimés (les « screens de l'impression »).
  console.log("Captures des documents imprimés :");
  for (const impression of IMPRESSIONS) {
    const id = identifiants[impression.source]?.[0];
    if (!id) { echecs.push({ cle: impression.cle, message: "aucun identifiant trouvé" }); continue; }
    await capturer(page, "desktop", impression.cle, `${impression.base}/${id}`);
  }
  await page.close();

  // Mobile.
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    locale: "fr-FR", timezoneId: "Europe/Paris",
    permissions: ["geolocation"],
    geolocation: { latitude: 45.764043, longitude: 4.835659 },
  });
  const pageMobile = await connecter(mobile);
  console.log("Captures mobile :");
  for (const section of SECTIONS.filter((s) => s.mobile)) {
    await capturer(pageMobile, "mobile", section.cle, section.route);
  }
  await pageMobile.close();

  await writeFile(path.join(outputDir, "manifeste.json"), JSON.stringify({ genereLe: new Date().toISOString(), captures, echecs }, null, 2));
  console.log(`\n${captures.length} capture(s) — ${echecs.length} échec(s). Manifeste : ${outputDir}/manifeste.json`);
} finally {
  await browser.close();
}
