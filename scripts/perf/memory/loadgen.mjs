#!/usr/bin/env node
// ELSATIA_NEXT_MEMORY_CAPACITY_V1 — générateur de charge authentifié (sans dépendance).
//
// Chaque utilisateur virtuel (VU) ouvre une vraie session GoTrue (grant_type=password),
// en déduit le cookie @supabase/ssr (sb-<ref>-auth-token, base64url, découpé en
// morceaux comme le fait @supabase/ssr), puis enchaîne des GET de pages RSC réelles
// avec un temps de réflexion aléatoire. Aucune donnée écrite.
//
// Usage :
//   node loadgen.mjs --users 25 --duration 120 --think 2000 --scenario mix --out res.json
// Scénarios : mix (défaut), dashboard, planning, devis, factures, pointages, chantiers, pdf
import { writeFileSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? "1" : arr[i + 1]]);
  return acc;
}, []));
const BASE = args.base ?? "http://localhost:3000";
const SUPA = args.supabase ?? "http://localhost:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const USERS = Number(args.users ?? 1);
const DURATION = Number(args.duration ?? 60) * 1000;
const THINK = Number(args.think ?? 2000);
const SCENARIO = args.scenario ?? "mix";
const PASSWORD = args.password ?? "PiloteTest!2026";
// --pdf-ids id1,id2 : devis ciblés par le scénario pdf (ex. devis lourds 500/1000 lignes).
const PDF_IDS = (args["pdf-ids"] ?? "").split(",").filter(Boolean);
// --identity : demande une réponse non compressée (Accept-Encoding: identity), pour
// isoler le coût de la compression gzip de `next start`.
const ENCODAGE = args.identity ? { "accept-encoding": "identity" } : {};
const REF = new URL(SUPA).hostname.split(".")[0];
const COOKIE = `sb-${REF}-auth-token`;

// Comptes : tenant A lourd (20), tenant B (4), tenant pilote (4). Au-delà, sessions
// multiples sur les mêmes comptes (comme plusieurs appareils).
const COMPTES = [
  ...Array.from({ length: 20 }, (_, i) => `fixture.principale.${i + 1}@perf.invalid`),
  ...Array.from({ length: 4 }, (_, i) => `fixture.secondaire.${i + 1}@perf.invalid`),
  "pilote.karim.haddad@example.test", "pilote.nadia.ferreira@example.test", "pilote.farid.amrani@example.test", "pilote.rachid.belkacem@example.test",
];
const ORDRE = (args.accounts ?? "mix") === "heavy" ? COMPTES.slice(0, 20) : COMPTES;

function cookieHeader(session) {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const MAX = 3180;
  if (value.length <= MAX) return `${COOKIE}=${value}`;
  const parts = [];
  for (let i = 0; i * MAX < value.length; i++) parts.push(`${COOKIE}.${i}=${value.slice(i * MAX, (i + 1) * MAX)}`);
  return parts.join("; ");
}

async function login(email) {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { "content-type": "application/json", apikey: ANON }, body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function ids(session, table, n = 200) {
  const r = await fetch(`${SUPA}/rest/v1/${table}?select=id&order=created_at.desc&limit=${n}`, {
    headers: { apikey: ANON, authorization: `Bearer ${session.access_token}` },
  });
  return r.ok ? (await r.json()).map((x) => x.id) : [];
}

const pick = (a) => a[Math.floor(Math.random() * a.length)];

function routesFor(ctx) {
  // Compte sans accès (liste vide) : on retombe sur la page liste plutôt que /devis/undefined.
  const d = () => (ctx.devis.length ? `/devis/${pick(ctx.devis)}` : "/devis");
  const f = () => (ctx.factures.length ? `/factures/${pick(ctx.factures)}` : "/factures");
  const c = () => (ctx.chantiers.length ? `/chantiers/${pick(ctx.chantiers)}` : "/chantiers");
  const S = {
    dashboard: [["/dashboard", 1]],
    planning: [["/planning", 1]],
    devis: [["/devis", 1], [d, 2]],
    factures: [["/factures", 1], [f, 2]],
    pointages: [["/pointage", 1], ["/pointage/gestion", 1]],
    chantiers: [["/chantiers", 1], [c, 2]],
    pdf: [[() => `/api/documents/devis/${pick(PDF_IDS.length ? PDF_IDS : ctx.devis)}/pdf`, 1]],
    mix: [["/dashboard", 4], ["/planning", 2], ["/devis", 2], [d, 3], ["/factures", 2], [f, 2], ["/pointage", 2], ["/pointage/gestion", 1], ["/chantiers", 1], [c, 1], ["/clients", 1]],
  };
  const liste = S[SCENARIO] ?? S.mix;
  const total = liste.reduce((s, [, w]) => s + w, 0);
  return () => {
    let x = Math.random() * total;
    for (const [r, w] of liste) { if ((x -= w) <= 0) return typeof r === "function" ? r() : r; }
    return liste[0][0];
  };
}

const stats = new Map();
function note(route, ms, status, bytes) {
  const k = route.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, "[id]");
  const s = stats.get(k) ?? { lat: [], status: {}, bytes: 0 };
  s.lat.push(ms); s.status[status] = (s.status[status] ?? 0) + 1; s.bytes += bytes;
  stats.set(k, s);
}

async function vu(i, fin) {
  const email = ORDRE[i % ORDRE.length];
  const session = await login(email);
  const ctx = { devis: await ids(session, "devis"), factures: await ids(session, "factures"), chantiers: await ids(session, "chantiers") };
  const next = routesFor(ctx);
  const cookie = cookieHeader(session);
  await new Promise((r) => setTimeout(r, Math.random() * Math.min(THINK, 2000)));
  while (Date.now() < fin) {
    const route = next();
    const t0 = performance.now();
    let status = 0, bytes = 0;
    try {
      const r = await fetch(BASE + route, { headers: { cookie, ...ENCODAGE }, redirect: "manual" });
      status = r.status;
      bytes = (await r.arrayBuffer()).byteLength;
    } catch (e) { status = "ERR"; }
    note(route, performance.now() - t0, status, bytes);
    if (THINK) await new Promise((r) => setTimeout(r, THINK * (0.5 + Math.random())));
  }
}

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]) : null; };

const t0 = Date.now();
const fin = t0 + DURATION;
const res = await Promise.allSettled(Array.from({ length: USERS }, (_, i) => vu(i, fin)));
const erreurs = res.filter((r) => r.status === "rejected").map((r) => String(r.reason).slice(0, 200));
const out = { users: USERS, scenario: SCENARIO, think: THINK, durationS: (Date.now() - t0) / 1000, erreursVU: erreurs, routes: {} };
let all = [];
for (const [k, s] of stats) {
  all = all.concat(s.lat);
  out.routes[k] = { n: s.lat.length, p50: pct(s.lat, 50), p95: pct(s.lat, 95), p99: pct(s.lat, 99), max: pct(s.lat, 100), status: s.status, kbMoyen: Math.round(s.bytes / s.lat.length / 1024) };
}
out.total = { n: all.length, rps: Number((all.length / out.durationS).toFixed(2)), p50: pct(all, 50), p95: pct(all, 95), p99: pct(all, 99) };
if (args.out) writeFileSync(args.out, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out.total), erreurs.length ? `VU errors: ${erreurs.length} ${erreurs[0]}` : "");
if (args.verbose) console.log(JSON.stringify(out.routes, null, 1));
