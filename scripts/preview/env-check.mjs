#!/usr/bin/env node
/**
 * ELSATIA — Pack Preview : contrôle d'environnement multi-application (hors ligne, lecture seule).
 *
 * Complète `check-env-manifest.mjs --preflight` (une app à la fois) par ce qu'aucun contrôle
 * existant ne voit : la COHÉRENCE ENTRE APPLICATIONS d'une même Preview.
 *   1. manifeste : runPreflight(target=preview) pour chaque fichier fourni ;
 *   2. même projet Supabase partout (SSO), jamais la Production, = la Preview attendue ;
 *   3. même clé publique partout (Réserves lit encore NEXT_PUBLIC_SUPABASE_ANON_KEY) ;
 *      même clé de service GP / Colors / Réserves ; même clé Storage Studio / worker ;
 *   4. URL croisées : Colors ↔ GP, Tools ↔ GP (API de facturation, retour Checkout, CORS) ;
 *   5. aucune valeur publique (NEXT_PUBLIC_*) égale à une valeur secrète d'un autre fichier ;
 *   6. Stripe : uniquement des clés test ; Store Tools en sandbox.
 *
 * Fichiers attendus dans --dir (dotenv locaux, JAMAIS versionnés ; absents = app hors périmètre) :
 *   gp.env  colors.env  tools.env  reserves.env  studio.env  worker.env
 * Obtenus par : vercel env pull --environment=preview <dir>/<app>.env (dans chaque projet lié).
 *
 * Usage :
 *   node scripts/preview/env-check.mjs --dir ~/elsatia-preview [--preview-ref <ref>] [--require gp,colors,tools,reserves]
 * AUCUNE valeur n'est affichée : seulement noms, « identique / différent », codes.
 * Sortie : 0 GO · 1 NO-GO · 2 refus (garde-fou / usage).
 */
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { loadJson, MANIFEST_PATH } from "../lib/env-manifest-core.mjs";
import { runPreflight } from "../lib/env-manifest-preflight.mjs";
import {
  REF_PREVIEW_AUTORISEE, REF_PRODUCTION_CONNUE, Refus, SORTIE, chargerFichierEnv, estDefinie,
  estPointEntree, ligne, lireOptions, origine, refDepuisUrlApi, typeCleStripe,
} from "./lib/preview-guard.mjs";

const ROOT = resolve(import.meta.dirname, "../..");

export const FICHIERS = [
  { fichier: "gp.env", app: "gestion_pro", court: "gp" },
  { fichier: "colors.env", app: "colors", court: "colors" },
  { fichier: "tools.env", app: "tools", court: "tools" },
  { fichier: "reserves.env", app: "reserves", court: "reserves" },
  { fichier: "studio.env", app: "studio", court: "studio" },
  { fichier: "worker.env", app: "studio_worker", court: "worker" },
];

const CLE_PUBLIQUE = { gp: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", colors: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", tools: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", studio: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", reserves: "NEXT_PUBLIC_SUPABASE_ANON_KEY" };

/**
 * Contrôles croisés. `envs` = { gp: {...}, colors: {...}, … } (apps présentes seulement).
 * Renvoie des constats { niveau: "error"|"warning"|"ok", code, sujet, message } sans valeur.
 */
