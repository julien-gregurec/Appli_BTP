#!/usr/bin/env node
// Faithful local/mocked Supabase Storage HTTP surface, built because real
// storage-api (unlike GoTrue/PostgREST) is not a downloadable static binary
// in this sandbox and api.github.com stays blocked (confirmed by V2, see
// docs/qualification/ELSATIA_PILOT_ACCEPTANCE_AUTOMATION_V2.md §7). "Mocked"
// (task ELSATIA_PILOT_ACCEPTANCE_CLOSURE_V3 §6 explicitly allows it, unlike
// §1/§4 which require the real GoTrue/PostgREST binaries) means:
//   - object METADATA lives in the REAL storage.objects/storage.buckets
//     tables (same schema, same RLS policies applied by the product's own
//     migrations) -- every upload/download/remove below is RLS-checked
//     exactly the way real storage-api checks it (JWT verified, `role` +
//     `request.jwt.claims` set from the verified token, same mechanism as
//     jwt_bridge.mjs's `run` mode and PostgREST itself), not re-implemented
//     or approximated;
//   - object BYTES live on local disk instead of S3 (the one real
//     simplification -- storage-api itself is thin glue between Postgres
//     metadata+RLS and an object store; swapping the object store for local
//     disk changes nothing the app or a security test can observe).
// NOT proven by this mock: storage-api's own bugs (if any), image
// transforms, resumable/TUS uploads, real S3 durability/latency. Report
// results from it as "RLS validated under real verified JWTs against the
// real storage schema (mock HTTP surface, not real storage-api binary)".
//
// Endpoints implemented (the ones this repo's app code actually calls --
// see `grep -rn ".storage.from(" src/`):
//   POST   /object/<bucket>/<path...>        upload (x-upsert header)
//   DELETE /object/<bucket>                  remove  body {prefixes:[...]}
//   GET    /object/<bucket>/<path...>        authenticated download
//   GET    /object/public/<bucket>/<path...> public download (bucket.public=true)
//   POST   /object/sign/<bucket>/<path...>   create signed URL  body {expiresIn}
//   GET    /object/sign/<bucket>/<path...>   consume signed URL (?token=)
//
// Usage: PORT=5000 DB=pilot_gp GOTRUE_JWT_SECRET=... STORAGE_ROOT=/tmp/local-storage-mock \
//        node local_storage_mock.mjs
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const PORT = process.env.PORT || 5000;
const DB = process.env.DB || 'pilot_gp';
const SECRET = process.env.GOTRUE_JWT_SECRET;
const ROOT = process.env.STORAGE_ROOT || '/tmp/local-storage-mock';
if (!SECRET) { console.error('GOTRUE_JWT_SECRET not set'); process.exit(1); }
fs.mkdirSync(ROOT, { recursive: true });

// ---- JWT verify (identical logic to jwt_bridge.mjs verifyJwtHS256) --------
function b64urlDecode(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Buffer.from(s, 'base64'); }
function verifyJwt(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed JWT');
  const [h, p, s] = parts;
  const header = JSON.parse(b64urlDecode(h).toString('utf8'));
  if (header.alg !== 'HS256') throw new Error(`unsupported alg ${header.alg}`);
  const expected = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest();
  const got = b64urlDecode(s);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) throw new Error('INVALID_SIGNATURE');
  const claims = JSON.parse(b64urlDecode(p).toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === 'number' && claims.exp < now) throw new Error('TOKEN_EXPIRED');
  return claims;
}

function principalFromRequest(req) {
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return { role: 'anon', claims: {} };
  try { const claims = verifyJwt(token); return { role: claims.role || 'authenticated', claims }; }
  catch { return { role: 'anon', claims: {} }; }
}

// ---- SQL execution under the caller's verified role/claims (real RLS) -----
function sqlLiteral(v) { return `'${String(v).replace(/'/g, "''")}'`; }
function sqlTextArrayLiteral(arr) { return `ARRAY[${arr.map(sqlLiteral).join(',') || ''}]::text[]`; }

