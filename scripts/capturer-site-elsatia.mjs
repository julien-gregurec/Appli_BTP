#!/usr/bin/env node
// Captures des écrans ELSATIA Gestion Pro destinées au site public.
// ELSATIA-GP-SAFE-DEMO-CAPTURE-BUILD-V1
//
// Cinq vues, aux formats exacts attendus par le site :
//   1. /dashboard    desktop  2560 × 1600
//   2. /chantiers    desktop  2560 × 1600
//   3. /devis        desktop  2560 × 1600
//   4. /planning     desktop  2560 × 1600
//   5. /mes-travaux  mobile    780 × 1688
//
// Playwright headless : la capture ne contient que le document — ni barre
// d'adresse, ni onglets, ni cadre de système, ni curseur.
//
// Garde-fous, dans l'ordre :
//   * la cible doit être une origine locale (127.0.0.1 / localhost) ;
//   * le compte doit être le compte de démonstration local ;
//   * chaque page est relue avant capture : toute adresse e-mail hors
//     @example.test / @invalid.local, tout marqueur de données non fictives,
//     tout squelette de chargement ou message d'erreur interrompt le script.
//
//   node scripts/capturer-site-elsatia.mjs

import { chromium } from "playwright";
import sharp from "sharp";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASE = process.env.ELSATIA_CAPTURE_URL ?? "http://127.0.0.1:3005";
const EMAIL = process.env.ELSATIA_CAPTURE_EMAIL ?? "demo-captures@invalid.local";
const MOT_DE_PASSE = process.env.ELSATIA_CAPTURE_PASSWORD ?? "demo-captures-local";
const SORTIE = path.resolve(process.env.ELSATIA_CAPTURE_OUTPUT ?? path.join(RACINE, "captures/gp-demo"));

const HOTES_LOCAUX = new Set(["127.0.0.1", "localhost", "::1"]);
const DOMAINES_FICTIFS = new Set(["example.test", "invalid.local"]);

// Marqueurs de bases non fictives : leur simple présence interdit la capture.
const MOTIFS_INTERDITS = [
  /gregurec/i,
  /@elsatia\.fr/i,
  /@gmail\.com/i,
  /sentinelle\s*drill/i,
  /entreprise\s+test/i,
  /DEMO-18M/i,
  /multi-?app\s+[ab]\b/i,
  /liria/i,
];

// `defilement` : décalage vertical en pixels CSS avant la prise de vue. Laissé
// à 0 partout — chaque capture montre donc le haut de page, tel qu'un
// utilisateur le découvre. Renseigner cette valeur permet de cadrer sur un bloc
// plus bas (par exemple la grille du planning) sans toucher à l'application.
const VUES = [
  { cle: "dashboard",    route: "/dashboard",    profil: "desktop", defilement: 0, fichier: "gestion-pro-dashboard-desktop.webp" },
  { cle: "chantiers",    route: "/chantiers",    profil: "desktop", defilement: 0, fichier: "gestion-pro-chantiers-desktop.webp" },
  { cle: "devis",        route: "/devis",        profil: "desktop", defilement: 0, fichier: "gestion-pro-devis-desktop.webp" },
  { cle: "planning",     route: "/planning",     profil: "desktop", defilement: 0, fichier: "gestion-pro-planning-desktop.webp" },
  { cle: "mes-travaux",  route: "/mes-travaux",  profil: "mobile",  defilement: 0, fichier: "gestion-pro-mes-travaux-mobile.webp" },
];

// 1280×800 @ 2 = 2560×1600 · 390×844 @ 2 = 780×1688.
const PROFILS = {
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, budgetOctets: 400 * 1024 },
  mobile:  { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, budgetOctets: 250 * 1024 },
};

function stop(message) {
  console.error(`\nARRÊT SÛR : ${message}\n`);
  process.exit(1);
}

// ---- Garde-fou d'environnement : rien ne démarre avant cette vérification ----
let origine;
try {
  origine = new URL(BASE);
} catch {
  stop(`URL de capture illisible : ${BASE}`);
}
if (!HOTES_LOCAUX.has(origine.hostname)) {
  stop(`cible non locale (${origine.hostname}). Les captures se font exclusivement contre l'application locale — jamais app.elsatia.fr, jamais Supabase Production ou Preview.`);
}
if (!EMAIL.endsWith("@invalid.local")) {
  stop(`compte de capture inattendu (${EMAIL}). Seul le compte de démonstration local @invalid.local est autorisé.`);
}

/** Coupe animations, transitions et curseur de saisie : une capture doit être figée. */
const FIGER = `
  *, *::before, *::after {
    animation-duration: 0s !important;
    animation-delay: 0s !important;
    transition-duration: 0s !important;
    transition-delay: 0s !important;
    caret-color: transparent !important;
  }
  html { scroll-behavior: auto !important; }
`;

