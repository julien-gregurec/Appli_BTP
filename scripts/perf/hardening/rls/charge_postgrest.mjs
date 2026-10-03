#!/usr/bin/env node
// ELSATIA PERFORMANCE HARDENING V9.1 — P1-C : charge réelle PostgREST (JWT HS256 signés, rôle
// authenticated, RLS) + contrôle de fuite sur CHAQUE réponse.
//
// Usage :
//   node charge_postgrest.mjs <url> <secret> lecteurs <k> <secondes> <vu1,vu2,...>
//       lectures concurrentes (liste paginée + lecture filtrée) par l'admin du tenant k
//   node charge_postgrest.mjs <url> <secret> multitenant <requêtes> <concurrence> [k,...]
//       requêtes entrelacées entre tenants : listes propres, lectures croisées (attendu : []),
//       comptages ; toute ligne d'un autre tenant = FUITE (code de sortie 2)
//   node charge_postgrest.mjs <url> <secret> endurance <secondes> <concurrence> [k,...]
//       idem multitenant en boucle pendant une durée (long run)
// Sortie : JSON sur stdout.
import { createHmac } from "node:crypto";

const [url, secret, mode, ...args] = process.argv.slice(2);
const ent = (k) => `e0000000-0000-4000-e000-0000000000${k}`;
const adm = (k) => `facc0000-0000-4000-e000-0000000000${k}`;
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(sub) {
  const corps = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 7200 })}`;
  return `${corps}.${createHmac("sha256", secret).update(corps).digest("base64url")}`;
}
const centile = (v, p) => (v.length ? [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor((p / 100) * v.length))] : null);

async function requete(k, chemin, opts = {}) {
  const debut = performance.now();
  const r = await fetch(`${url}${chemin}`, { headers: { authorization: `Bearer ${jwt(adm(k))}`, ...(opts.headers ?? {}) } });
  const texte = await r.text();
  return { statut: r.status, ms: performance.now() - debut, corps: texte, entetes: r.headers };
}

const TABLES = ["devis", "factures", "clients", "documents_chantier", "chantiers"];
function tirage(ks) {
  const k = ks[Math.floor(Math.random() * ks.length)];
  const t = TABLES[Math.floor(Math.random() * TABLES.length)];
  const autres = ks.filter((x) => x !== k);
  const autre = autres[Math.floor(Math.random() * autres.length)];
  const genre = ["liste", "liste", "filtre", "croise", "croise", "compte", "page"][Math.floor(Math.random() * 7)];
  switch (genre) {
    case "liste": return { k, t, genre, chemin: `/${t}?select=id,entreprise_id&order=created_at.desc&limit=50` };
    case "filtre": return { k, t, genre, chemin: `/${t}?select=id,entreprise_id&entreprise_id=eq.${ent(k)}&limit=200` };
    case "page": return { k, t, genre, chemin: `/${t}?select=id,entreprise_id&entreprise_id=eq.${ent(k)}&order=created_at.desc&limit=50&offset=500` };
    case "compte": return { k, t, genre, chemin: `/${t}?select=id&limit=1`, headers: { Prefer: "count=exact" } };
    default: return { k, t, genre, autre, chemin: `/${t}?select=id,entreprise_id&entreprise_id=eq.${ent(autre)}&limit=1000` };
  }
}

async function multitenant({ total, duree, concurrence, ks }) {
  const res = { requetes: 0, erreurs: 0, fuites: 0, croisees_non_vides: 0, par_genre: {}, statuts: {}, ms: [] };
  const fin = duree ? Date.now() + duree * 1000 : Infinity;
  let restantes = total ?? Infinity;
  async function vu() {
    while (restantes-- > 0 && Date.now() < fin) {
      const q = tirage(ks);
      const r = await requete(q.k, q.chemin, { headers: q.headers });
      res.requetes++;
      res.ms.push(r.ms);
      (res.par_genre[q.genre] ??= []).push(r.ms);
      res.statuts[r.statut] = (res.statuts[r.statut] ?? 0) + 1;
      if (r.statut >= 300) { res.erreurs++; continue; }
      const lignes = JSON.parse(r.corps);
      for (const l of lignes) if (l.entreprise_id && l.entreprise_id !== ent(q.k)) res.fuites++;
      if (q.genre === "croise" && lignes.length) res.croisees_non_vides++;
    }
  }
  const debut = Date.now();
  await Promise.all(Array.from({ length: concurrence }, vu));
  const secondes = (Date.now() - debut) / 1000;
  const par_genre = Object.fromEntries(Object.entries(res.par_genre).map(([g, v]) => [g, { n: v.length, p50: Math.round(centile(v, 50)), p95: Math.round(centile(v, 95)) }]));
  return { mode: duree ? "endurance" : "multitenant", tenants: ks, concurrence, secondes, requetes: res.requetes, debit_rps: +(res.requetes / secondes).toFixed(1),
    p50: Math.round(centile(res.ms, 50)), p95: Math.round(centile(res.ms, 95)), max: Math.round(Math.max(...res.ms)),
    erreurs: res.erreurs, statuts: res.statuts, fuites: res.fuites, croisees_non_vides: res.croisees_non_vides, par_genre };
}

async function lecteurs({ k, secondes, vus }) {
  const sortie = [];
  for (const n of vus) {
    const ms = [];
    let erreurs = 0, fuites = 0;
    const fin = Date.now() + secondes * 1000;
    await Promise.all(Array.from({ length: n }, async (_, i) => {
      while (Date.now() < fin) {
        const chemin = i % 2
          ? `/devis?select=id,numero,statut,montant_ttc,entreprise_id&order=created_at.desc&limit=50`
          : `/devis?select=id,numero,statut,montant_ttc,entreprise_id&entreprise_id=eq.${ent(k)}&order=created_at.desc&limit=50&offset=1000`;
        const r = await requete(k, chemin);
        ms.push(r.ms);
        if (r.statut >= 300) { erreurs++; continue; }
        for (const l of JSON.parse(r.corps)) if (l.entreprise_id !== ent(k)) fuites++;
      }
    }));
    sortie.push({ vu: n, requetes: ms.length, debit_rps: +(ms.length / secondes).toFixed(1), p50: Math.round(centile(ms, 50)), p95: Math.round(centile(ms, 95)), erreurs, fuites });
  }
  return { mode: "lecteurs", k, secondes, paliers: sortie };
}

let resultat;
if (mode === "lecteurs") resultat = await lecteurs({ k: args[0], secondes: Number(args[1]), vus: args[2].split(",").map(Number) });
else if (mode === "multitenant") resultat = await multitenant({ total: Number(args[0]), concurrence: Number(args[1]), ks: (args[2] ?? "11,12,13,14,15").split(",") });
else if (mode === "endurance") resultat = await multitenant({ duree: Number(args[0]), concurrence: Number(args[1]), ks: (args[2] ?? "11,12,13,14,15").split(",") });
else { console.error("mode inconnu"); process.exit(1); }
console.log(JSON.stringify(resultat, null, 2));
if (resultat.fuites || resultat.croisees_non_vides || resultat.paliers?.some((p) => p.fuites)) process.exit(2);
