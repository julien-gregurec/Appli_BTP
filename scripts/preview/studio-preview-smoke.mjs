#!/usr/bin/env node
/**
 * ELSATIA Studio — smoke HTTP anonyme d'une Preview Studio dédiée déployée (B + I1).
 *
 * Complète scripts/preview/http-smoke.mjs (pages publiques/protégées) par les contrôles propres à
 * Studio : aucun mot de passe ni inscription, jeton de passage refusé sans état, secrets de
 * planification, CSRF d'origine, redirection ouverte, en-têtes, liens publics/invitations inventés,
 * absence de clé de service dans le JavaScript servi, et — si l'URL Supabase Studio et la clé
 * PUBLIQUE sont fournies — inscription GoTrue fermée et surfaces anon fermées.
 *
 * Aucune donnée créée : GET/POST anonymes uniquement, redirections NON suivies, aucun cookie
 * utilisateur, jetons inventés. La seule tentative d'écriture (POST /auth/v1/signup) DOIT être
 * refusée par GoTrue : si elle réussit, c'est un NO-GO (l'adresse utilisée est une adresse de recette
 * en `.invalid`, non routable).
 *
 * Usage :
 *   node scripts/preview/studio-preview-smoke.mjs --studio https://<preview>.vercel.app \
 *        [--supabase-url https://<ref>.supabase.co --env-file <studio.env>] [--allow-custom-domain] [--local-harness]
 *   Clé publique (non secrète) : NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY lue dans --env-file. Protection Vercel :
 *   VERCEL_AUTOMATION_BYPASS_SECRET (en-tête, jamais affiché).
 * Sortie : 0 GO · 1 NO-GO · 2 refus.
 */
import { randomBytes } from "node:crypto";
import { Refus, SORTIE, chargerFichierEnv, estPointEntree, exigerOriginePreview, ligne, lireOptions } from "./lib/preview-guard.mjs";
import { origineBancLocal } from "./http-smoke.mjs";
import { HOTES_PRODUCTION, natureCleSupabase } from "./studio-preview-guard.mjs";

const REDIRECT = [301, 302, 303, 307, 308];
const jeton = () => randomBytes(24).toString("base64url");

/** Pure : jetons JWT `service_role` ou clés `sb_secret_` présents dans un texte (JS servi). */
export function secretsDansTexte(texte) {
  const trouves = [];
  if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(texte)) trouves.push("sb_secret_");
  for (const m of texte.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g)) {
    if (natureCleSupabase(m[0]).nature === "service") { trouves.push("jwt service_role"); break; }
  }
  return trouves;
}

