// ELSATIA_NEXT_MEMORY_CAPACITY_V1 — échantillonneur mémoire in-process.
// Préchargé dans le processus serveur Next (`node --expose-gc -r ./sampler.cjs
// node_modules/next/dist/bin/next start`). Inactif si MEM_SAMPLER_DIR est absent.
//
// Écrit une ligne JSON par seconde dans $MEM_SAMPLER_DIR/mem-<pid>.jsonl :
// rss, heapUsed, heapTotal, external, arrayBuffers, délai de boucle
// d'événements (p50/p99/max), ELU, GC (nombre et durée par type depuis
// l'échantillon précédent).
//
// Commandes (fichier $MEM_SAMPLER_DIR/cmd, lu puis supprimé à chaque tick) :
//   gc              -> global.gc() complet (si --expose-gc), échantillon marqué
//   snap:<label>    -> gc puis v8.writeHeapSnapshot(<dir>/heap-<label>-<pid>.heapsnapshot)
/* eslint-disable @typescript-eslint/no-require-imports -- module CommonJS préchargé par `node -r` (train V9) : require() est la seule forme possible ici. */
"use strict";
const dir = process.env.MEM_SAMPLER_DIR;
if (dir) {
  const fs = require("node:fs");
  const path = require("node:path");
  const v8 = require("node:v8");
  const { monitorEventLoopDelay, PerformanceObserver, performance } = require("node:perf_hooks");
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `mem-${process.pid}.jsonl`);
  const cmdFile = path.join(dir, "cmd");
  const argv = process.argv.slice(1).join(" ");
  fs.appendFileSync(out, JSON.stringify({ t: Date.now(), start: true, v: 2, pid: process.pid, argv }) + "\n");

  const eld = monitorEventLoopDelay({ resolution: 10 });
  eld.enable();
  let elu = performance.eventLoopUtilization();
  // perf_hooks.constants : NODE_PERFORMANCE_GC_MINOR=1, MAJOR=4, INCREMENTAL=8, WEAKCB=16.
  const KIND = { 1: "minor", 4: "major", 8: "incremental", 16: "weakcb" };
  let gc = {};
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      const k = KIND[e.detail?.kind ?? e.kind] ?? String(e.detail?.kind ?? e.kind);
      const g = (gc[k] ||= { n: 0, ms: 0 });
      g.n += 1;
      g.ms += e.duration;
    }
  }).observe({ entryTypes: ["gc"] });

  const sample = (mark) => {
    const m = process.memoryUsage();
    const nextElu = performance.eventLoopUtilization();
    const d = performance.eventLoopUtilization(nextElu, elu);
    elu = nextElu;
    const hs = v8.getHeapStatistics();
    let rssAnon = null, rssFile = null;
    try {
      const st = fs.readFileSync("/proc/self/status", "utf8");
      rssAnon = Number(/RssAnon:\s+(\d+)/.exec(st)?.[1]) * 1024;
      rssFile = Number(/RssFile:\s+(\d+)/.exec(st)?.[1]) * 1024;
    } catch {}
    const line = {
      t: Date.now(),
      rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, external: m.external, arrayBuffers: m.arrayBuffers, rssAnon, rssFile,
      heapLimit: hs.heap_size_limit, mallocedMemory: hs.malloced_memory, nativeContexts: hs.number_of_native_contexts,
      eldP50: eld.percentile(50) / 1e6, eldP99: eld.percentile(99) / 1e6, eldMax: eld.max / 1e6,
      elu: Number(d.utilization.toFixed(4)),
      gc,
      handles: process._getActiveHandles?.().length,
      ...(mark ? { mark } : {}),
    };
    gc = {};
    eld.reset();
    fs.appendFileSync(out, JSON.stringify(line) + "\n");
  };

  const tick = () => {
    let cmd = null;
    try { cmd = fs.readFileSync(cmdFile, "utf8").trim(); fs.unlinkSync(cmdFile); } catch {}
    if (cmd === "gc" && global.gc) {
      sample("before-gc");
      global.gc(); global.gc();
      sample("after-gc");
      return;
    }
    if (cmd && cmd.startsWith("snap:")) {
      const label = cmd.slice(5).replace(/[^a-zA-Z0-9_-]/g, "_");
      if (global.gc) { global.gc(); global.gc(); }
      sample(`snap-${label}`);
      const file = v8.writeHeapSnapshot(path.join(dir, `heap-${label}-${process.pid}.heapsnapshot`));
      fs.appendFileSync(out, JSON.stringify({ t: Date.now(), snapshot: file }) + "\n");
      return;
    }
    sample();
  };
  setInterval(tick, 1000).unref();
}
