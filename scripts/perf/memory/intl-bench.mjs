#!/usr/bin/env node
// ELSATIA_NEXT_MEMORY_CAPACITY_V1 — micro-banc : coût mémoire natif de
// `new Intl.DateTimeFormat(...)` par appel vs instance réutilisée.
// Usage : node --expose-gc intl-bench.mjs <mode> [n=200000]
// Modes : par-appel, reutilise, toLocaleDateString, toLocaleString-sans-options,
//         number-par-appel, toLocaleString-nombre
const mode = process.argv[2] ?? "par-appel";
const n = Number(process.argv[3] ?? 200000);
const MB = (b) => Math.round(b / 1048576);
const snap = (l) => { const m = process.memoryUsage(); console.log(`${l.padEnd(12)} rss=${MB(m.rss)} heapUsed=${MB(m.heapUsed)} external=${MB(m.external)}`); };
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" });
const d = new Date("2026-09-30T12:00:00Z");
snap("début");
const t0 = performance.now();
let x = 0;
for (let i = 0; i < n; i++) {
  const s =
    mode === "par-appel" ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(d)
    : mode === "toLocaleDateString" ? d.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit" })
    : mode === "toLocaleString-sans-options" ? d.toLocaleDateString("fr-FR")
    : mode === "number-par-appel" ? new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(i)
    : mode === "toLocaleString-nombre" ? (i * 1.5).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })
    : fmt.format(d);
  x += s.length;
}
console.log(`${mode}: ${n} formats en ${Math.round(performance.now() - t0)} ms (contrôle ${x})`);
snap("fin boucle");
global.gc?.(); global.gc?.();
snap("après GC");
await new Promise((r) => setTimeout(r, 2000));
global.gc?.();
snap("GC +2 s");
