/*
 * Captures de fiche Store d'ELSATIA Tools.
 *
 * Ce que le script photographie : l'export statique REEL du canon — `apps/tools/out`, celui-la
 * meme que `cap sync` embarque dans les paquets iOS et Android. Aucune maquette, aucun montage,
 * aucune retouche, aucune donnee utilisateur. Le script pilote l'application comme un
 * utilisateur — il cree reellement un trace, le moteur calcule reellement la geometrie — et ne
 * photographie que ce qu'elle affiche.
 *
 * Pourquoi un navigateur pilote plutot que le simulateur iOS : `xcrun simctl` sait installer,
 * lancer et photographier, mais n'expose aucune primitive de saisie tactile ; piloter
 * Simulator.app par AppleScript demande l'autorisation d'accessibilite de macOS, qui n'est pas
 * accordee sur ce poste. Playwright rend le meme export statique dans WebKit — le moteur de la
 * WebView iOS — et permet, lui, de naviguer. Le rendu natif est verifie separement : le paquet
 * est installe et photographie sur simulateur (voir TOOLS_STORE_DISTRIBUTION_READINESS_V1.md).
 *
 * Dimensions : obtenues par `deviceScaleFactor`, JAMAIS par redimensionnement d'image. La mise
 * en page reste celle d'un telephone (ou d'une tablette) et les pixels sont exactement ceux
 * qu'exigent les consoles :
 *   - App Store iPhone 6,9 pouces : 440 x 956 @3   = 1320 x 2868
 *   - App Store iPad 13 pouces    : 1032 x 1376 @2 = 2064 x 2752
 *   - Google Play telephone       : 360 x 640 @3   = 1080 x 1920 (ratio 9:16)
 *
 * Prerequis : servir `apps/tools/out` en HTTP, puis
 *   node scripts/capture-store-screenshots.mjs <dossier-de-sortie> [url-de-base]
 *
 * Les PNG produits ne sont pas versionnes : ce sont des artefacts lourds, ranges sur le volume
 * externe. Ce script, lui, est versionne — c'est lui qui rend la serie reproductible.
 */
import { appendFileSync, mkdirSync } from "node:fs";
import { chromium, webkit } from "playwright-core";

const OUT = process.argv[2];
const BASE = process.argv[3] ?? "http://127.0.0.1:4173";
const LOG = `${OUT}/capture.log`;
const log = (m) => { appendFileSync(LOG, m + "\n"); };
setTimeout(() => { log("TIMEOUT GLOBAL"); process.exit(3); }, 560000);

/* Les trois series exigees par les consoles. Le facteur d'echelle fait la dimension finale. */
const SERIES = [
  { id: "apple-iphone-6.9", engine: "webkit", w: 440, h: 956, dsf: 3, mobile: true },   // 1320 x 2868
  { id: "apple-ipad-13", engine: "webkit", w: 1032, h: 1376, dsf: 2, mobile: false },   // 2064 x 2752
  { id: "google-phone", engine: "chromium", w: 360, h: 640, dsf: 3, mobile: true },     // 1080 x 1920
];

async function scrollTo(p, selector) {
  const el = p.locator(selector).first();
  if (await el.count()) { await el.scrollIntoViewIfNeeded().catch(() => {}); await p.waitForTimeout(700); }
}

