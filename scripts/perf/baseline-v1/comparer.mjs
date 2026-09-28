/*
 * ELSATIA — Baseline performance V1 : tableau condensé avant → après (p50 / p95 / p99, ms) à partir
 * de paires de résultats bench-http.mjs. Usage : node comparer.mjs "Étiquette=avant.json:apres.json" …
 */
import fs from "node:fs";
const lire = (f) => JSON.parse(fs.readFileSync(f)).chemins;
const norme = (c) => c.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, ":id");
const fmt = (s) => (s && s.p50 !== null ? `${Math.round(s.p50)} / ${Math.round(s.p95)} / ${Math.round(s.p99)}` : `échec (${s ? Object.keys(s.statuts).join("/") : "—"})`);
const paires = process.argv.slice(2).map((a) => { const [etq, fichiers] = a.split("="); const [av, ap] = fichiers.split(":"); return { etq, av: lire(av), ap: lire(ap) }; });
const routes = [...new Set(paires.flatMap((p) => [...Object.keys(p.av), ...Object.keys(p.ap)].map(norme)))].filter((r) => !r.startsWith("POST"));
console.log(`| Route | ${paires.map((p) => `${p.etq} V5 | ${p.etq} après`).join(" | ")} |`);
console.log(`|---|${paires.map(() => "---|---").join("|")}|`);
for (const r of routes) {
  const cell = (m) => fmt(Object.entries(m).find(([c]) => norme(c) === r)?.[1]);
  console.log(`| \`${r}\` | ${paires.map((p) => `${cell(p.av)} | ${cell(p.ap)}`).join(" | ")} |`);
}
