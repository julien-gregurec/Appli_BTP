// Enregistre une démonstration réelle de Liria Gestion Pro.
//
// Principe : la voix off est générée d'abord, sa durée pilote le tournage.
// Chaque geste est déclenché à la seconde précise où la narration en parle —
// on saisit les identifiants PENDANT qu'on explique qu'on les saisit, au lieu
// de faire puis commenter. C'est ce qui rend la démonstration fluide.
//
// Rien n'est simulé : vraies pages, vraies données de l'entreprise de démo.
//
//   node scripts/video/enregistrer.mjs
// Sortie : output/video/brut/demo.webm

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

// Courte respiration entre deux phrases, le temps que la page s'affiche.
// Volontairement brève : à 6 s, le montage comptait 37 % de silence.
const RESPIRATION = 1500;

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

// Défilement lent, démarrage et freinage progressifs, comme une main humaine.
async function defiler(cible, ms) {
  await page.evaluate(([cible, ms]) => new Promise((fini) => {
    const depart = window.scrollY, delta = cible - depart, t0 = performance.now();
    (function pas(t) {
      const p = Math.min(1, ((t ?? performance.now()) - t0) / ms);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      window.scrollTo(0, depart + delta * e);
      if (p < 1) requestAnimationFrame(pas); else fini();
    })();
  }), [cible, ms]);
}

async function aller(route) {
  // On n'attend pas `networkidle` : les pages mettent 6 à 10 s à s'y stabiliser
  // alors qu'elles sont lisibles en ~2,5 s.
  await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(350);
}

async function taper(selecteur, texte, delai = 45) {
  const champ = page.locator(selecteur).first();
  if (!(await champ.count())) return false;
  await champ.click({ timeout: 5000 }).catch(() => {});
  await champ.type(texte, { delay: delai });
  return true;
}

const debut = Date.now();
let echeance = 0;

// Joue une scène. `choreo` reçoit `a(ms)` : « être à telle milliseconde de la
// narration », ce qui permet de caler chaque geste sur les mots prononcés.
async function scene(cle, { route, choreo } = {}) {
  if (route) await aller(route);
  const debutVoix = debut + echeance + RESPIRATION;
  echeance += RESPIRATION + duree(cle);
  const fin = debut + echeance;

  const a = async (ms) => {
    const attente = debutVoix + ms - Date.now();
    if (attente > 0) await page.waitForTimeout(attente);
  };

  if (choreo) {
    await choreo(a);
  } else {
    // Aucun geste : on laisse lire, puis un seul défilement lent.
    const budget = fin - Date.now();
    if (budget > 4000) {
      await page.waitForTimeout(budget * 0.3);
      const bas = await page.evaluate(
        () => Math.max(0, document.documentElement.scrollHeight - window.innerHeight));
      if (bas > 150) await defiler(Math.min(bas, 500), Math.min(budget * 0.5, 4800));
    }
  }

  const reste = fin - Date.now();
  if (reste > 0) await page.waitForTimeout(reste);
  else if (reste < -1200) console.log(`  retard ${(-reste / 1000).toFixed(1)}s sur « ${cle} »`);
}

try {
  await scene("intro", { route: "/login" });

  // « Je saisis mon adresse… mon mot de passe… et je me connecte. »
  await scene("connexion", {
    choreo: async (a) => {
      await a(400);
      await taper("#email", email, 42);
      await a(3000);
      await taper("#password", password, 42);
      await a(5400);
      await page.getByRole("button", { name: "Se connecter" }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60_000 });
    },
  });

  // « … Je descends : les indicateurs, les alertes, les raccourcis. »
  await scene("dashboard", {
    choreo: async (a) => { await a(5200); await defiler(520, 4200); },
  });

  // « Je tape dans la recherche… et la liste se filtre à la volée. »
  await scene("clients", {
    route: "/clients",
    choreo: async (a) => {
      await a(3400);
      await taper('input[name="q"]', "Societe", 80);
      await a(6200);
      await page.getByRole("button", { name: "Filtrer" }).first().click().catch(() => {});
    },
  });

  // « Je filtre sur les chantiers en cours… »
  await scene("chantiers", {
    route: "/chantiers",
    choreo: async (a) => {
      await a(3600);
      await defiler(360, 2600);
      await a(6600);
      await page.locator('select[name="statut"]').first()
        .selectOption({ label: "En cours" }).catch(() => {});
    },
  });

  await scene("devis", {
    route: "/devis",
    choreo: async (a) => { await a(5200); await defiler(300, 2400); },
  });

  // « Je choisis le client… je tape ma prestation… la quantité… le prix. »
  await scene("devis_creation", {
    route: "/devis/nouveau",
    choreo: async (a) => {
      await a(1200);
      await page.locator("select").first().selectOption({ index: 1 }).catch(() => {});
      await a(3200);
      await taper('input[name="designation"]', "Pose de carrelage", 55);
      await a(7000);
      await taper('input[name="quantite"]', "24", 110);
      await a(8600);
      await taper('input[name="prix_unitaire_ht"]', "55", 110);
      await a(10200);
      await defiler(320, 1600);
    },
  });

  const lien = await page.evaluate(async (url) => {
    const r = await fetch(url + "/devis");
    const m = (await r.text()).match(/\/devis\/[0-9a-f-]{36}/);
    return m ? m[0] : null;
  }, baseUrl).catch(() => null);
  await scene("devis_fiche", { route: lien ?? "/devis" });

  await scene("factures", {
    route: "/factures",
    choreo: async (a) => { await a(4600); await defiler(420, 3600); },
  });

  await scene("planning", {
    route: "/planning",
    choreo: async (a) => {
      await a(4200);
      await page.locator("select").first().selectOption({ index: 1 }).catch(() => {});
      await a(6800);
      await defiler(400, 2600);
    },
  });

  await scene("pointage", { route: "/pointage" });
  await scene("employes", { route: "/employes" });
  await scene("stock", { route: "/stock" });
  await scene("rentabilite", { route: "/rentabilite" });
  await scene("fin", { route: "/dashboard" });
} finally {
  await page.close();
  await context.close();
  await browser.close();
}

const fichiers = (await readdir(sortie)).filter((f) => f.endsWith(".webm"));
if (fichiers.length) {
  await rename(path.join(sortie, fichiers[0]), path.join(sortie, "demo.webm"));
  console.log(`Vidéo brute : ${sortie}/demo.webm`);
}
