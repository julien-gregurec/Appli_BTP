#!/usr/bin/env node
/**
 * ELSATIA — Pack Preview : smoke HTTP anonyme des applications déployées.
 *
 * Aucune écriture : uniquement GET / OPTIONS, redirections NON suivies, aucun cookie, aucun
 * identifiant utilisateur. Les attentes sont dérivées du code du train canonique V2 (proxys,
 * pages publiques, routes API) — voir ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md §3/§8.
 * Aucune application n'expose /api/health : la « santé » d'une app = ses pages publiques en 200
 * ET ses pages protégées fermées (307 → /login ou 401) — un 200 anonyme sur une page protégée
 * est une ERREUR (fuite), un 5xx aussi.
 *
 * Deployment Protection Vercel : si le projet est protégé, fournir le secret « Protection Bypass
 * for Automation » dans VERCEL_AUTOMATION_BYPASS_SECRET (en-tête x-vercel-protection-bypass,
 * jamais affiché). Sans lui, un 401 Vercel sur TOUTES les routes est signalé comme tel.
 *
 * Usage :
 *   node scripts/preview/http-smoke.mjs --gp https://… --colors https://… --tools https://… \
 *        --reserves https://… [--studio https://…] [--crons-enabled] [--tools-billing] [--allow-custom-domain]
 *   --tools-billing : Tools Pro configuré (compte/prix Stripe Tools) → le catalogue doit répondre 200.
 *   --local-harness : banc local `next start` (127.0.0.1 / localhost uniquement), pour prouver les attentes.
 * Sortie : 0 GO · 1 NO-GO · 2 refus.
 */
import { Refus, SORTIE, estPointEntree, exigerOriginePreview, ligne, lireOptions } from "./lib/preview-guard.mjs";

const REDIRECT = [301, 302, 303, 307, 308];
const UUID_ZERO = "00000000-0000-4000-8000-000000000000";

/**
 * Attentes par application. `status` : liste de codes admis. `location` : regex sur l'en-tête
 * Location (redirections). `json` : le corps doit être du JSON. `note` : pourquoi.
 */
