#!/usr/bin/env node
// ELSATIA_NEXT_MEMORY_CAPACITY_V1 — une ligne par run (routes isolées, PDF, limites, allocateur).
// Usage : node summary.mjs <dir> [<dir>...]
import { readFileSync, readdirSync, existsSync } from "node:fs";
const MB = (b) => Math.round(b / 1048576);
console.log("| run | req | req/s | p50 ms | p95 ms | Ko/réponse | RSS max | heapUsed max | heapTotal max | external max | arbre RSS max | RSS après GC | heapUsed après GC | anon après GC |");
console.log("|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|");
for (const dir of process.argv.slice(2)) {
  const f = readdirSync(dir).find((x) => x.startsWith("mem-"));
  if (!f) continue;
  const rows = readFileSync(`${dir}/${f}`, "utf8").trim().split("\n").map((l) => JSON.parse(l)).filter((r) => r.rss);
  const tree = existsSync(`${dir}/tree.jsonl`) ? readFileSync(`${dir}/tree.jsonl`, "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
  const loads = readdirSync(dir).filter((x) => /^load-.*\.json$/.test(x)).map((x) => JSON.parse(readFileSync(`${dir}/${x}`, "utf8")));
  const L = loads.at(-1);
  let kb = 0, n = 0;
  if (L) for (const r of Object.values(L.routes)) { kb += r.kbMoyen * r.n; n += r.n; }
  const ag = rows.filter((r) => r.mark === "after-gc").at(-1) ?? rows.at(-1);
  const max = (k) => MB(Math.max(...rows.map((r) => r[k] ?? 0)));
  const cg = existsSync(`${dir}/cgroup.json`) ? JSON.parse(readFileSync(`${dir}/cgroup.json`, "utf8")) : null;
  const name = dir.split("/").filter(Boolean).at(-1) + (cg ? ` (cg max ${cg.maxUsageMb} Mo, failcnt ${cg.failcnt}, ${cg.oom}, vivant=${cg.serverAlive})` : "");
  console.log(`| ${name} | ${L?.total.n ?? "-"} | ${L?.total.rps ?? "-"} | ${L?.total.p50 ?? "-"} | ${L?.total.p95 ?? "-"} | ${n ? Math.round(kb / n) : "-"} | ${max("rss")} | ${max("heapUsed")} | ${max("heapTotal")} | ${max("external")} | ${tree.length ? Math.round(Math.max(...tree.map((t) => t.treeRssKb)) / 1024) : "-"} | ${MB(ag.rss)} | ${MB(ag.heapUsed)} | ${MB(ag.rssAnon ?? 0)} |`);
}
