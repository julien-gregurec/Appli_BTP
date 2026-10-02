// ELSATIA SOAK V1 — outillage de mesure HTTP (PostgREST local) sans dépendance.
// JWT HS256 signé avec le secret LOCAL de scripts/perf/postgrest_local.sh (jamais un secret réel).
import { createHmac } from "node:crypto";

export const SECRET = process.env.SOAK_JWT_SECRET ?? "elsatia-local-perf-jwt-secret-0123456789abcdef";
export const BASE = process.env.SOAK_PGRST ?? "http://localhost:3000";

const b64 = (o) => Buffer.from(typeof o === "string" ? o : JSON.stringify(o)).toString("base64url");
export function jwt(sub, role = "authenticated", ttl = 3600) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64({ alg: "HS256", typ: "JWT" });
  // Clé service_role réelle de Supabase : AUCUN `sub` (auth.uid() doit rester nul).
  const body = b64(sub ? { sub, role, aud: "authenticated", iat: now, exp: now + ttl, email: `${sub}@soak.invalid` } : { role, iat: now, exp: now + ttl });
  const sig = createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

export async function call(token, path, { method = "GET", body, headers = {} } = {}) {
  const t0 = performance.now();
  let status = 0, bytes = 0, text = "", err = null;
  try {
    const r = await fetch(BASE + path, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    status = r.status; text = await r.text(); bytes = Buffer.byteLength(text);
  } catch (e) { err = String(e?.message ?? e); }
  return { ms: performance.now() - t0, status, bytes, text, err, contentRange: null };
}

export const rpc = (token, name, args, headers) => call(token, `/rpc/${name}`, { method: "POST", body: args, headers });

export function stats(samples) {
  const ms = samples.map((s) => s.ms).sort((a, b) => a - b);
  const q = (p) => ms.length ? ms[Math.min(ms.length - 1, Math.floor(p * ms.length))] : NaN;
  const errors = samples.filter((s) => s.err || s.status >= 400).length;
  const bytes = samples.length ? Math.round(samples.reduce((a, s) => a + s.bytes, 0) / samples.length) : 0;
  return { n: ms.length, p50: +q(0.5).toFixed(1), p95: +q(0.95).toFixed(1), max: +(ms.at(-1) ?? NaN).toFixed(1), errors, avgBytes: bytes };
}

// Exécute `fn(i)` `total` fois avec `concurrency` workers.
export async function load(total, concurrency, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (i < total) { const k = i++; out.push(await fn(k)); }
  }));
  return out;
}
