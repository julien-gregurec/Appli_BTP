// ELSATIA SOAK V1 — lecture de l'échantillonneur mémoire (scripts/perf/memory/sampler.cjs).
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
const DIR = process.env.MEM_SAMPLER_DIR;
function fichier() {
  const f = readdirSync(DIR).filter((x) => /^mem-\d+\.jsonl$/.test(x)).map((x) => join(DIR, x));
  return f.sort((a, b) => statSync(b).size - statSync(a).size)[0];
}
export function dernier() { const l = readFileSync(fichier(), "utf8").trim().split("\n").map((x) => JSON.parse(x)).filter((x) => x.rss); return l.at(-1); }
// Force un GC complet dans le serveur et renvoie l'échantillon « after-gc » (Mo).
export async function apresGc() {
  const f = fichier(); const avant = readFileSync(f, "utf8").length;
  writeFileSync(join(DIR, "cmd"), "gc");
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const neuf = readFileSync(f, "utf8").slice(avant).trim().split("\n").filter(Boolean).map((x) => JSON.parse(x));
    const g = neuf.find((x) => x.mark === "after-gc");
    if (g) return { rssMo: Math.round(g.rss / 1048576), heapMo: Math.round(g.heapUsed / 1048576), externalMo: Math.round(g.external / 1048576), contextes: g.nativeContexts };
  }
  return null;
}
export function picRss(depuis) {
  const l = readFileSync(fichier(), "utf8").trim().split("\n").map((x) => JSON.parse(x)).filter((x) => x.rss && x.t >= depuis);
  return { rssMaxMo: Math.round(Math.max(...l.map((x) => x.rss)) / 1048576), eluMax: Math.max(...l.map((x) => x.elu ?? 0)), eldP99Max: Math.round(Math.max(...l.map((x) => x.eldP99 ?? 0))) };
}
