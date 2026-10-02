#!/usr/bin/env node
// ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1 — poids et coût des pages lourdes, une à une.
//
// Pour chaque route : N GET séquentiels (session GoTrue réelle, cookie @supabase/ssr), sans
// compression (Accept-Encoding: identity, pour mesurer les octets produits par le rendu), puis :
//   TTFB (en-têtes reçus) et durée totale p50/max, octets HTML, et compteurs de structure
//   (<option>, <form>, <details>, actions serveur liées $ACTION_REF / $ACTION_KEY, alertes rendues).
// Aucune écriture. Usage :
//   node poids-pages.mjs --routes /planning,/dashboard,/pointage/gestion --n 5 --out res.json
//   [--compte fixture.principale.1@perf.invalid] [--base http://localhost:3000] [--html-dir dir]
import { mkdirSync, writeFileSync } from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? "1" : arr[i + 1]]);
  return acc;
}, []));
const BASE = args.base ?? "http://localhost:3000";
const SUPA = args.supabase ?? "http://localhost:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const N = Number(args.n ?? 5);
const COMPTE = args.compte ?? "fixture.principale.1@perf.invalid";
const ROUTES = (args.routes ?? "/planning,/dashboard,/pointage/gestion").split(",");
const COOKIE = `sb-${new URL(SUPA).hostname.split(".")[0]}-auth-token`;

function cookieHeader(session) {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const MAX = 3180;
  if (value.length <= MAX) return `${COOKIE}=${value}`;
  const parts = [];
  for (let i = 0; i * MAX < value.length; i++) parts.push(`${COOKIE}.${i}=${value.slice(i * MAX, (i + 1) * MAX)}`);
  return parts.join("; ");
}

const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
  method: "POST", headers: { "content-type": "application/json", apikey: ANON },
  body: JSON.stringify({ email: COMPTE, password: args.password ?? "PiloteTest!2026" }),
});
if (!r.ok) throw new Error(`login ${COMPTE}: ${r.status} ${await r.text()}`);
const cookie = cookieHeader(await r.json());

const compter = (html, motif) => (html.match(motif) ?? []).length;
const med = (a) => { const s = [...a].sort((x, y) => x - y); return Math.round(s[Math.floor(s.length / 2)]); };
const out = {};
for (const route of ROUTES) {
  const ttfb = [], total = [];
  let html = "", status = 0;
  for (let i = 0; i < N; i++) {
    const t0 = performance.now();
    const rep = await fetch(BASE + route, { headers: { cookie, "accept-encoding": "identity" }, redirect: "manual" });
    ttfb.push(performance.now() - t0);
    html = await rep.text();
    total.push(performance.now() - t0);
    status = rep.status;
  }
  out[route] = {
    status, n: N,
    ttfbP50: med(ttfb), ttfbMax: Math.round(Math.max(...ttfb)),
    totalP50: med(total), totalMax: Math.round(Math.max(...total)),
    octets: Buffer.byteLength(html),
    options: compter(html, /<option/g),
    forms: compter(html, /<form/g),
    details: compter(html, /<details/g),
    actionsLiees: compter(html, /\$ACTION_REF_/g),
    actionsCles: compter(html, /\$ACTION_KEY/g),
    alertesRendues: compter(html, /Ouvrir et traiter/g),
  };
  if (args["html-dir"]) {
    mkdirSync(args["html-dir"], { recursive: true });
    writeFileSync(`${args["html-dir"]}/${route.replace(/[^a-z0-9]+/gi, "_")}.html`, html);
  }
  console.log(route, JSON.stringify(out[route]));
}
if (args.out) writeFileSync(args.out, JSON.stringify(out, null, 2));