/** Relit la page rendue et refuse toute donnée non fictive ou tout état transitoire. */
async function controler(page, cle) {
  const texte = await page.locator("body").innerText();
  const anomalies = [];

  for (const motif of MOTIFS_INTERDITS) {
    const trouve = texte.match(motif);
    if (trouve) anomalies.push(`motif de donnée non fictive : « ${trouve[0]} »`);
  }

  for (const adresse of texte.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []) {
    const domaine = adresse.split("@")[1].toLowerCase().replace(/[.,;:)]+$/, "");
    if (!DOMAINES_FICTIFS.has(domaine)) anomalies.push(`adresse e-mail hors domaine fictif : ${adresse}`);
  }

  const enChargement = await page.evaluate(() =>
    document.querySelectorAll('[aria-busy="true"], [role="progressbar"], .animate-pulse, .animate-spin').length);
  if (enChargement > 0) anomalies.push(`${enChargement} élément(s) encore en chargement (squelette ou indicateur)`);

  const dialogues = await page.evaluate(() =>
    [...document.querySelectorAll('dialog[open], [role="dialog"], [role="alertdialog"]')]
      .filter((n) => n.checkVisibility?.() ?? true).length);
  if (dialogues > 0) anomalies.push(`${dialogues} fenêtre(s) modale(s) ouverte(s)`);

  if (/Une erreur est survenue|Application error|Impossible de charger/i.test(texte)) {
    anomalies.push("message d'erreur affiché dans la page");
  }

  if (anomalies.length) stop(`${cle} — ${anomalies.join(" ; ")}`);
  return texte.length;
}

/** Encode en WebP sRGB sous le budget de poids, en abaissant la qualité si besoin. */
async function encoder(png, destination, budgetOctets) {
  for (const qualite of [86, 80, 74, 68, 60, 52]) {
    const webp = await sharp(png).toColourspace("srgb").webp({ quality: qualite, effort: 6 }).toBuffer();
    if (webp.length <= budgetOctets || qualite === 52) {
      await writeFile(destination, webp);
      return { octets: webp.length, qualite, sousBudget: webp.length <= budgetOctets };
    }
  }
}

/** Journal des erreurs du navigateur : une exception non rattrapée interdit la capture. */
const erreursConsole = [];
function surveiller(page) {
  page.on("pageerror", (erreur) => erreursConsole.push({ type: "exception", message: String(erreur) }));
  page.on("console", (message) => {
    if (message.type() === "error") erreursConsole.push({ type: "console", message: message.text() });
  });
}

async function connecter(contexte) {
  const page = await contexte.newPage();
  surveiller(page);
  await page.addStyleTag({ content: FIGER }).catch(() => {});
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(MOT_DE_PASSE);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 }),
    page.getByRole("button", { name: "Se connecter" }).click(),
  ]);
  return page;
}

await rm(SORTIE, { recursive: true, force: true });
await mkdir(SORTIE, { recursive: true });

const navigateur = await chromium.launch({ headless: true });
const produites = [];

try {
  console.log(`Cible locale vérifiée : ${origine.origin} · compte ${EMAIL}`);

  for (const [profil, options] of Object.entries(PROFILS)) {
    const vues = VUES.filter((v) => v.profil === profil);
    if (!vues.length) continue;

    const contexte = await navigateur.newContext({
      ...options,
      locale: "fr-FR",
      timezoneId: "Europe/Paris",
      colorScheme: "light",
      reducedMotion: "reduce",
    });
    const page = await connecter(contexte);

    for (const vue of vues) {
      const reponse = await page.goto(`${BASE}${vue.route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      if (!reponse || reponse.status() >= 400) stop(`${vue.cle} — HTTP ${reponse?.status() ?? "?"} sur ${vue.route}`);
      if (new URL(page.url()).pathname.startsWith("/login")) stop(`${vue.cle} — session perdue, capture impossible`);

      await page.addStyleTag({ content: FIGER });
      await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
      await page.evaluate((y) => window.scrollTo(0, y), vue.defilement ?? 0);
      await page.locator("body").click({ position: { x: 2, y: 2 } }).catch(() => {});
      await page.waitForTimeout(600);

      await controler(page, vue.cle);
      const exceptions = erreursConsole.filter((e) => e.type === "exception");
      if (exceptions.length) stop(`${vue.cle} — exception JavaScript : ${exceptions[0].message}`);

      const png = await page.screenshot({ type: "png" });
      const metadonnees = await sharp(png).metadata();
      const attendu = {
        largeur: options.viewport.width * options.deviceScaleFactor,
        hauteur: options.viewport.height * options.deviceScaleFactor,
      };
      if (metadonnees.width !== attendu.largeur || metadonnees.height !== attendu.hauteur) {
        stop(`${vue.cle} — résolution obtenue ${metadonnees.width}×${metadonnees.height}, attendue ${attendu.largeur}×${attendu.hauteur}`);
      }

      const destination = path.join(SORTIE, vue.fichier);
      const encodage = await encoder(png, destination, options.budgetOctets);
      produites.push({ ...vue, largeur: metadonnees.width, hauteur: metadonnees.height, ...encodage });
      console.log(
        `  ✓ ${vue.fichier} — ${metadonnees.width}×${metadonnees.height}, ` +
        `${(encodage.octets / 1024).toFixed(0)} Ko (qualité ${encodage.qualite})` +
        `${encodage.sousBudget ? "" : " — AU-DESSUS DU BUDGET"}`,
      );
    }

    await contexte.close();
  }

  await writeFile(
    path.join(SORTIE, "manifeste.json"),
    JSON.stringify({ genereLe: new Date().toISOString(), source: origine.origin, compte: EMAIL, captures: produites, erreursConsole }, null, 2),
  );
  console.log(`\n${produites.length} capture(s) dans ${SORTIE}`);
  console.log(erreursConsole.length ? `${erreursConsole.length} message(s) d'erreur console — voir manifeste.json` : "Aucune erreur console.");
} finally {
  await navigateur.close();
}

if (produites.length !== VUES.length) stop(`${produites.length} capture(s) sur ${VUES.length} attendues.`);
for (const capture of produites) {
  if (!capture.sousBudget) console.warn(`⚠ ${capture.fichier} dépasse son budget de poids (${(capture.octets / 1024).toFixed(0)} Ko).`);
}
