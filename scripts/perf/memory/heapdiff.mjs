#!/usr/bin/env node
// ELSATIA_NEXT_MEMORY_CAPACITY_V1 — comparaison de heap snapshots V8.
// Agrège (type, nom) -> nombre d'objets et taille propre, puis affiche les plus
// fortes croissances entre A et B. Usage :
//   node --max-old-space-size=8192 heapdiff.mjs A.heapsnapshot B.heapsnapshot [top=30]
//   node --max-old-space-size=8192 heapdiff.mjs A.heapsnapshot            (résumé seul)
import { readFileSync } from "node:fs";

function load(file) {
  const snap = JSON.parse(readFileSync(file, "utf8"));
  const m = snap.snapshot.meta;
  const nf = m.node_fields.length;
  const iType = m.node_fields.indexOf("type"), iName = m.node_fields.indexOf("name"), iSize = m.node_fields.indexOf("self_size");
  const types = m.node_types[iType];
  const agg = new Map();
  let total = 0, count = 0;
  const nodes = snap.nodes, strings = snap.strings;
  for (let i = 0; i < nodes.length; i += nf) {
    const type = types[nodes[i + iType]];
    let name = strings[nodes[i + iName]];
    if (type === "string" || type === "concatenated string" || type === "sliced string") name = "(string)";
    else if (type === "code") name = "(code)";
    else if (type === "number" || type === "hidden" || type === "array") name = name.length > 60 ? name.slice(0, 60) : name;
    else if (type === "closure") name = `closure ${name}`.slice(0, 80);
    else name = name.slice(0, 80);
    const k = `${type}\t${name}`;
    const e = agg.get(k) ?? { n: 0, size: 0 };
    e.n += 1; e.size += nodes[i + iSize];
    agg.set(k, e);
    total += nodes[i + iSize]; count += 1;
  }
  return { agg, total, count };
}
const [a, b, top = "30"] = process.argv.slice(2);
const A = load(a);
const fmt = (x) => (x / 1048576).toFixed(2) + " MB";
console.log(`A: ${a}\n   ${A.count} objets, ${fmt(A.total)}`);
if (!b) {
  for (const [k, v] of [...A.agg].sort((x, y) => y[1].size - x[1].size).slice(0, Number(top))) console.log(`${fmt(v.size).padStart(11)} ${String(v.n).padStart(8)}  ${k}`);
  process.exit(0);
}
const B = load(b);
console.log(`B: ${b}\n   ${B.count} objets, ${fmt(B.total)}  (Δ ${fmt(B.total - A.total)}, Δ objets ${B.count - A.count})`);
const keys = new Set([...A.agg.keys(), ...B.agg.keys()]);
const d = [...keys].map((k) => {
  const x = A.agg.get(k) ?? { n: 0, size: 0 }, y = B.agg.get(k) ?? { n: 0, size: 0 };
  return { k, dn: y.n - x.n, ds: y.size - x.size, n: y.n, s: y.size };
});
console.log("\nPlus fortes croissances (taille propre) :");
for (const r of d.sort((x, y) => y.ds - x.ds).slice(0, Number(top))) console.log(`${fmt(r.ds).padStart(11)} ${String(r.dn).padStart(8)} obj  (B: ${r.n} / ${fmt(r.s)})  ${r.k}`);
console.log("\nPlus fortes croissances (nombre d'objets) :");
for (const r of d.sort((x, y) => y.dn - x.dn).slice(0, Number(top))) console.log(`${String(r.dn).padStart(8)} obj ${fmt(r.ds).padStart(11)}  (B: ${r.n})  ${r.k}`);