export function controlesCroises(envs, { refAttendue = REF_PREVIEW_AUTORISEE, manifest = null } = {}) {
  const out = [];
  const push = (niveau, code, sujet, message = "") => out.push({ niveau, code, sujet, message });
  const apps = Object.keys(envs);

  // Même valeur partout (compare sans jamais exposer).
  const memeValeur = (code, sujet, paires) => {
    const presentes = paires.filter(([a, n]) => envs[a] && estDefinie(envs[a][n]));
    if (presentes.length < 2) return;
    const ref = envs[presentes[0][0]][presentes[0][1]].trim();
    const differentes = presentes.filter(([a, n]) => envs[a][n].trim() !== ref).map(([a]) => a);
    if (differentes.length) push("error", code, sujet, `valeur différente entre ${presentes[0][0]} et ${differentes.join(", ")}`);
    else push("ok", code, sujet, `identique sur ${presentes.map(([a]) => a).join(", ")}`);
  };

  // 2. Projet Supabase.
  const refs = new Set();
  for (const a of apps) {
    const url = envs[a].NEXT_PUBLIC_SUPABASE_URL;
    if (!estDefinie(url)) continue;
    const ref = refDepuisUrlApi(url);
    if (!ref) { push("error", "X-SUPABASE-URL", a, "NEXT_PUBLIC_SUPABASE_URL n'est pas https://<ref>.supabase.co"); continue; }
    if (ref === REF_PRODUCTION_CONNUE) push("error", "X-SUPABASE-PRODUCTION", a, "NEXT_PUBLIC_SUPABASE_URL pointe la PRODUCTION");
    else if (ref !== String(refAttendue).toLowerCase()) push("error", "X-SUPABASE-REF", a, "projet Supabase ≠ Preview attendue (--preview-ref)");
    refs.add(ref);
  }
  if (refs.size > 1) push("error", "X-SUPABASE-SSO", "NEXT_PUBLIC_SUPABASE_URL", "plusieurs projets Supabase : le SSO multi-application est cassé");
  else if (refs.size === 1) push("ok", "X-SUPABASE-SSO", "NEXT_PUBLIC_SUPABASE_URL", `un seul projet sur ${apps.filter((a) => estDefinie(envs[a].NEXT_PUBLIC_SUPABASE_URL)).length} app(s)`);

  // 3. Clés partagées.
  memeValeur("X-PUBLIC-KEY", "clé Supabase publique", Object.entries(CLE_PUBLIQUE).map(([a, n]) => [a, n]));
  memeValeur("X-SERVICE-KEY", "SUPABASE_SERVICE_ROLE_KEY", ["gp", "colors", "reserves"].map((a) => [a, "SUPABASE_SERVICE_ROLE_KEY"]));
  memeValeur("X-STUDIO-STORAGE-KEY", "STUDIO_STORAGE_SERVICE_KEY", ["studio", "worker"].map((a) => [a, "STUDIO_STORAGE_SERVICE_KEY"]));

  // 4. URL croisées (origines comparées, jamais affichées).
  const memeOrigine = (code, sujet, [a1, n1], [a2, n2]) => {
    if (!envs[a1] || !envs[a2] || !estDefinie(envs[a1][n1]) || !estDefinie(envs[a2][n2])) return;
    const o1 = origine(envs[a1][n1]);
    const o2 = origine(envs[a2][n2]);
    if (!o1 || !o2 || o1 !== o2) push("error", code, sujet, `${a1}.${n1} et ${a2}.${n2} n'ont pas la même origine`);
    else push("ok", code, sujet, "même origine");
  };
  memeOrigine("X-URL-COLORS", "URL Colors", ["gp", "NEXT_PUBLIC_COLORS_URL"], ["colors", "NEXT_PUBLIC_COLORS_URL"]);
  memeOrigine("X-URL-ACCOUNT", "portail de compte Colors → GP", ["colors", "NEXT_PUBLIC_ELSATIA_ACCOUNT_URL"], ["gp", "NEXT_PUBLIC_APP_URL"]);
  memeOrigine("X-URL-TOOLS-BILLING", "API de facturation Tools → GP", ["tools", "NEXT_PUBLIC_TOOLS_BILLING_API_URL"], ["gp", "NEXT_PUBLIC_APP_URL"]);
  memeOrigine("X-URL-TOOLS-RETURN", "retour Checkout Tools", ["gp", "TOOLS_APP_URL"], ["tools", "NEXT_PUBLIC_TOOLS_URL"]);
  if (envs.gp && envs.tools && estDefinie(envs.gp.TOOLS_ALLOWED_ORIGINS) && estDefinie(envs.tools.NEXT_PUBLIC_TOOLS_URL)) {
    const liste = envs.gp.TOOLS_ALLOWED_ORIGINS.split(",").map((s) => origine(s)).filter(Boolean);
    const tools = origine(envs.tools.NEXT_PUBLIC_TOOLS_URL);
    if (tools && liste.includes(tools)) push("ok", "X-TOOLS-CORS", "TOOLS_ALLOWED_ORIGINS", "contient l'origine Tools");
    else push("error", "X-TOOLS-CORS", "TOOLS_ALLOWED_ORIGINS", "ne contient pas l'origine NEXT_PUBLIC_TOOLS_URL de Tools");
  }

  // 5. Fuite d'un secret dans une variable publique d'une autre app.
  const secrets = new Map();
  const estSecret = (nom) => (manifest ? manifest.variables.find((v) => v.name === nom)?.secret : /SECRET|SERVICE_ROLE|PRIVATE|_KEY$/.test(nom) && !nom.startsWith("NEXT_PUBLIC_"));
  for (const a of apps) for (const [n, v] of Object.entries(envs[a])) if (estSecret(n) && estDefinie(v) && v.trim().length >= 16) secrets.set(v.trim(), `${a}.${n}`);
  let fuites = 0;
  for (const a of apps) for (const [n, v] of Object.entries(envs[a])) {
    if (!n.startsWith("NEXT_PUBLIC_") || !estDefinie(v)) continue;
    const source = secrets.get(v.trim());
    if (source) { fuites += 1; push("error", "X-SECRET-IN-PUBLIC", `${a}.${n}`, `valeur identique au secret ${source}`); }
  }
  if (!fuites) push("ok", "X-SECRET-IN-PUBLIC", "variables publiques", "aucune ne reprend une valeur secrète");

  // 6. Stripe test uniquement ; Store Tools en sandbox.
  for (const a of apps) for (const n of ["STRIPE_SECRET_KEY", "STRIPE_TOOLS_SECRET_KEY"]) {
    const t = typeCleStripe(envs[a][n]);
    if (t === "live") push("error", "X-STRIPE-LIVE", `${a}.${n}`, "clé LIVE en Preview");
    else if (t === "test") push("ok", "X-STRIPE-TEST", `${a}.${n}`, "clé test");
  }
  if (envs.gp && estDefinie(envs.gp.TOOLS_STORE_ENVIRONMENT) && envs.gp.TOOLS_STORE_ENVIRONMENT.trim() !== "sandbox") {
    push("warning", "X-STORE-ENV", "TOOLS_STORE_ENVIRONMENT", "Preview attendue en « sandbox »");
  }
  return out;
}

