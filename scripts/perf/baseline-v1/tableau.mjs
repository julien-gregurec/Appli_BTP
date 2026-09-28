/*
 * ELSATIA — Baseline performance V1 : résultats de bench-http.mjs → tableau Markdown
 * (p50 / p95 / p99 / max en ms, statuts, poids moyen du document).
 * Usage : node tableau.mjs fichier.json [fichier2.json …]
 */
import fs from "node:fs";
const ms = (v) => (v === null || v === undefined ? "—" : Math.round(v).toLocaleString("fr-FR"));
const ko = (v) => (v === null || v === undefined ? "—" : v >= 1e6 ? `${(v / 1e6).toFixed(1)} Mo` : `${Math.round(v / 1e3)} ko`);
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(fs.readFileSync(f));
  console.log(`\n**${f.split("/").pop()}** — ${j.users} utilisateur(s), ${j.requetes} requêtes, ${j.erreurs} erreur(s), ${j.debit_rps.toFixed(1)} req/s, ${j.duree_s.toFixed(0)} s\n`);
  console.log("| Route | n | p50 | p95 | p99 | max | statuts | poids |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const [c, s] of Object.entries(j.chemins)) {
    const route = c.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id");
    console.log(`| \`${route}\` | ${s.n} | ${ms(s.p50)} | ${ms(s.p95)} | ${ms(s.p99)} | ${ms(s.max)} | ${Object.entries(s.statuts).map(([k, v]) => `${k}×${v}`).join(" ")} | ${ko(s.octets_moyens)} |`);
  }
}