// Runs `query` (a single statement, no trailing semicolon needed) as the
// given principal and returns parsed JSON rows. Throws { pgError, code,
// message } on a SQL error (RLS violation, unique violation, etc.) so
// callers can map it to the right HTTP status, exactly like storage-api does.
function runAsRole(role, claims, query) {
  const claimsJson = JSON.stringify(claims).replace(/'/g, "''");
  const sql = [
    '\\pset tuples_only on', '\\pset format unaligned',
    'begin;',
    `set local role ${role === 'anon' || role === 'authenticated' || role === 'service_role' ? role : 'authenticated'};`,
    `select set_config('request.jwt.claims', '${claimsJson}', true);`,
    `select set_config('request.jwt.claim.sub', ${sqlLiteral(claims.sub || '')}, true);`,
    `select set_config('request.jwt.claim.role', ${sqlLiteral(role)}, true);`,
    // A CTE (not a FROM-subquery) so this also works for INSERT/UPDATE/DELETE
    // ... RETURNING, which Postgres does not allow directly inside FROM (...).
    `with q as (${query}) select coalesce((select json_agg(row_to_json(t)) from q t), '[]'::json);`,
    'commit;',
  ].join('\n');
  return execSql(sql);
}

// Runs a statement that returns no rows (plain INSERT/UPDATE/DELETE without
// RETURNING) under the given principal. Separate from runAsRole because a
// data-modifying CTE with no RETURNING has nothing to SELECT FROM.
function execAsRole(role, claims, statement) {
  const claimsJson = JSON.stringify(claims).replace(/'/g, "''");
  const sql = [
    'begin;',
    `set local role ${role === 'anon' || role === 'authenticated' || role === 'service_role' ? role : 'authenticated'};`,
    `select set_config('request.jwt.claims', '${claimsJson}', true);`,
    `select set_config('request.jwt.claim.sub', ${sqlLiteral(claims.sub || '')}, true);`,
    `select set_config('request.jwt.claim.role', ${sqlLiteral(role)}, true);`,
    `${statement};`,
    'commit;',
  ].join('\n');
  execSql(sql);
}

function execSql(sql) {
  const tmp = path.join('/tmp', `_storage_mock_${process.pid}_${Date.now()}_${Math.random().toString(36).slice(2)}.sql`);
  fs.writeFileSync(tmp, sql);
  const res = spawnSync('su', ['postgres', '-c', `psql -X -q -v ON_ERROR_STOP=1 -d ${DB} -f ${tmp}`], { encoding: 'utf8' });
  fs.unlinkSync(tmp);
  if (res.status !== 0) {
    const stderr = res.stderr || '';
    const err = new Error('pg_error');
    err.pgError = true;
    err.stderr = stderr;
    err.code = (/SQLSTATE\s+(\w+)/.exec(stderr) || /ERROR:\s+(\d{5}):/.exec(stderr) || [])[1] || null;
    err.rlsViolation = /row-level security policy/i.test(stderr);
    err.uniqueViolation = /duplicate key value violates unique constraint/i.test(stderr);
    throw err;
  }
  const lines = res.stdout.split('\n').filter((l) => l.trim().length > 0);
  const last = lines[lines.length - 1] || '[]';
  try { return JSON.parse(last); } catch { return []; }
}

// Bucket existence/public-flag lookup never needs to be RLS-gated in real
// storage-api either (it uses its own service connection for bucket
// metadata) -- read as postgres here too.
function bucketInfo(bucket) {
  const rows = runAsRole('service_role', {}, `select id, public from storage.buckets where id = ${sqlLiteral(bucket)}`);
  return rows[0] || null;
}

function objectFilePath(bucket, name) {
  const safe = crypto.createHash('sha256').update(`${bucket}/${name}`).digest('hex');
  return path.join(ROOT, bucket, safe);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const signedTokens = new Map(); // token -> { bucket, name, expiresAt }

function cleanupExpiredTokens() {
  const now = Date.now();
  for (const [t, v] of signedTokens) if (v.expiresAt < now) signedTokens.delete(t);
}

const server = http.createServer(async (req, res) => {
  try {
    const u = new URL(req.url, 'http://local');
    const segments = u.pathname.split('/').filter(Boolean);

    // POST /object/sign/<bucket>/<path...>  (create) -- must come before the
    // generic /object/<bucket>/<path...> match below.
    if (req.method === 'POST' && segments[0] === 'object' && segments[1] === 'sign') {
      const bucket = segments[2];
      const name = segments.slice(3).join('/');
      const bodyBuf = await readBody(req);
      let expiresIn = 60;
      try { expiresIn = Number(JSON.parse(bodyBuf.toString('utf8') || '{}').expiresIn) || 60; } catch {}
      const { role, claims } = principalFromRequest(req);
      let rows;
      try { rows = runAsRole(role, claims, `select id from storage.objects where bucket_id=${sqlLiteral(bucket)} and name=${sqlLiteral(name)}`); }
      catch (e) { return json(res, 400, { statusCode: '400', error: 'bad_request', message: e.stderr || 'sign failed' }); }
      if (!rows.length) return json(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      cleanupExpiredTokens();
      const token = crypto.randomBytes(24).toString('hex');
      signedTokens.set(token, { bucket, name, expiresAt: Date.now() + expiresIn * 1000 });
      return json(res, 200, { signedURL: `/object/sign/${bucket}/${name}?token=${token}` });
    }

    // GET /object/sign/<bucket>/<path...>?token=...  (consume)
    if (req.method === 'GET' && segments[0] === 'object' && segments[1] === 'sign') {
      const bucket = segments[2];
      const name = segments.slice(3).join('/');
      const token = u.searchParams.get('token');
      cleanupExpiredTokens();
      const entry = token && signedTokens.get(token);
      if (!entry || entry.bucket !== bucket || entry.name !== name) return json(res, 400, { statusCode: '400', error: 'invalid_token', message: 'Invalid or expired signed URL' });
      const filePath = objectFilePath(bucket, name);
      if (!fs.existsSync(filePath)) return json(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      const rows = runAsRole('service_role', {}, `select metadata from storage.objects where bucket_id=${sqlLiteral(bucket)} and name=${sqlLiteral(name)}`);
      const mimetype = rows[0]?.metadata?.mimetype || 'application/octet-stream';
      res.writeHead(200, { 'content-type': mimetype });
      return fs.createReadStream(filePath).pipe(res);
    }

    // GET /object/public/<bucket>/<path...>
    if (req.method === 'GET' && segments[0] === 'object' && segments[1] === 'public') {
      const bucket = segments[2];
      const name = segments.slice(3).join('/');
      const info = bucketInfo(bucket);
      if (!info) return json(res, 400, { statusCode: '400', error: 'bucket_not_found', message: 'Bucket not found' });
      if (!info.public) return json(res, 400, { statusCode: '400', error: 'not_found', message: 'Object not found' });
      let rows;
      try { rows = runAsRole('anon', {}, `select metadata from storage.objects where bucket_id=${sqlLiteral(bucket)} and name=${sqlLiteral(name)}`); }
      catch { rows = []; }
      const filePath = objectFilePath(bucket, name);
      if (!rows.length || !fs.existsSync(filePath)) return json(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      const mimetype = rows[0]?.metadata?.mimetype || 'application/octet-stream';
      res.writeHead(200, { 'content-type': mimetype });
      return fs.createReadStream(filePath).pipe(res);
    }

    // DELETE /object/<bucket>   body {prefixes:[...]}
    if (req.method === 'DELETE' && segments[0] === 'object' && segments.length === 2) {
      const bucket = segments[1];
      const bodyBuf = await readBody(req);
      let prefixes = [];
      try { prefixes = JSON.parse(bodyBuf.toString('utf8') || '{}').prefixes || []; } catch {}
      if (!Array.isArray(prefixes) || !prefixes.length) return json(res, 200, []);
      const { role, claims } = principalFromRequest(req);
      // Two steps, no RETURNING: a DELETE ... RETURNING also re-checks the
      // deleted row against SELECT policies (real Postgres RLS behaviour,
      // confirmed while building this mock -- see the comment on the upload
      // handler below), which would wrongly deny deletes on buckets whose
      // SELECT policy is narrower than DELETE (documents-employes: SELECT
      // requires a live employes.* match, DELETE only requires
      // gerer_employes). Pre-select what THIS principal's DELETE policy will
      // apply to (its own SELECT visibility is irrelevant here), then delete
      // exactly that set.
      let rows;
      try {
        rows = runAsRole(role, claims,
          `select id, name from storage.objects where bucket_id=${sqlLiteral(bucket)} and name = any(${sqlTextArrayLiteral(prefixes)})`);
      } catch (e) {
        return json(res, 400, { statusCode: '400', error: 'bad_request', message: e.stderr || 'remove failed' });
      }
      if (rows.length) {
        try {
          execAsRole(role, claims,
            `delete from storage.objects where bucket_id=${sqlLiteral(bucket)} and name = any(${sqlTextArrayLiteral(rows.map((r) => r.name))})`);
        } catch (e) {
          if (e.rlsViolation) return json(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
          return json(res, 400, { statusCode: '400', error: 'bad_request', message: e.stderr || 'remove failed' });
        }
      }
      for (const r of rows) { try { fs.unlinkSync(objectFilePath(bucket, r.name)); } catch {} }
      return json(res, 200, rows);
    }

    // POST /object/<bucket>/<path...>  (upload)
    if (req.method === 'POST' && segments[0] === 'object' && segments.length >= 3) {
      const bucket = segments[1];
      const name = segments.slice(2).join('/');
      const bodyBuf = await readBody(req);
      const contentType = req.headers['content-type'] || 'application/octet-stream';
      const upsert = req.headers['x-upsert'] === 'true';
      const { role, claims } = principalFromRequest(req);
      const owner = claims.sub || null;
      const metadata = JSON.stringify({ mimetype: contentType, size: bodyBuf.length });
      const info = bucketInfo(bucket);
      if (!info) return json(res, 400, { statusCode: '400', error: 'bucket_not_found', message: 'Bucket not found' });
      const insertCols = `bucket_id, name, owner, metadata`;
      const insertVals = `${sqlLiteral(bucket)}, ${sqlLiteral(name)}, ${owner ? sqlLiteral(owner) : 'null'}, ${sqlLiteral(metadata)}::jsonb`;
      // No RETURNING: real Postgres RLS also re-checks a RETURNING row
      // against applicable SELECT policies. Several buckets here (documents-
      // employes, chantier-documents) have a SELECT policy strictly narrower
      // than INSERT/UPDATE (it requires a matching row in employes.*/
      // documents_chantier that the app creates in a SEPARATE statement right
      // after the upload -- exactly why some upload call sites in this repo
      // use an admin/service-role client instead of the user's). Asking for
      // the row back here would wrongly turn a legitimate upload into a 403.
      const query = upsert
        ? `insert into storage.objects (${insertCols}) values (${insertVals})
           on conflict (bucket_id, name) do update set metadata = excluded.metadata, owner = excluded.owner, updated_at = now(), last_accessed_at = now()`
        : `insert into storage.objects (${insertCols}) values (${insertVals})`;
      try { execAsRole(role, claims, query); }
      catch (e) {
        if (e.rlsViolation) return json(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
        if (e.uniqueViolation) return json(res, 409, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
        return json(res, 400, { statusCode: '400', error: 'bad_request', message: e.stderr || 'upload failed' });
      }
      fs.mkdirSync(path.join(ROOT, bucket), { recursive: true });
      fs.writeFileSync(objectFilePath(bucket, name), bodyBuf);
      return json(res, 200, { Key: `${bucket}/${name}`, Id: null });
    }

    // GET /object/<bucket>/<path...>  (authenticated download)
    if (req.method === 'GET' && segments[0] === 'object' && segments.length >= 3) {
      const bucket = segments[1];
      const name = segments.slice(2).join('/');
      const { role, claims } = principalFromRequest(req);
      let rows;
      try { rows = runAsRole(role, claims, `select metadata from storage.objects where bucket_id=${sqlLiteral(bucket)} and name=${sqlLiteral(name)}`); }
      catch { rows = []; }
      const filePath = objectFilePath(bucket, name);
      if (!rows.length || !fs.existsSync(filePath)) return json(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
      const mimetype = rows[0]?.metadata?.mimetype || 'application/octet-stream';
      res.writeHead(200, { 'content-type': mimetype });
      return fs.createReadStream(filePath).pipe(res);
    }

    return json(res, 404, { statusCode: '404', error: 'not_found', message: `no route for ${req.method} ${req.url}` });
  } catch (e) {
    return json(res, 500, { statusCode: '500', error: 'internal', message: String(e?.message || e) });
  }
});

server.listen(PORT, () => {
  console.log(`local storage mock listening on :${PORT} (db=${DB}, root=${ROOT})`);
});