async function createTrace(p) {
  await p.goto(`${BASE}/atelier/nouveau/?modele=rosette-6`, { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1400);
  await p.getByRole("button", { name: "Plafond", exact: true }).click(); await p.waitForTimeout(1000);
  /* Nom neutre et dimensions rondes : aucune donnee reelle, aucun nom de client. */
  await p.getByLabel(/Nom du tracé/i).fill("Plafond — rosace 6");
  await p.getByLabel(/Largeur de la pièce/i).fill("5");
  await p.getByLabel(/Hauteur ou longueur/i).fill("4");
  await p.getByRole("button", { name: "Continuer" }).first().click(); await p.waitForTimeout(1500);
  await p.getByRole("button", { name: "Continuer" }).first().click(); await p.waitForTimeout(1500);
  await p.getByRole("button", { name: "Non", exact: true }).click(); await p.waitForTimeout(1800);
  await p.getByRole("button", { name: /Retour à l’Atelier/ }).click(); await p.waitForTimeout(2000);
  const href = await p.getByRole("link", { name: /Ouvrir l’atelier/ }).first().getAttribute("href");
  return new URL(href, BASE).searchParams.get("projectId");
}

async function runSeries(spec) {
  const dir = `${OUT}/${spec.id}`;
  mkdirSync(dir, { recursive: true });
  const browser = await (spec.engine === "webkit" ? webkit : chromium).launch();
  const ctx = await browser.newContext({
    viewport: { width: spec.w, height: spec.h }, deviceScaleFactor: spec.dsf,
    isMobile: spec.mobile, hasTouch: spec.mobile, locale: "fr-FR", timezoneId: "Europe/Paris",
  });
  const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  p.on("pageerror", (e) => log(`  [${spec.id}] PAGEERROR ${e.message}`));
  const shot = async (n, name) => {
    await p.screenshot({ path: `${dir}/${String(n).padStart(2, "0")}-${name}.png` });
    log(`  [${spec.id}] ${String(n).padStart(2, "0")}-${name}`);
  };

  try {
    // 1. Accueil
    await p.goto(`${BASE}/`, { waitUntil: "networkidle" }); await p.waitForTimeout(900);
    await shot(1, "accueil");

    // 2. Catalogue des outils
    await scrollTo(p, "text=Choisissez votre besoin");
    await p.evaluate((y) => window.scrollBy(0, y), spec.h * 0.9); await p.waitForTimeout(800);
    await shot(2, "catalogue");

    // 3. Un calcul reel abouti (valeurs par defaut du moteur : 1500 / 2000 / 2500)
    await p.goto(`${BASE}/outils/angle-droit-3-4-5/`, { waitUntil: "networkidle" }); await p.waitForTimeout(1000);
    await shot(3, "calcul-resultat");

    // 4. Schema cote du meme calcul
    const schema = p.getByRole("button", { name: /^Schéma$/ }).first();
    if (await schema.count()) { await schema.click(); await p.waitForTimeout(1200); }
    await shot(4, "schema-cote");

    // 5. Bibliotheque de traces
    await p.goto(`${BASE}/atelier/modeles/`, { waitUntil: "networkidle" }); await p.waitForTimeout(1400);
    await shot(5, "bibliotheque-traces");

    // 6. Atelier : le trace resolu par le moteur
    const projectId = await createTrace(p);
    log(`  [${spec.id}] projet cree ${projectId}`);
    await p.goto(`${BASE}/atelier/tracer/?projectId=${projectId}`, { waitUntil: "networkidle" }); await p.waitForTimeout(2500);
    await p.evaluate((y) => window.scrollBy(0, y), spec.h * 0.55); await p.waitForTimeout(900);
    await shot(6, "atelier-trace");

    // 7. Cotations : les dimensions a relever
    const cot = p.getByRole("button", { name: /^Cotations/ }).first();
    if (await cot.count()) { await cot.click(); await p.waitForTimeout(1500); }
    await shot(7, "cotations");

    // 8. Export PDF / SVG
    await p.goto(`${BASE}/atelier/export/?projectId=${projectId}`, { waitUntil: "networkidle" }); await p.waitForTimeout(2000);
    /* Les commandes d'export (format, echelle, generation, partage) sont sous l'apercu : c'est
     * elles qui font l'interet de l'ecran, pas l'apercu deja montre en 6 et 7. */
    await scrollTo(p, "text=/Format|Générer|Exporter en/i");
    await p.evaluate((y) => window.scrollBy(0, y), spec.h * 0.5); await p.waitForTimeout(900);
    await shot(8, "export");

    // 9 (hors serie principale). Panneau d'image de reference, point d'entree de la vectorisation.
    await p.goto(`${BASE}/atelier/tracer/?projectId=${projectId}`, { waitUntil: "networkidle" }); await p.waitForTimeout(2200);
    const img = p.locator("summary", { hasText: /Image de référence/ }).first();
    if (await img.count()) {
      await img.scrollIntoViewIfNeeded().catch(() => {}); await img.click(); await p.waitForTimeout(1200);
      await img.scrollIntoViewIfNeeded().catch(() => {}); await p.waitForTimeout(600);
      await shot(9, "image-reference");
    } else { log(`  [${spec.id}] panneau image de reference introuvable`); }
  } catch (e) { log(`  [${spec.id}] ERREUR ${e.message.split("\n")[0]}`); }
  await browser.close();
}

for (const spec of SERIES) { log(`=== ${spec.id} (${spec.w * spec.dsf} x ${spec.h * spec.dsf}) ===`); await runSeries(spec); }
log("FIN");
process.exit(0);
