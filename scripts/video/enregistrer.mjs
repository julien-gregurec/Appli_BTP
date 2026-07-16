// Enregistre une démonstration réelle de Liria Gestion Pro.
//
// Playwright pilote un vrai navigateur connecté et filme la session. Chaque
// scène dure exactement le temps de sa narration (mesurée en amont) : l'image
// et la voix off sont donc synchrones par construction, sans montage manuel.
//
// Rien n'est simulé : ce sont les vraies pages, avec les vraies données de
// l'entreprise de démonstration.
//
//   node scripts/video/enregistrer.mjs
// Sortie : output/video/brut/*.webm

import { chromium } from "playwright";
import path from "node:path";
import { mkdir, readFile, rm, readdir, rename } from "node:fs/promises";

const baseUrl = process.env.LIRIA_AUDIT_URL ?? "http://127.0.0.1:3000";
const email = process.env.LIRIA_AUDIT_EMAIL;
const password = process.env.LIRIA_AUDIT_PASSWORD;
const sortie = path.resolve("output/video/brut");

if (!email || !password) throw new Error("LIRIA_AUDIT_EMAIL et LIRIA_AUDIT_PASSWORD sont obligatoires.");

const scenes = JSON.parse(await readFile("output/video/scenes.json", "utf8"));
const duree = (cle) => (scenes.find((s) => s.cle === cle)?.duree ?? 5) * 1000;

// Respiration insérée entre deux narrations. La navigation vers la page
// suivante se fait pendant ce silence : la voix off démarre donc toujours sur
// la bonne page. Sans elle, le chargement mordait sur le début du texte et
// l'image retardait d'une scène sur le commentaire.
// 6 s : c'est le temps réel d'affichage de la page la plus lourde (/rentabilite,
// 3,6 s) plus une marge. En dessous, la voix off commençait à décrire un écran
// encore en cours de chargement.
const RESPIRATION = 6000;

await rm(sortie, { recursive: true, force: true });
await mkdir(sortie, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: sortie, size: { width: 1280, height: 720 } },
  locale: "fr-FR", timezoneId: "Europe/Paris",
  permissions: ["geolocation"],
  geolocation: { latitude: 45.764043, longitude: 4.835659 },
});
const page = await context.newPage();

// Défilement doux : un saut brutal est illisible à l'écran.
async function defiler(pixels) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "smooth" }), pixels);
  await page.waitForTimeout(900);
}

async function aller(route) {
  // On n'attend pas `networkidle` : en production les pages mettent 6 à 10 s à
  // s'y stabiliser, alors qu'elles sont lisibles au bout de ~2,5 s. Attendre le
  // silence réseau décalait la vidéo d'une scène entière sur la narration.
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(1300);
}

// Horloge globale : chaque scène se termine à son échéance absolue depuis le
// début de l'enregistrement. Sans cela, le temps de navigation s'ajoute à
// chaque scène et l'écart s'accumule — la vidéo finissait 2 minutes plus longue
// que la voix off, donc décalée par rapport à la narration.
const debut = Date.now();
let echeance = 0;

// `tenir` couvre la narration d'une scène. `route` est chargée AVANT que la
// narration ne commence, pendant le silence qui précède : sans cela, la voix
// décrit une page qui met encore 2 à 4 s à s'afficher, et l'image retarde d'une
// scène entière sur le commentaire.
async function tenir(cle, { route, action } = {}) {
  if (route) await aller(route);          // pendant le silence précédent
  echeance += duree(cle) + RESPIRATION;
  const fin = debut + echeance;
  if (action) await action();
  while (Date.now() < fin - 1400) {
    await defiler(420);
    if (Date.now() >= fin - 1400) break;
    await defiler(0);
  }
  const reste = fin - Date.now();
  if (reste > 0) await page.waitForTimeout(reste);
  else if (reste < -1500) console.log(`  retard ${(-reste / 1000).toFixed(1)}s sur « ${cle} »`);
}

try {
  // 1. Intro et connexion — la vraie page de login.
  await tenir("intro", { route: "/login" });

  await page.locator("#email").fill(email, { timeout: 15_000 });
  await page.waitForTimeout(400);
  // Le mot de passe est saisi caractère par caractère mais jamais affiché :
  // le champ est de type password, l'enregistrement ne montre que des points.
  await page.locator("#password").fill(password);
  await page.waitForTimeout(600);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 }),
    page.getByRole("button", { name: "Se connecter" }).click(),
  ]);
  await page.waitForTimeout(1200);
  await tenir("connexion");

  await tenir("dashboard");

  await tenir("clients", { route: "/clients" });

  await tenir("chantiers", { route: "/chantiers" });

  await tenir("devis", { route: "/devis" });

  // Création réelle d'un devis : on remplit vraiment le formulaire.
  await tenir("devis_creation", { route: "/devis/nouveau", action: async () => {
    const designation = page.locator('input[name="designation"]').first();
    if (await designation.count()) {
      await designation.click();
      await designation.type("Pose de carrelage", { delay: 55 });
      await page.waitForTimeout(500);
    }
  } });

  // Un devis existant, pour montrer le résultat abouti.
  const lien = await page.evaluate(async (url) => {
    const r = await fetch(url + "/devis");
    const t = await r.text();
    const m = t.match(/\/devis\/[0-9a-f-]{36}/);
    return m ? m[0] : null;
  }, baseUrl).catch(() => null);
  await tenir("devis_fiche", { route: lien ?? "/devis" });

  await tenir("factures", { route: "/factures" });

  await tenir("planning", { route: "/planning" });

  await tenir("pointage", { route: "/pointage" });

  await tenir("employes", { route: "/employes" });

  await tenir("stock", { route: "/stock" });

  await tenir("rentabilite", { route: "/rentabilite" });

  await tenir("fin", { route: "/dashboard" });
} finally {
  await page.close();
  await context.close();
  await browser.close();
}

const fichiers = (await readdir(sortie)).filter((f) => f.endsWith(".webm"));
if (fichiers.length) {
  await rename(path.join(sortie, fichiers[0]), path.join(sortie, "demo.webm"));
  console.log(`Vidéo brute : ${sortie}/demo.webm`);
} else {
  console.log("Aucune vidéo produite.");
}