/** Pure : scripts same-origin référencés par une page HTML. */
export function scriptsDePage(html) {
  return [...new Set([...html.matchAll(/<script[^>]+src="(\/_next\/[^"]+\.js)"/g)].map((m) => m[1]))];
}

/** Pure : liens absolus vers un hôte de Production ELSATIA dans une page Preview. */
export function liensProduction(html) {
  const hotes = new Set();
  for (const m of html.matchAll(/(?:href|action|src)="(https?:\/\/[^"]+)"/g)) {
    try { const h = new URL(m[1]).hostname; if (HOTES_PRODUCTION.includes(h)) hotes.add(h); } catch { /* ignoré */ }
  }
  return [...hotes];
}

/** Contrôles sur l'application Studio. Chaque contrôle : { id, requete, verifier(reponse) → {ok, message} }. */
export function controlesStudio() {
  // Pages à chargement progressif (loading.tsx) : 200 + redirection EN FLUX vers /login
  // (NEXT_REDIRECT + meta refresh), sans contenu — même règle que http-smoke.mjs.
  const redirigeLogin = (r) => {
    if (REDIRECT.includes(r.status)) return { ok: /^\/login/.test(r.location ?? ""), message: `HTTP ${r.status} → ${r.location ?? "∅"}` };
    const flux = r.status === 200 && /NEXT_REDIRECT;[a-z]+;\/login[?;]/.test(r.corps) && /http-equiv="refresh"[^>]+url=\/login/.test(r.corps);
    return { ok: flux, message: flux ? "HTTP 200, redirection en flux → /login" : `HTTP ${r.status} sans redirection vers /login (page protégée ouverte ?)` };
  };
  const statut = (...admis) => (r) => ({ ok: admis.includes(r.status), message: `HTTP ${r.status}` });
  return [
    { id: "ST-LOGIN", requete: { path: "/login" }, verifier: (r) => {
      const bouton = /Continuer avec mon compte ELSATIA/.test(r.corps);
      const mdp = /type="password"/i.test(r.corps);
      return { ok: r.status === 200 && bouton && !mdp, message: `HTTP ${r.status}, bouton ELSATIA ${bouton ? "présent" : "ABSENT"}, champ mot de passe ${mdp ? "PRÉSENT" : "absent"}` };
    } },
    { id: "ST-LOGIN-PROD-LINKS", requete: { path: "/login" }, verifier: (r) => {
      const h = liensProduction(r.corps);
      return { ok: h.length === 0, message: h.length ? `liens vers la Production : ${h.join(", ")}` : "aucun lien vers la Production" };
    } },
    { id: "ST-OPEN-REDIRECT", requete: { path: "/login?next=%2F%2Fevil.example%2Fx" }, verifier: (r) => {
      const depart = /href="\/auth\/elsatia\/start\?next=([^"]*)"/.exec(r.corps)?.[1];
      const cible = depart ? decodeURIComponent(depart.replace(/&amp;/g, "&")) : null;
      return { ok: cible === "/dashboard", message: `destination normalisée : ${cible ?? "introuvable"}` };
    } },
    { id: "ST-HEADERS", requete: { path: "/login" }, verifier: (r) => {
      const manque = [];
      if (!/frame-ancestors 'none'/.test(r.headers["content-security-policy"] ?? "")) manque.push("CSP frame-ancestors");
      if (r.headers["x-frame-options"] !== "DENY") manque.push("X-Frame-Options");
      if (r.headers["x-content-type-options"] !== "nosniff") manque.push("nosniff");
      if (!/no-store/.test(r.headers["cache-control"] ?? "")) manque.push("Cache-Control no-store");
      if (r.https && !/max-age=\d+/.test(r.headers["strict-transport-security"] ?? "")) manque.push("HSTS");
      return { ok: manque.length === 0, message: manque.length ? `manquants : ${manque.join(", ")}` : "CSP, XFO, nosniff, no-store" + (r.https ? ", HSTS" : "") };
    } },
    { id: "ST-SIGNUP-CLOSED", requete: { path: "/signup" }, verifier: redirigeLogin },
    { id: "ST-ROOT", requete: { path: "/" }, verifier: (r) => ({ ok: REDIRECT.includes(r.status) && /^\/(dashboard|login)/.test(r.location ?? ""), message: `HTTP ${r.status} → ${r.location ?? "∅"}` }) },
    ...["/dashboard", "/projects", "/settings", "/settings/members", "/brand-kit", "/onboarding"].map((path) => ({ id: "ST-PROTECTED", requete: { path }, verifier: redirigeLogin })),
    { id: "ST-API-ANON", requete: { path: "/api/projects?workspace=00000000-0000-4000-8000-000000000000" }, verifier: statut(401, 403, 404) },
    { id: "ST-API-CSRF", requete: { path: "/api/projects", method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }, verifier: statut(403) },
    { id: "ST-RECONCILE-401", requete: { path: "/api/elsatia/reconcile", method: "POST" }, verifier: statut(401) },
    { id: "ST-RECONCILE-BAD", requete: { path: "/api/elsatia/reconcile", method: "POST", headers: { authorization: `Bearer ${jeton()}` } }, verifier: statut(401) },
    { id: "ST-ERASURE-401", requete: { path: "/api/elsatia/erasure", method: "POST" }, verifier: statut(401) },
    { id: "ST-LIFECYCLE-FORGED", requete: { path: "/api/elsatia/lifecycle", method: "POST", headers: { "content-type": "application/jose" }, body: `eyJhbGciOiJFUzI1NiJ9.${jeton()}.${jeton()}` }, verifier: statut(400, 401) },
    { id: "ST-EXCHANGE-NO-STATE", requete: { path: "/auth/elsatia/exchange", method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `token=${jeton()}` }, verifier: (r) => ({ ok: r.status === 303 && /^\/login\?error_code=/.test(r.location ?? "") && !r.sessionCookie, message: `HTTP ${r.status} → ${r.location ?? "∅"}${r.sessionCookie ? " + COOKIE DE SESSION" : ""}` }) },
    { id: "ST-HANDOFF-START", requete: { path: "/auth/elsatia/start?next=https%3A%2F%2Fevil.example" }, verifier: (r) => {
      const h = r.locationHost;
      const ok = REDIRECT.includes(r.status) && Boolean(h) && !HOTES_PRODUCTION.includes(h) && h !== "evil.example";
      return { ok, message: `HTTP ${r.status} → ${h ? (HOTES_PRODUCTION.includes(h) ? "identité de PRODUCTION" : h === "evil.example" ? "REDIRECTION OUVERTE" : "identité centrale hors Production") : (r.location ?? "∅")}` };
    } },
    { id: "ST-SHARE-INVENTED", requete: { path: `/s/${jeton()}` }, verifier: (r) => ({ ok: [200, 404].includes(r.status) && /Lien indisponible/.test(r.corps), message: `HTTP ${r.status}` }) },
    { id: "ST-SHARE-MEDIA", requete: { path: `/s/${jeton()}/media` }, verifier: statut(404) },
    { id: "ST-INVITATION-INVENTED", requete: { path: `/invitations/${jeton()}` }, verifier: (r) => ({ ok: [200, 404].includes(r.status) && /Invitation indisponible/.test(r.corps), message: `HTTP ${r.status}` }) },
  ];
}

