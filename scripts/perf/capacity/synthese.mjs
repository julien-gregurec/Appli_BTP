#!/usr/bin/env node
// ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1 — synthèse d'un ou plusieurs runs de run-protocol.sh.
// Une ligne par run (et par palier) : débit, latences, erreurs, mémoire (RSS, heap, arbre de
// processus avec Chromium), plafond de heap V8 effectif, limite cgroup et survie du serveur.
// Usage : node synthese.mjs <dir> [<dir>...]   (sortie Markdown)
import { existsSync, readdirSync, readFileSync } from "node:fs";

const MB = (b) => Math.round(b / 1048576);
const lignes = (f) => (existsSync(f) ? readFileSync(f, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

console.log("| run | palier | req | req/s | p50 ms | p95 ms | p99 ms | erreurs (5xx/ERR) | PDF 200 / 503 / autres | RSS max | heapUsed max | arbre RSS max | heap_size_limit | RSS après GC | heapUsed après GC | cgroup |");
console.log("|---|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---|");
for (const dir of process.argv.slice(2)) {
  const nom = dir.split("/").filter(Boolean).at(-1);
  const f = existsSync(dir) ? readdirSync(dir).find((x) => x.startsWith("mem-")) : null;
  const rows = f ? lignes(`${dir}/${f}`).filter((r) => r.rss) : [];
  const phases = lignes(`${dir}/phases.jsonl`);
  const tree = lignes(`${dir}/tree.jsonl`);
  const cg = existsSync(`${dir}/cgroup.json`) ? JSON.parse(readFileSync(`${dir}/cgroup.json`, "utf8")) : null;
  const apresGc = rows.filter((r) => r.mark === "after-gc").at(-1);
  const heapLimit = rows.find((r) => r.heapLimit)?.heapLimit;
  const paliers = existsSync(dir) ? readdirSync(dir).filter((x) => /^load-\d+(-c\d+)?\.json$/.test(x)) : [];
  for (const fichier of paliers.sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)))) {
    const P = fichier.match(/^load-(\d+)/)[1];
    const L = JSON.parse(readFileSync(`${dir}/${fichier}`, "utf8"));
    const debut = phases.find((p) => p.phase === `load-${P}`)?.t ?? 0;
    const fin = phases.find((p) => p.phase === `end-load-${P}`)?.t ?? Infinity;
    const seg = rows.filter((r) => r.t >= debut && r.t <= fin);
    const segTree = tree.filter((t) => t.t >= debut && t.t <= fin);
    let erreurs = 0;
    for (const r of Object.values(L.routes)) for (const [s, n] of Object.entries(r.status)) if (s === "ERR" || Number(s) >= 500) erreurs += n;
    const pdfFichier = `${dir}/load-pdf-${P}.json`;
    let pdf = "-";
    if (existsSync(pdfFichier)) {
      const Lp = JSON.parse(readFileSync(pdfFichier, "utf8"));
      const st = {};
      for (const r of Object.values(Lp.routes)) for (const [s, n] of Object.entries(r.status)) st[s] = (st[s] ?? 0) + n;
      const autres = Object.entries(st).filter(([s]) => s !== "200" && s !== "503").map(([s, n]) => `${s}:${n}`).join(" ");
      pdf = `${st["200"] ?? 0} / ${st["503"] ?? 0} / ${autres || "0"} (p50 ${Lp.total.p50 ?? "-"} ms)`;
    }
    const max = (k) => (seg.length ? MB(Math.max(...seg.map((r) => r[k] ?? 0))) : "-");
    console.log(`| ${nom} | ${P} | ${L.total.n} | ${L.total.rps} | ${L.total.p50 ?? "-"} | ${L.total.p95 ?? "-"} | ${L.total.p99 ?? "-"} | ${erreurs} | ${pdf} | ${max("rss")} | ${max("heapUsed")} | ${segTree.length ? Math.round(Math.max(...segTree.map((t) => t.treeRssKb)) / 1024) : "-"} | ${heapLimit ? MB(heapLimit) : "-"} | ${apresGc ? MB(apresGc.rss) : "-"} | ${apresGc ? MB(apresGc.heapUsed) : "-"} | ${cg ? `${cg.limitMb} Mo, pic ${cg.maxUsageMb}, ${/oom_kill [1-9]/.test(cg.oom) ? "**OOM kill**" : "pas d'OOM"}, ${cg.serverAlive ? "vivant" : "**mort**"}` : "-"} |`);
  }
}