export function attentes({ cronsActives = false, toolsBilling = false } = {}) {
  return {
    gp: [
      { path: "/", status: [200], note: "accueil public (proxy : / exact)" },
      { path: "/login", status: [200] },
      { path: "/signup", status: [200] },
      { path: "/mot-de-passe-oublie", status: [200] },
      { path: "/tarifs", status: [200] },
      { path: "/robots.txt", status: [200] },
      { path: "/manifest.webmanifest", status: [200] },
      { path: "/auth/callback", status: [307], location: /\/login/, note: "sans code → /login?error=… (503 = rate-limit mal configuré)" },
      { path: "/dashboard", status: [307], location: /\/login/, protege: true },
      { path: "/plateforme", status: [307], location: /\/login/, protege: true },
      { path: "/abonnement", status: [307], location: /\/login/, protege: true },
      { path: "/api/rgpd/export", status: [307], location: /\/login/, protege: true, note: "API non publique : 307 /login (pas 401)" },
      toolsBilling
        ? { path: "/api/tools/monetization/catalog", status: [200], json: true, note: "exemptée du proxy ; 307 = régression du proxy ; 503 = compte/prix Stripe Tools" }
        : { path: "/api/tools/monetization/catalog", status: [200, 503], json: true, catalogueTools: true, note: "Tools Pro hors périmètre : 503 JSON {products:[]} admis ; 307 = régression du proxy" },
      { path: "/api/tools/monetization/catalog", method: "OPTIONS", status: [200, 204], note: "preflight CORS (jamais 307)" },
      { path: "/api/cron/abonnements", status: cronsActives ? [401] : [404], note: cronsActives ? "sans bearer" : "FEATURE_CRONS_ENABLED=false en Preview" },
      { path: "/api/cron/notifications-push", status: cronsActives ? [401] : [404] },
      { path: "/api/stripe/abonnement/webhook", status: [405], note: "GET sur un webhook POST-only" },
    ],
    colors: [
      { path: "/login", status: [200] },
      { path: "/robots.txt", status: [200] },
      { path: "/manifest.webmanifest", status: [200] },
      { path: "/sw-colors.js", status: [200] },
      { path: "/", status: [307], location: /\/dashboard|\/login/ },
      { path: "/dashboard", status: [307, 200], location: /\/login/, protege: true, note: "redirect() serveur ; 200 admis seulement si méta-refresh vers /login (streaming)" },
      { path: "/api/acces", status: [307, 401, 403], location: /\/login/, protege: true },
    ],
    tools: [
      { path: "/", status: [200] },
      { path: "/outils", status: [200] },
      { path: "/compte", status: [200] },
      { path: "/offline", status: [200] },
      { path: "/robots.txt", status: [200] },
      { path: "/manifest.webmanifest", status: [200] },
      { path: "/sw-tools.js", status: [200], note: "généré au build (--mode=server) ; 404 = build incomplet" },
    ],
    reserves: [
      { path: "/api/offline/ping", status: [204], note: "sonde de connectivité, sans authentification" },
      { path: "/login", status: [200] },
      { path: "/manifest.webmanifest", status: [200] },
      { path: "/sw-reserves.js", status: [200] },
      { path: "/dashboard", status: [307, 200], location: /\/login/, protege: true },
      { path: `/api/documents/chantier/${UUID_ZERO}/pdf`, status: [401], protege: true },
      { path: "/api/cron/notifications", status: [401], note: "sans bearer ; 503 = CRON_SECRET absent" },
    ],
    studio: [
      { path: "/login", status: [200], note: "503 = STUDIO_ENABLED=false (Studio exclu)" },
      { path: "/signup", status: [200] },
      { path: "/", status: [307], location: /\/dashboard|\/login/ },
      { path: `/api/projects?workspace=${UUID_ZERO}`, status: [401, 404], protege: true },
    ],
  };
}

/** Banc local (`next start`) : seules les origines http(s)://127.0.0.1|localhost sont admises. */
export function origineBancLocal(url) {
  let u;
  try { u = new URL(url); } catch { throw new Refus("origine invalide"); }
  if (!["127.0.0.1", "localhost"].includes(u.hostname)) throw new Refus("--local-harness n'accepte que 127.0.0.1 / localhost");
  return u.origin;
}

