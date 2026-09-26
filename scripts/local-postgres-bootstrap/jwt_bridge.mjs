#!/usr/bin/env node
// Two small, HONEST substitutes used only because this sandbox has no
// Haskell toolchain to build real PostgREST and its Docker registry pulls
// are capped ("Data limit exceeded") -- see README.md, "What this does not
// prove". Both operate on tokens issued by a REAL, locally built GoTrue
// (see gotrue_pilot_bootstrap.sh); neither fabricates a token from scratch
// for a login/session flow.
//
//   sign  <claims-json>       Mint an HS256 JWT with our own GOTRUE_JWT_SECRET.
//                             Used only for admin/service-role calls against
//                             our own local GoTrue instance (this mirrors how
//                             a real Supabase project's "service_role" key is
//                             itself just a long-lived JWT signed with the
//                             project's JWT secret) -- never to fabricate a
//                             user session.
//   verify <jwt>               Cryptographically verify signature + exp only
//                             (first thing PostgREST does with a bearer token).
//   run <jwt> <db> <sqlfile|->  verify, then run SQL with
//                             `SET LOCAL role` + `SET LOCAL request.jwt.claims`
//                             set from the verified claims, so RLS evaluates
//                             exactly as it would for that principal.
//
// NOT proven by `run`: PostgREST's URL/query grammar, resource embedding,
// RPC dispatch conventions, error JSON shape, max_rows, CORS, schema cache
// reload. Report results from `run` as "RLS validated under a real verified
// JWT (bridge, not real PostgREST HTTP)".
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

function b64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64');
}

function sign(claims, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64url(Buffer.from(JSON.stringify(header)));
  const p = b64url(Buffer.from(JSON.stringify(claims)));
  const sig = b64url(crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest());
  return `${h}.${p}.${sig}`;
}

function verifyJwtHS256(token, secret) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed JWT');
  const [h, p, s] = parts;
  const header = JSON.parse(b64urlDecode(h).toString('utf8'));
  if (header.alg !== 'HS256') throw new Error(`unsupported alg ${header.alg}`);
  const expected = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest();
  const got = b64urlDecode(s);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) {
    throw new Error('INVALID_SIGNATURE');
  }
  const claims = JSON.parse(b64urlDecode(p).toString('utf8'));
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp === 'number' && claims.exp < now) {
    throw new Error(`TOKEN_EXPIRED (exp=${claims.exp}, now=${now})`);
  }
  return claims;
}

const [, , mode, ...rest] = process.argv;
const secret = process.env.GOTRUE_JWT_SECRET;

if (mode === 'sign') {
  if (!secret) { console.error('GOTRUE_JWT_SECRET not set'); process.exit(1); }
  console.log(sign(JSON.parse(rest[0]), secret));
} else if (mode === 'verify') {
  try {
    console.log(JSON.stringify({ ok: true, claims: verifyJwtHS256(rest[0], secret) }));
  } catch (e) {
    console.log(JSON.stringify({ ok: false, error: String(e.message || e) }));
    process.exit(1);
  }
} else if (mode === 'run') {
  const [token, db, sqlfile] = rest;
  let claims;
  try {
    claims = verifyJwtHS256(token, secret);
  } catch (e) {
    console.error(JSON.stringify({ ok: false, stage: 'jwt_verify', error: String(e.message || e) }));
    process.exit(1);
  }
  const role = claims.role || 'authenticated';
  const claimsJson = JSON.stringify(claims).replace(/'/g, "''");
  const preamble = `set local role ${role};\nselect set_config('request.jwt.claims', '${claimsJson}', true);\nselect set_config('request.jwt.claim.sub', '${claims.sub || ''}', true);\nselect set_config('request.jwt.claim.role', '${role}', true);\nselect set_config('request.jwt.claim.email', '${claims.email || ''}', true);\n`;
  const userSql = sqlfile === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(sqlfile, 'utf8');
  // Unaligned, tuples-only output for the WHOLE script (preamble included)
  // so callers can reliably take "the last non-empty line" as the final
  // query's result, regardless of how many set_config() calls precede it.
  const fullSql = "\\pset tuples_only on\n\\pset format unaligned\n" + 'begin;\n' + preamble + userSql + '\ncommit;\n';
  const tmp = `/tmp/_jwt_bridge_${process.pid}.sql`;
  fs.writeFileSync(tmp, fullSql);
  const res = spawnSync('su', ['postgres', '-c', `psql -X -q -v ON_ERROR_STOP=1 -d ${db} -f ${tmp}`], { encoding: 'utf8' });
  fs.unlinkSync(tmp);
  process.stdout.write(res.stdout || '');
  process.stderr.write(res.stderr || '');
  process.exit(res.status ?? 1);
} else {
  console.error('usage: jwt_bridge.mjs sign <claims-json> | verify <jwt> | run <jwt> <db> <sqlfile|->');
  process.exit(2);
}
