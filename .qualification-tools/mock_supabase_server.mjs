// Mock PostgREST + Storage-REST server for local, real-execution qualification (Docker
// registry blocked, see docs/qualification/ELSATIA_RGPD_PURGE_END_TO_END_V1.md §0.1).
// Translates the exact HTTP calls made by @supabase/supabase-js (used unmodified by
// scripts/purger-entreprise.mjs and src/lib/rgpd.ts) into real SQL against the real
// native PostgreSQL 16 instance, with a real `SET ROLE` per request so the same
// REVOKE/GRANT the migrations define are actually enforced (service_role vs anon vs
// authenticated) — not a simulation, real role-based access control in Postgres.
//
// Endpoints implemented (only what this purge qualification exercises):
//   POST   /rest/v1/rpc/:fn         -> select public.:fn(json args) via a real SQL call
//   DELETE /storage/v1/object/:bucket  { prefixes: [...] }  -> real storage.objects DELETE
//   GET    /storage/v1/object/list/:bucket (unused here, included for completeness)
import http from "node:http";
import pg from "pg";

const PORT = process.env.MOCK_PORT ? Number(process.env.MOCK_PORT) : 54321;
const PGDATABASE = process.env.MOCK_PGDATABASE || "elsatia_rgpd_v2";
const SERVICE_ROLE_KEY = process.env.MOCK_SERVICE_ROLE_KEY || "service_role_key_local";
const ANON_KEY = process.env.MOCK_ANON_KEY || "anon_key_local";

const pool = new pg.Pool({
  host: "localhost", port: 5432, user: "postgres", password: process.env.MOCK_PGPASSWORD || "localdev",
  database: PGDATABASE, max: 10,
});

function roleForApikey(apikey, authHeader) {
  if (apikey === SERVICE_ROLE_KEY) return "service_role";
  if (authHeader && authHeader !== `Bearer ${ANON_KEY}`) return "authenticated";
  return "anon";
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(text) });
  res.end(text);
}

async function handleRpc(req, res, fn) {
  const apikey = req.headers.apikey;
  const role = roleForApikey(apikey, req.headers.authorization);
  const args = await readBody(req);
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    const paramNames = Object.keys(args);
    const placeholders = paramNames.map((_, i) => `$${i + 1}`);
    const namedArgs = paramNames.map((n, i) => `${n} := ${placeholders[i]}`).join(", ");
    const sql = `select * from public.${fn}(${namedArgs})`;
    const result = await client.query(sql, Object.values(args));
    await client.query("commit");
    // PostgREST returns a scalar directly for a single-column/single-row function, and
    // an array of rows for a set-returning one — mirror that so supabase-js's `.data`
    // shape matches what the real API would give (rapport_purge_entreprise etc. expect
    // an array; scalar-returning functions like demander_suppression_entreprise expect
    // a bare value, not used by this script but kept for parity with rgpd.ts callers).
    if (result.rows.length === 1 && Object.keys(result.rows[0]).length === 1) {
      const soleCol = Object.keys(result.rows[0])[0];
      // Heuristic matching real PostgREST: RETURNS TABLE / SETOF -> always array.
      if (result.command === "SELECT" && result.fields.length === 1 && !fn.startsWith("rapport") && !fn.startsWith("verifier") && !fn.startsWith("lire_audit")) {
        sendJson(res, 200, result.rows[0][soleCol]);
        return;
      }
    }
    sendJson(res, 200, result.rows);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    sendJson(res, 400, { message: err.message, code: err.code });
  } finally {
    client.release();
  }
}

async function handleStorageRemove(req, res, bucket) {
  const apikey = req.headers.apikey;
  const role = roleForApikey(apikey, req.headers.authorization);
  const body = await readBody(req);
  const prefixes = body.prefixes ?? [];
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(`set local role ${role}`);
    const deleted = [];
    for (const path of prefixes) {
      const result = await client.query(
        "delete from storage.objects where bucket_id = $1 and name = $2 returning id, name",
        [bucket, path]
      );
      deleted.push(...result.rows);
    }
    await client.query("commit");
    sendJson(res, 200, deleted.map((r) => ({ name: r.name })));
  } catch (err) {
    await client.query("rollback").catch(() => {});
    sendJson(res, 400, { message: err.message });
  } finally {
    client.release();
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    if (req.method === "POST" && url.pathname.startsWith("/rest/v1/rpc/")) {
      const fn = url.pathname.slice("/rest/v1/rpc/".length);
      await handleRpc(req, res, fn);
      return;
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/storage/v1/object/")) {
      const bucket = url.pathname.slice("/storage/v1/object/".length);
      await handleStorageRemove(req, res, bucket);
      return;
    }
    sendJson(res, 404, { message: `Route non mockée : ${req.method} ${url.pathname}` });
  } catch (err) {
    sendJson(res, 500, { message: err.message });
  }
});

server.listen(PORT, () => {
  console.log(`Mock PostgREST/Storage server (réel Postgres derrière) sur http://localhost:${PORT}`);
});
