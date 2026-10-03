// ELSATIA SOAK V1 — Domaine I : dérive mémoire de `next start` sur les pages lourdes.
// Pour chaque page : séries cumulées de 100, 500 puis 1000 requêtes (concurrence 10),
// GC forcé à chaque palier, RSS/heap après GC. Comptes : tenant A (fixture), T14 (50 000
// devis/factures), T22 (500 salariés). Usage : MEM_SAMPLER_DIR=... node domain_i_memoire.mjs [paliers=100,500,1000]
import { connecter, page } from "./lib/session.mjs";
import { load, stats } from "./lib/bench.mjs";
import { apresGc, picRss } from "./lib/memoire.mjs";
const PALIERS = (process.argv[2] ?? "100,500,1000").split(",").map(Number);
const comptes = {
  A: await connecter("fixture.principale.1@perf.invalid"),
  T14: await connecter("soak.t14.u1@soak.invalid"),
  T22: await connecter("soak.t22.u1@soak.invalid"),
};
const PAGES = [
  ["dashboard_T14_50k", "T14", "/dashboard"], ["dashboard_A", "A", "/dashboard"],
  ["planning_T22_500sal", "T22", "/planning"], ["pointage_gestion_T22", "T22", "/pointage/gestion?mois=2026-09"],
  ["employes_T22", "T22", "/employes"], ["devis_T14", "T14", "/devis"], ["factures_T14", "T14", "/factures"],
];
const FILTRE = process.argv[3] ? process.argv[3].split(",") : null;
const out = { depart: await apresGc(), pages: {} };
for (const [nom, c, chemin] of PAGES.filter(([n]) => !FILTRE || FILTRE.includes(n))) {
  const r = (out.pages[nom] = { chemin, paliers: [] }); let fait = 0; const t0 = Date.now();
  for (const p of PALIERS) {
    const rs = await load(p - fait, 10, () => page(comptes[c].cookie, chemin));
    fait = p;
    const codes = {}; for (const x of rs) { const k = x.err ?? x.status; codes[k] = (codes[k] ?? 0) + 1; }
    r.paliers.push({ requetes: p, ...stats(rs), codes, ...picRss(t0), apres_gc: await apresGc() });
    console.error(nom, JSON.stringify(r.paliers.at(-1)));
  }
}
out.fin = await apresGc();
console.log(JSON.stringify(out, null, 1));
