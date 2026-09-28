// Passerelle locale « façon Kong Supabase » du banc E2E Studio dédié (tests uniquement).
//   /auth/v1/*    → GoTrue
//   /rest/v1/*    → PostgREST
//   /storage/v1/* → storage-api (préfixe retiré, X-Forwarded-Prefix posé pour les URL tus)
// Usage : node gateway.mjs <port> <gotrueUrl> <postgrestUrl> [storageUrl]
import { createServer, request } from "node:http";

const [port, auth, rest, storage] = process.argv.slice(2);
const routes = [
  ["/auth/v1", auth],
  ["/rest/v1", rest],
  ...(storage ? [["/storage/v1", storage]] : []),
];

createServer((req, res) => {
  const route = routes.find(([prefix]) => req.url === prefix || req.url.startsWith(`${prefix}/`) || req.url.startsWith(`${prefix}?`));
  if (!route) {
    res.writeHead(404, { "content-type": "application/json" }).end('{"message":"no route"}');
    return;
  }
  if (req.method === "OPTIONS") {
    // Pré-vol CORS répondu ici (comme Kong) : l'amont n'est pas sollicité.
    res.writeHead(204, {
      "access-control-allow-origin": req.headers.origin ?? "*",
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS",
      "access-control-allow-headers": req.headers["access-control-request-headers"] ?? "*",
      "access-control-expose-headers": "*,Location,Upload-Offset,Upload-Length,Tus-Resumable,Upload-Metadata",
      "access-control-max-age": "600",
    });
    res.end();
    return;
  }
  const [prefix, upstreamBase] = route;
  const target = new URL(upstreamBase);
  const path = req.url.slice(prefix.length) || "/";
  const headers = { ...req.headers, host: target.host };
  if (prefix === "/storage/v1") {
    headers["x-forwarded-prefix"] = "/storage/v1";
    headers["x-forwarded-host"] = req.headers.host;
    headers["x-forwarded-proto"] = "http";
    headers["x-forwarded-port"] = String(port);
  }
  const up = request({ host: target.hostname, port: target.port, path, method: req.method, headers }, (r) => {
    const out = { ...r.headers };
    // CORS : le navigateur (tus, @supabase/ssr) appelle la passerelle depuis l'origine Studio.
    out["access-control-allow-origin"] = req.headers.origin ?? "*";
    out["access-control-allow-credentials"] = "true";
    out["access-control-expose-headers"] = "*,Location,Upload-Offset,Upload-Length,Tus-Resumable,Upload-Metadata";
    res.writeHead(r.statusCode ?? 502, out);
    r.pipe(res);
  });
  up.on("error", () => {
    if (!res.headersSent) res.writeHead(502);
    res.end();
  });
  req.pipe(up);
}).listen(Number(port), "127.0.0.1");