export function charger(dir) {
  const envs = {};
  for (const { fichier, court } of FICHIERS) {
    const chemin = join(dir, fichier);
    if (existsSync(chemin)) envs[court] = chargerFichierEnv(chemin);
  }
  return envs;
}

export function executer({ dir, refAttendue = REF_PREVIEW_AUTORISEE, requis = [] }, log = console.log) {
  const manifest = loadJson(ROOT, MANIFEST_PATH);
  const envs = charger(dir);
  let erreurs = 0;
  log("ELSATIA — env-check Preview multi-application (aucune valeur affichée)\n");
  for (const r of requis) if (!envs[r]) { erreurs += 1; log(ligne("ko", "X-FILE-MISSING", `${r}.env`, "fichier requis absent")); }
  for (const { court, app } of FICHIERS) {
    if (!envs[court]) { log(`── ${court} : absent (hors périmètre)`); continue; }
    if (envs[court].ELSATIA_APPLICATION_ENV?.trim() === "production" || envs[court].VERCEL_ENV?.trim() === "production") {
      throw new Refus(`${court}.env déclare la Production : refus`);
    }
    const { findings } = runPreflight(manifest, envs[court], { target: "preview", apps: [app] });
    const e = findings.filter((f) => f.level === "error");
    erreurs += e.length;
    log(`── ${court} (${app}) : ${e.length ? `${e.length} erreur(s)` : "manifeste OK"}`);
    for (const f of e) log(ligne("ko", f.code, f.subject, f.message));
    for (const f of findings.filter((x) => x.level === "warning")) log(ligne("warn", f.code, f.subject, f.message));
  }
  log("\n── contrôles croisés");
  for (const c of controlesCroises(envs, { refAttendue, manifest })) {
    if (c.niveau === "error") erreurs += 1;
    log(ligne(c.niveau === "error" ? "ko" : c.niveau === "warning" ? "warn" : "ok", c.code, c.sujet, c.message));
  }
  log(erreurs ? `\nNO-GO : ${erreurs} erreur(s).` : "\nGO : aucune erreur.");
  return erreurs ? SORTIE.NO_GO : SORTIE.GO;
}

if (estPointEntree(import.meta.url)) {
  const o = lireOptions(process.argv.slice(2));
  try {
    if (typeof o.dir !== "string") throw new Refus("--dir <répertoire des fichiers .env Preview> est obligatoire");
    const requis = typeof o.require === "string" ? o.require.split(",").map((s) => s.trim()) : [];
    process.exitCode = executer({ dir: o.dir, refAttendue: typeof o["preview-ref"] === "string" ? o["preview-ref"] : REF_PREVIEW_AUTORISEE, requis });
  } catch (error) {
    if (error instanceof Refus) { console.error(`REFUS : ${error.message}`); process.exitCode = SORTIE.REFUS; } else throw error;
  }
}
