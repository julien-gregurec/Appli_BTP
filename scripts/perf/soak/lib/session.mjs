// ELSATIA SOAK V1 — session GoTrue réelle → cookie @supabase/ssr (même format que
// scripts/perf/memory/loadgen.mjs). Mot de passe de banc LOCAL uniquement.
export const SUPA = process.env.SOAK_SUPA ?? "http://localhost:54321";
export const APP = process.env.SOAK_APP ?? "http://localhost:3100";
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const COOKIE = `sb-${new URL(SUPA).hostname.split(".")[0]}-auth-token`;
export async function connecter(email, password = "PiloteTest!2026") {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: "POST", headers: { "content-type": "application/json", apikey: ANON }, body: JSON.stringify({ email, password }) });
  if (!r.ok) throw new Error(`login ${email}: ${r.status} ${(await r.text()).slice(0, 120)}`);
  const s = await r.json();
  const v = "base64-" + Buffer.from(JSON.stringify(s)).toString("base64url"), MAX = 3180;
  const cookie = v.length <= MAX ? `${COOKIE}=${v}` : Array.from({ length: Math.ceil(v.length / MAX) }, (_, i) => `${COOKIE}.${i}=${v.slice(i * MAX, (i + 1) * MAX)}`).join("; ");
  return { session: s, cookie };
}
export async function page(cookie, chemin, { headers = {}, signal } = {}) {
  const t0 = performance.now(); let status = 0, bytes = 0, err = null;
  try { const r = await fetch(APP + chemin, { headers: { cookie, ...headers }, redirect: "manual", signal }); status = r.status; bytes = (await r.arrayBuffer()).byteLength; }
  catch (e) { err = String(e?.name ?? e); }
  return { ms: performance.now() - t0, status, bytes, err, text: "" };
}
// Processus : Chromium (nombre, RSS) et serveur Next (RSS), lus dans /proc via ps.
import { execFileSync } from "node:child_process";
export function processus() {
  const lignes = execFileSync("ps", ["-eo", "pid,rss,args", "--no-headers"]).toString().split("\n");
  let chromium = 0, rssChromium = 0, rssNext = 0;
  for (const l of lignes) {
    const m = l.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/); if (!m) continue;
    if (/chrom|headless_shell/i.test(m[3]) && !/ps -eo/.test(m[3])) { chromium++; rssChromium += Number(m[2]); }
    if (/next\/dist\/bin\/next start -p 3100|next-server/.test(m[3])) rssNext += Number(m[2]);
  }
  return { chromium, rssChromiumMo: Math.round(rssChromium / 1024), rssNextMo: Math.round(rssNext / 1024) };
}
