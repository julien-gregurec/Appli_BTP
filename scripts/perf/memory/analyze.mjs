#!/usr/bin/env node
// ELSATIA_NEXT_MEMORY_CAPACITY_V1 — résumé par phase des échantillons du sampler.
// Usage : node analyze.mjs <out-dir>
import { readFileSync, readdirSync } from "node:fs";
const dir = process.argv[2];
const memFile = readdirSync(dir).find((f) => f.startsWith("mem-") && f.endsWith(".jsonl"));
const all = readFileSync(`${dir}/${memFile}`, "utf8").trim().split("\n").map((l) => JSON.parse(l));
// Échantillonneur v1 : libellés GC décalés (kind 4 = majeur était étiqueté « incremental »).
const v1 = !all.find((r) => r.start)?.v;
const rows = all.filter((r) => r.rss).map((r) => (v1 && r.gc ? { ...r, gc: { minor: r.gc.scavenge, major: r.gc.incremental, incremental: r.gc.weakcb, weakcb: r.gc.minorMS } } : r));
const phases = readFileSync(`${dir}/phases.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l));
let tree = [];
try { tree = readFileSync(`${dir}/tree.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l)); } catch {}
const MB = (b) => (b / 1048576).toFixed(0);
const at = (t) => rows.reduce((best, r) => (Math.abs(r.t - t) < Math.abs(best.t - t) ? r : best), rows[0]);
const fmt = (r) => `rss=${MB(r.rss)} heapUsed=${MB(r.heapUsed)} heapTotal=${MB(r.heapTotal)} ext=${MB(r.external)} ab=${MB(r.arrayBuffers)} anon=${MB(r.rssAnon ?? 0)} file=${MB(r.rssFile ?? 0)}`;
console.log("| phase | durée s | RSS max | RSS fin | heapUsed max | heapTotal max | external max | arrayBuffers max | GC mineur n/ms | GC majeur n/ms | ELD p99 max ms | ELU moy | arbre RSS max |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (let i = 0; i < phases.length - 1; i++) {
  const a = phases[i].t, b = phases[i + 1].t;
  const seg = rows.filter((r) => r.t >= a && r.t < b && !r.mark);
  if (!seg.length) continue;
  const max = (k) => Math.max(...seg.map((r) => r[k] ?? 0));
  const gcs = (k) => seg.reduce((s, r) => [s[0] + (r.gc?.[k]?.n ?? 0), s[1] + (r.gc?.[k]?.ms ?? 0)], [0, 0]);
  const [sn, sms] = gcs("minor"), [mn, mms] = gcs("major");
  const tr = tree.filter((x) => x.t >= a && x.t < b);
  console.log(`| ${phases[i].phase} | ${((b - a) / 1000).toFixed(0)} | ${MB(max("rss"))} | ${MB(seg.at(-1).rss)} | ${MB(max("heapUsed"))} | ${MB(max("heapTotal"))} | ${MB(max("external"))} | ${MB(max("arrayBuffers"))} | ${sn}/${sms.toFixed(0)} | ${mn}/${mms.toFixed(0)} | ${max("eldP99").toFixed(0)} | ${(seg.reduce((s, r) => s + r.elu, 0) / seg.length).toFixed(2)} | ${tr.length ? (Math.max(...tr.map((x) => x.treeRssKb)) / 1024).toFixed(0) : "-"} |`);
}
console.log("\nPoints instantanés :");
for (const p of phases) console.log(`${p.phase.padEnd(14)} ${fmt(at(p.t))}`);
for (const r of rows.filter((r) => r.mark)) console.log(`${r.mark.padEnd(14)} ${fmt(r)}`);
