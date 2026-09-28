/*
 * ELSATIA — Baseline performance V1 : mémoire et temps de rendu NAVIGATEUR des pages les plus
 * lourdes (Chromium réel, Playwright). Pour chaque page : temps jusqu'à `load`, poids du
 * document, nombre de nœuds DOM, tas JS utilisé (performance.memory, Chromium) après chargement.
 * Session posée par cookie @supabase/ssr, comme bench-http.mjs.
 *
 * Usage : node memoire-navigateur.mjs --app … --supabase … --anon … --email … --password … \
 *           --paths /dashboard,/planning --out resultat.json [--chrome /opt/pw-browsers/chromium]
 */
import fs from "node:fs";
import { chromium } from "playwright";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => { if (v.startsWith("--")) acc.push([v.slice(2), a[i + 1]]); return acc; }, []));
const ref = new URL(args.supabase).hostname.split(".")[0];
const r = await fetch(`${args.supabase}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: args.anon, "content-type": "application/json" }, body: JSON.stringify({ email: args.email, password: args.password }) });
const session = await r.json();
const valeur = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
const nom = `sb-${ref}-auth-token`;
const morceaux = valeur.length <= 3180 ? [[nom, valeur]] : Array.from({ length: Math.ceil(valeur.length / 3180) }, (_, i) => [`${nom}.${i}`, valeur.slice(i * 3180, (i + 1) * 3180)]);

const navigateur = await chromium.launch({ executablePath: args.chrome ?? "/opt/pw-browsers/chromium", args: ["--enable-precise-memory-info"] });
const contexte = await navigateur.newContext({ viewport: { width: 1440, height: 900 } });
const hote = new URL(args.app).hostname;
await contexte.addCookies(morceaux.map(([name, value]) => ({ name, value, domain: hote, path: "/" })));
const resultats = {};
for (const chemin of String(args.paths).split(",")) {
  const page = await contexte.newPage();
  let octets = 0;
  page.on("response", async (reponse) => { if (reponse.request().resourceType() === "document") octets = Number(reponse.headers()["content-length"] ?? 0) || (await reponse.body().catch(() => Buffer.alloc(0))).length; });
  const debut = Date.now();
  const rep = await page.goto(args.app + chemin, { waitUntil: "load", timeout: 180_000 });
  const chargement = Date.now() - debut;
  await page.waitForTimeout(1500);
  const mesure = await page.evaluate(() => ({
    tasJsMo: Math.round(((performance).memory?.usedJSHeapSize ?? 0) / 1e6),
    noeudsDom: document.getElementsByTagName("*").length,
    url: location.pathname,
  }));
  resultats[chemin] = { statut: rep?.status(), chargementMs: chargement, documentOctets: octets, ...mesure };
  console.log(`${chemin.padEnd(50)} ${rep?.status()} load=${chargement} ms doc=${(octets / 1e6).toFixed(1)} Mo DOM=${mesure.noeudsDom} tasJS=${mesure.tasJsMo} Mo ${mesure.url}`);
  await page.close();
}
await navigateur.close();
if (args.out) fs.writeFileSync(args.out, JSON.stringify(resultats, null, 2));