async function requeter(origin, req, { fetchImpl, bypass }) {
  const headers = { "user-agent": "elsatia-studio-preview-smoke/1", ...(req.headers ?? {}) };
  if (bypass) headers["x-vercel-protection-bypass"] = bypass;
  const r = await fetchImpl(`${origin}${req.path}`, { method: req.method ?? "GET", headers, body: req.body, redirect: "manual", signal: AbortSignal.timeout(20000) });
  const corps = (await r.text()).slice(0, 200000);
  let location = r.headers.get("location");
  let locationHost = null;
  try {
    if (location) { const u = new URL(location, origin); locationHost = u.origin === origin ? null : u.hostname; location = u.origin === origin ? u.pathname + u.search : null; }
  } catch { /* garde tel quel */ }
  const cookies = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : [];
  return {
    status: r.status, location, locationHost, corps, https: origin.startsWith("https:"),
    headers: Object.fromEntries([...r.headers].map(([k, v]) => [k.toLowerCase(), v])),
    sessionCookie: cookies.some((c) => /^sb-[^=]+-auth-token[^=]*=[^;]+/.test(c)),
  };
}

/** Contrôles Supabase Studio anonymes (clé publique seulement). */
async function controlesSupabase(supabaseUrl, cle, { fetchImpl, log }) {
  let erreurs = 0;
  const base = supabaseUrl.replace(/\/+$/, "");
  const h = { apikey: cle, authorization: `Bearer ${cle}`, "content-type": "application/json" };
  const essai = async (id, url, init, verifier) => {
    let res;
    try { const r = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(20000) }); res = verifier(r.status, await r.text()); } catch (e) { res = { ok: false, message: e instanceof Error ? e.name : "erreur réseau" }; }
    if (!res.ok) erreurs += 1;
    log(ligne(res.ok ? "ok" : "ko", id, url.replace(base, "<supabase-studio>"), res.message));
  };
  const email = `studio-smoke-${randomBytes(6).toString("hex")}@example.invalid`;
  await essai("SB-SIGNUP-CLOSED", `${base}/auth/v1/signup`, { method: "POST", headers: h, body: JSON.stringify({ email, password: randomBytes(18).toString("base64url") }) },
    (s, t) => ({ ok: [400, 403, 422].includes(s) && /signup|disabled|not allowed/i.test(t), message: `HTTP ${s}${/signup_disabled/.test(t) ? " signup_disabled" : ""}` }));
  for (const table of ["studio_workspaces", "studio_workspace_members", "studio_projects", "studio_media_assets", "studio_render_shares", "studio_workspace_invitations", "studio_brand_kits"]) {
    await essai("SB-ANON-TABLE", `${base}/rest/v1/${table}?select=*&limit=1`, { headers: h },
      (s, t) => ({ ok: [401, 403, 404].includes(s) || (s === 200 && t.trim() === "[]"), message: `HTTP ${s}${s === 200 ? ` ${t.trim() === "[]" ? "vide" : "LIGNES VISIBLES"}` : ""}` }));
  }
  for (const rpc of ["studio_resolve_invitation", "studio_create_workspace", "studio_invite_member", "studio_revoke_invitation"]) {
    await essai("SB-ANON-RPC", `${base}/rest/v1/rpc/${rpc}`, { method: "POST", headers: h, body: "{}" }, (s) => ({ ok: [401, 403, 404].includes(s), message: `HTTP ${s}` }));
  }
  await essai("SB-ANON-BUCKETS", `${base}/storage/v1/bucket`, { headers: h }, (s, t) => ({ ok: s >= 400 || t.trim() === "[]", message: `HTTP ${s}` }));
  await essai("SB-ANON-OBJECTS", `${base}/storage/v1/object/list/studio-originals`, { method: "POST", headers: h, body: JSON.stringify({ prefix: "", limit: 1 }) },
    (s, t) => ({ ok: s >= 400 || t.trim() === "[]", message: `HTTP ${s}` }));
  return erreurs;
}

