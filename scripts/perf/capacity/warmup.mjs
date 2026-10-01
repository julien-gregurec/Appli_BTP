#!/usr/bin/env node
// ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1 — chauffe d'une instance `next start` AVANT l'ouverture
// du trafic (à brancher sur la sonde de disponibilité / le hook de démarrage du déploiement).
//
// Pourquoi (ELSATIA_NEXT_MEMORY_CAPACITY_V1 § 5.3) : une rafale sur un serveur qui n'a encore rendu
// aucune page laisse des portées de requête retenues par le cache de déduplication fetch de Next
// (bornée, unique, mais 130 à 400 Mo de heap) et sert les premières requêtes lentement (compilation
// JIT, chargement paresseux des modules de route). Un passage séquentiel sur les routes lourdes,
// authentifié, avant le trafic, l'évite.
//
// Séquentiel, un seul utilisateur, lecture seule. Usage :
//   node warmup.mjs [--base http://localhost:3000] [--compte e-mail --password …] [--tours 2]
// Sans compte (ou si la connexion échoue), seules les routes publiques sont chauffées.
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? "1" : arr[i + 1]]);
  return acc;
}, []));
const BASE = args.base ?? "http://localhost:3000";
const SUPA = args.supabase ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://localhost:54321";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const TOURS = Number(args.tours ?? 2);
const COOKIE = `sb-${new URL(SUPA).hostname.split(".")[0]}-auth-token`;

function cookieHeader(session) {
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const MAX = 3180;
  if (value.length <= MAX) return `${COOKIE}=${value}`;
  const parts = [];
  for (let i = 0; i * MAX < value.length; i++) parts.push(`${COOKIE}.${i}=${value.slice(i * MAX, (i + 1) * MAX)}`);
  return parts.join("; ");
}

let cookie = "";
let premierDevis = null, premiereFacture = null, premierChantier = null;
if (args.compte) {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { "content-type": "application/json", apikey: ANON },
    body: JSON.stringify({ email: args.compte, password: args.password }),
  });
  if (r.ok) {
    const session = await r.json();
    cookie = cookieHeader(session);
    const un = async (table) => {
      const x = await fetch(`${SUPA}/rest/v1/${table}?select=id&order=created_at.desc&limit=1`, { headers: { apikey: ANON, authorization: `Bearer ${session.access_token}` } });
      return x.ok ? (await x.json())[0]?.id ?? null : null;
    };
    [premierDevis, premiereFacture, premierChantier] = await Promise.all([un("devis"), un("factures"), un("chantiers")]);
  } else console.warn(`warmup: connexion impossible (${r.status}), routes publiques seulement`);
}

const routes = ["/login", "/api/health"];
if (cookie) {
  routes.push("/dashboard", "/planning", "/devis", "/factures", "/chantiers", "/clients", "/pointage", "/pointage/gestion");
  if (premierDevis) routes.push(`/devis/${premierDevis}`);
  if (premiereFacture) routes.push(`/factures/${premiereFacture}`);
  if (premierChantier) routes.push(`/chantiers/${premierChantier}`);
}

const debut = performance.now();
const resultats = [];
for (let tour = 1; tour <= TOURS; tour++) {
  for (const route of routes) {
    const t0 = performance.now();
    let statut = "ERR";
    try {
      const r = await fetch(BASE + route, { headers: cookie ? { cookie } : {}, redirect: "manual" });
      statut = r.status;
      await r.arrayBuffer();
    } catch {}
    resultats.push({ tour, route: route.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/, "[id]"), statut, ms: Math.round(performance.now() - t0) });
  }
}
console.log(JSON.stringify({ event: "warmup", duree_ms: Math.round(performance.now() - debut), resultats }));