/** Pure : évalue une réponse contre son attente. */
export function evaluer(attente, reponse) {
  const { status, location, corps } = reponse;
  if (status === 401 && reponse.vercelProtection) return { ok: false, code: "HTTP-VERCEL-PROTECTION", message: "protection Vercel : fournir VERCEL_AUTOMATION_BYPASS_SECRET" };
  if (status === 503 && /Protection anti-abus indisponible/.test(corps ?? "")) {
    return { ok: false, code: "HTTP-RATE-LIMIT-DOWN", message: "rate-limiter injoignable : clé de service Supabase ou RPC de rate-limit (vérifier SUPABASE_SERVICE_ROLE_KEY)" };
  }
  if (status === 503 && attente.catalogueTools && attente.status.includes(503)) {
    try {
      const j = JSON.parse(corps ?? "");
      if (Array.isArray(j.products) && j.products.length === 0) return { ok: true, code: "HTTP-OK", message: "HTTP 503 JSON — catalogue Tools non configuré (attendu hors Tools Pro)" };
    } catch { /* tombe dans l'échec 5xx */ }
  }
  if (status >= 500) return { ok: false, code: "HTTP-5XX", message: `HTTP ${status}` };
  if (attente.protege && status === 200 && !(location || /http-equiv=["']?refresh[^>]+\/login/i.test(corps ?? ""))) {
    return { ok: false, code: "HTTP-PROTECTED-OPEN", message: "page protégée servie en 200 sans session (fuite)" };
  }
  if (!attente.status.includes(status)) return { ok: false, code: "HTTP-STATUS", message: `HTTP ${status}, attendu ${attente.status.join("|")}` };
  if (REDIRECT.includes(status) && attente.location && !attente.location.test(location ?? "")) {
    return { ok: false, code: "HTTP-LOCATION", message: "redirection vers une cible inattendue" };
  }
  if (attente.json && status === 200) {
    try { JSON.parse(corps ?? ""); } catch { return { ok: false, code: "HTTP-JSON", message: "corps non JSON" }; }
  }
  return { ok: true, code: "HTTP-OK", message: `HTTP ${status}` };
}

async function sonder(origin, attente, { fetchImpl, bypass }) {
  const headers = { "user-agent": "elsatia-preview-smoke/1" };
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  if (attente.method === "OPTIONS") {
    headers.origin = origin;
    headers["access-control-request-method"] = "GET";
  }
  const r = await fetchImpl(`${origin}${attente.path}`, { method: attente.method ?? "GET", headers, redirect: "manual", signal: AbortSignal.timeout(15000) });
  const corps = [200, 401, 503].includes(r.status) ? (await r.text()).slice(0, 20000) : "";
  // Chemin seul : l'origine n'est jamais affichée ni comparée.
  let location = r.headers.get("location");
  try { if (location) location = new URL(location, origin).pathname; } catch { /* garde tel quel */ }
  const vercelProtection = r.status === 401 && (/vercel/i.test(r.headers.get("server") ?? "") && /authentication required|vercel/i.test(corps));
  return { status: r.status, location, corps, vercelProtection };
}

export async function executer(origines, { cronsActives = false, toolsBilling = false, fetchImpl = fetch, bypass = null, log = console.log } = {}) {
  const table = attentes({ cronsActives, toolsBilling });
  let erreurs = 0;
  log("ELSATIA — smoke HTTP Preview (anonyme, GET/OPTIONS, redirections non suivies)\n");
  for (const [app, origin] of Object.entries(origines)) {
    log(`── ${app}`);
    for (const a of table[app]) {
      let res;
      try { res = evaluer(a, await sonder(origin, a, { fetchImpl, bypass })); } catch (error) { res = { ok: false, code: "HTTP-TRANSPORT", message: error instanceof Error ? error.name : "erreur réseau" }; }
      if (!res.ok) erreurs += 1;
      log(ligne(res.ok ? "ok" : "ko", res.code, `${a.method ?? "GET"} ${a.path}`, res.ok ? res.message : `${res.message}${a.note ? ` (${a.note})` : ""}`));
    }
  }
  log(erreurs ? `\nNO-GO : ${erreurs} contrôle(s) en échec.` : "\nGO : smoke HTTP conforme.");
  return erreurs ? SORTIE.NO_GO : SORTIE.GO;
}

if (estPointEntree(import.meta.url)) {
  const o = lireOptions(process.argv.slice(2));
  try {
    const origines = {};
    for (const app of ["gp", "colors", "tools", "reserves", "studio"]) {
      if (typeof o[app] !== "string") continue;
      origines[app] = o["local-harness"] ? origineBancLocal(o[app]) : exigerOriginePreview(o[app], { domainePersonnaliseAutorise: Boolean(o["allow-custom-domain"]) });
    }
    if (!Object.keys(origines).length) throw new Refus("au moins une origine (--gp, --colors, --tools, --reserves, --studio) est requise");
    process.exitCode = await executer(origines, { cronsActives: Boolean(o["crons-enabled"]), toolsBilling: Boolean(o["tools-billing"]), bypass: process.env.VERCEL_AUTOMATION_BYPASS_SECRET || null });
  } catch (error) {
    if (error instanceof Refus) { console.error(`REFUS : ${error.message}`); process.exitCode = SORTIE.REFUS; } else throw error;
  }
}