export async function executer({ studio, supabaseUrl = null, cle = null }, { fetchImpl = fetch, bypass = null, log = console.log } = {}) {
  let erreurs = 0;
  log("ELSATIA Studio — smoke Preview dédiée (anonyme, aucune donnée créée)\n── studio");
  for (const c of controlesStudio()) {
    let res;
    try { res = c.verifier(await requeter(studio, c.requete, { fetchImpl, bypass })); } catch (e) { res = { ok: false, message: e instanceof Error ? e.name : "erreur réseau" }; }
    if (!res.ok) erreurs += 1;
    log(ligne(res.ok ? "ok" : "ko", c.id, `${c.requete.method ?? "GET"} ${c.requete.path.replace(/\/(s|invitations)\/[A-Za-z0-9_-]{20,}/, "/$1/<inventé>")}`, res.message));
  }
  // JavaScript servi : aucune clé de service.
  try {
    const page = await requeter(studio, { path: "/login" }, { fetchImpl, bypass });
    const scripts = scriptsDePage(page.corps);
    const fuites = new Set();
    for (const s of scripts) for (const f of secretsDansTexte((await requeter(studio, { path: s }, { fetchImpl, bypass })).corps)) fuites.add(f);
    for (const f of secretsDansTexte(page.corps)) fuites.add(f);
    const ok = scripts.length > 0 && fuites.size === 0;
    if (!ok) erreurs += 1;
    log(ligne(ok ? "ok" : "ko", "ST-NO-SERVICE-KEY-IN-JS", `${scripts.length} script(s) de /login`, fuites.size ? `FUITE : ${[...fuites].join(", ")}` : scripts.length ? "aucune clé de service" : "aucun script trouvé"));
  } catch (e) { erreurs += 1; log(ligne("ko", "ST-NO-SERVICE-KEY-IN-JS", "/login", e instanceof Error ? e.name : "erreur")); }
  // /api/health : lot Incident Response absent de ce train → information seulement.
  try {
    const r = await requeter(studio, { path: "/api/health" }, { fetchImpl, bypass });
    log(ligne("info", "ST-HEALTH", "GET /api/health", `HTTP ${r.status} (lot Incident Response non porté : informatif)`));
  } catch { log(ligne("info", "ST-HEALTH", "GET /api/health", "injoignable (informatif)")); }
  if (supabaseUrl && cle) {
    log("── supabase studio (clé publique)");
    erreurs += await controlesSupabase(supabaseUrl, cle, { fetchImpl, log });
  } else log(ligne("info", "SB-SKIPPED", "supabase", "--supabase-url et --env-file (clé publique) non fournis"));
  log(erreurs ? `\nNO-GO : ${erreurs} contrôle(s) en échec.` : "\nGO : smoke Studio Preview conforme.");
  return erreurs ? SORTIE.NO_GO : SORTIE.GO;
}

if (estPointEntree(import.meta.url)) {
  const o = lireOptions(process.argv.slice(2));
  try {
    if (typeof o.studio !== "string") throw new Refus("--studio <origine> requise");
    const studio = o["local-harness"] ? origineBancLocal(o.studio) : exigerOriginePreview(o.studio, { domainePersonnaliseAutorise: Boolean(o["allow-custom-domain"]) });
    if (HOTES_PRODUCTION.includes(new URL(studio).hostname)) throw new Refus("domaine de PRODUCTION : refus");
    let supabaseUrl = null;
    if (typeof o["supabase-url"] === "string") {
      const u = new URL(o["supabase-url"]);
      if (!(u.protocol === "https:" || (o["local-harness"] && ["127.0.0.1", "localhost"].includes(u.hostname)))) throw new Refus("--supabase-url : HTTPS exigé");
      supabaseUrl = u.origin;
    }
    const cle = typeof o["env-file"] === "string" ? chargerFichierEnv(o["env-file"]).NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || null : null;
    if (cle && natureCleSupabase(cle).nature !== "publique") throw new Refus("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY n'est pas une clé publique : refus");
    process.exitCode = await executer({ studio, supabaseUrl, cle }, { bypass: process.env.VERCEL_AUTOMATION_BYPASS_SECRET || null });
  } catch (error) {
    if (error instanceof Refus) { console.error(`REFUS : ${error.message}`); process.exitCode = SORTIE.REFUS; } else throw error;
  }
}
