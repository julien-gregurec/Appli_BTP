// Outillage commun de la recette métier locale (jamais de Preview/Production).
// Refuse de s'exécuter si l'application ou la base ne sont pas locales.
import { chromium } from "playwright";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";

export const BASE = process.env.RECETTE_BASE_URL ?? "http://127.0.0.1:3000";
export const DB_URL = process.env.RECETTE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
export const OUT = process.env.RECETTE_OUT ?? "/tmp/claude-0/recette";
for (const u of [BASE, DB_URL]) {
  if (!/127\.0\.0\.1|localhost/.test(u)) throw new Error(`Recette refusée : cible non locale ${u}`);
}
fs.mkdirSync(OUT, { recursive: true });

// Clé publique « anon » de la base locale : lue dans l'environnement ou .env.local, jamais en dur.
export const SUPABASE_URL = process.env.RECETTE_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const SUPABASE_ANON = process.env.RECETTE_SUPABASE_ANON_KEY ?? (() => {
  try { return fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").match(/^NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)$/m)?.[1]?.trim(); } catch { return undefined; }
})();
if (!/127\.0\.0\.1|localhost/.test(SUPABASE_URL)) throw new Error(`Recette refusée : Supabase non local ${SUPABASE_URL}`);

export const MDP = "Recette!Alsace2026";
export const COMPTES = {
  gerant: { email: "gerant@alsace-test-btp.test", prenom: "Gérard", nom: "Muller", modele: "gerant" },
  conducteur: { email: "conducteur@alsace-test-btp.test", prenom: "Claire", nom: "Schmitt", modele: "conducteur_travaux" },
  chef: { email: "chef@alsace-test-btp.test", prenom: "Hans", nom: "Weber", modele: "chef_chantier" },
  salarie: { email: "salarie@alsace-test-btp.test", prenom: "Luc", nom: "Meyer", modele: "ouvrier" },
  comptable: { email: "comptable@alsace-test-btp.test", prenom: "Sophie", nom: "Klein", modele: "comptable" },
  limite: { email: "limite@alsace-test-btp.test", prenom: "Paul", nom: "Fischer", modele: null },
};

let pool;
export function db() { pool ??= new pg.Pool({ connectionString: DB_URL, max: 4 }); return pool; }
export async function q(sql, params = []) { return (await db().query(sql, params)).rows; }
export async function q1(sql, params = []) { return (await q(sql, params))[0]; }

// ---------- Résultats ----------
const resultsFile = path.join(OUT, "results.jsonl");
export function record(parcours, nom, ok, detail = "") {
  const statut = ok === null ? "SKIP" : ok ? "PASS" : "FAIL";
  fs.appendFileSync(resultsFile, JSON.stringify({ ts: new Date().toISOString(), parcours, nom, statut, detail: String(detail).slice(0, 600) }) + "\n");
  console.log(`[${statut}] ${parcours} :: ${nom}${detail ? " — " + String(detail).slice(0, 200) : ""}`);
  return ok;
}
export async function check(parcours, nom, fn) {
  try { const r = await fn(); if (r === undefined || r === true) return record(parcours, nom, true);
    if (r === null) return record(parcours, nom, null, "non applicable");
    if (typeof r === "string") return record(parcours, nom, false, r);
    return record(parcours, nom, r.ok, r.detail ?? "");
  } catch (e) { return record(parcours, nom, false, e?.message ?? e); }
}
export function bug(id, gravite, titre, data) {
  fs.appendFileSync(path.join(OUT, "bugs.jsonl"), JSON.stringify({ id, gravite, titre, ...data }) + "\n");
  console.log(`[BUG ${gravite}] ${id} ${titre}`);
}
export const eq2 = (a, b, tol = 0.005) => Math.abs(Number(a) - Number(b)) <= tol;
export const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ---------- Navigateur ----------
let browser;
export async function navigateur() {
  browser ??= await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  return browser;
}
export async function fermer() { await browser?.close(); await pool?.end(); }

export function etatSession(role) { return path.join(OUT, `session-${role}.json`); }

export async function contexte(role, opts = {}) {
  const b = await navigateur();
  const storageState = role && fs.existsSync(etatSession(role)) ? etatSession(role) : undefined;
  const ctx = await b.newContext({ baseURL: BASE, locale: "fr-FR", timezoneId: "Europe/Paris", storageState, viewport: opts.viewport ?? { width: 1440, height: 900 }, ...opts });
  ctx.setDefaultTimeout(opts.timeout ?? 20000);
  return ctx;
}

export async function connecter(role, { email, motDePasse = MDP } = {}) {
  const compte = COMPTES[role];
  const ctx = await contexte(null);
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.fill('input[name="email"]', email ?? compte.email);
  await page.fill('input[name="password"]', motDePasse);
  await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 }).catch(() => {}), page.click('button[type="submit"]')]);
  await ctx.storageState({ path: etatSession(role) });
  return { ctx, page };
}

export async function capture(page, nom) {
  const f = path.join(OUT, "captures", `${nom}.png`);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  await page.screenshot({ path: f, fullPage: true }).catch(() => {});
  return f;
}

// Collecte des erreurs console / réseau d'une page.
export function surveiller(page, etiquette) {
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error" && !m.location()?.url?.includes("/monitoring") && !/status of 403/.test(m.text())) erreurs.push(`console: ${m.text().slice(0, 200)}`); });
  page.on("response", (r) => { if (r.url().includes("/monitoring")) return; if (r.status() >= 500) erreurs.push(`HTTP ${r.status()} ${r.url()}`); });
  page.__erreurs = erreurs; page.__etiquette = etiquette;
  return erreurs;
}

// Message flash de l'application (?success= / ?error=).
export function flash(page) {
  const u = new URL(page.url());
  return { success: u.searchParams.get("success") ?? u.searchParams.get("message"), error: u.searchParams.get("error") };
}

export async function entrepriseId() {
  return (await q1("select id from entreprises where nom='ALSACE TEST BTP' order by created_at limit 1"))?.id;
}
