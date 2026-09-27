#!/usr/bin/env node
// Minimal reverse proxy that makes a real local GoTrue + a real local
// PostgREST look like a single Supabase project URL to @supabase/ssr and
// @supabase/supabase-js -- exactly what Kong does in the real stack, just
// path-prefix routing, no other logic. Built because ELSATIA_PILOT_AUTH_
// POSTGREST_ACCEPTANCE_AUTOMATION_V1 never got a real PostgREST binary
// running; V2 did (see docs/qualification/ELSATIA_PILOT_ACCEPTANCE_
// AUTOMATION_V2.md), so this is the missing piece to let `next dev` and
// Playwright talk to a fully real local backend.
//
// Routes:
//   /auth/v1/*    -> GOTRUE_URL (prefix stripped)
//   /rest/v1/*    -> POSTGREST_URL (prefix stripped)
//   /storage/v1/* -> STORAGE_URL (prefix stripped) if set (local_storage_mock.mjs,
//                    see ELSATIA_PILOT_ACCEPTANCE_CLOSURE_V3 §6) ; else 501,
//                    honestly reported, never silently faked
//
// CORS (opt-in, CORS_ORIGINS=origin1,origin2) : Kong répond aux preflights en production ;
// un client purement navigateur (Tools, `next dev` sur un autre port) en a besoin. Sans la
// variable, aucun en-tête n'est ajouté (comportement historique inchangé).
//
// Usage: PORT=54321 GOTRUE_URL=http://localhost:9999 POSTGREST_URL=http://localhost:3001 \
//        STORAGE_URL=http://localhost:5000 node local_supabase_proxy.mjs
import http from 'node:http';

const PORT = process.env.PORT || 54321;
const GOTRUE_URL = new URL(process.env.GOTRUE_URL || 'http://localhost:9999');
const POSTGREST_URL = new URL(process.env.POSTGREST_URL || 'http://localhost:3001');
const STORAGE_URL = process.env.STORAGE_URL ? new URL(process.env.STORAGE_URL) : null;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);

function corsHeaders(req) {
  const origin = req.headers.origin;
  if (!origin || !CORS_ORIGINS.includes(origin)) return null;
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-credentials': 'true',
    'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': req.headers['access-control-request-headers'] || 'authorization,apikey,content-type,x-client-info,prefer,range',
    'access-control-expose-headers': 'content-range,content-profile,x-total-count',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function proxy(req, res, target, stripPrefix) {
  const path = req.url.startsWith(stripPrefix) ? req.url.slice(stripPrefix.length) || '/' : req.url;
  const opts = {
    hostname: target.hostname,
    port: target.port,
    path,
    method: req.method,
    headers: { ...req.headers, host: target.host },
  };
  const upstream = http.request(opts, (upRes) => {
    const cors = corsHeaders(req);
    res.writeHead(upRes.statusCode, cors ? { ...upRes.headers, ...cors } : upRes.headers);
    upRes.pipe(res);
  });
  upstream.on('error', (err) => {
    res.writeHead(502, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'bad_gateway', detail: String(err.message || err), target: target.href }));
  });
  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  const cors = corsHeaders(req);
  if (cors && req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.url.startsWith('/auth/v1/')) return proxy(req, res, GOTRUE_URL, '/auth/v1');
  if (req.url === '/auth/v1') return proxy(req, res, GOTRUE_URL, '/auth/v1');
  if (req.url.startsWith('/rest/v1/')) return proxy(req, res, POSTGREST_URL, '/rest/v1');
  if (req.url.startsWith('/storage/v1/')) {
    if (STORAGE_URL) return proxy(req, res, STORAGE_URL, '/storage/v1');
    res.writeHead(501, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'no_local_storage_service', detail: 'Storage HTTP service not available in this sandbox (see README.md).' }));
  }
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not_found', path: req.url }));
});

server.listen(PORT, () => {
  console.log(`local supabase proxy listening on :${PORT} -> auth=${GOTRUE_URL.href} rest=${POSTGREST_URL.href}`);
});
