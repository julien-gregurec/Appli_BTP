// Mandataire local « façon API Supabase » : /auth/v1 → GoTrue, /rest/v1 → PostgREST (tests uniquement).
// Usage : node gateway.mjs <port> <gotrueUrl> <postgrestUrl>
import { createServer, request } from "node:http";
const [port, auth, rest] = process.argv.slice(2);
createServer((req, res) => {
  const target = new URL(req.url.startsWith("/auth/v1") ? auth : rest);
  const path = req.url.replace(/^\/(auth|rest)\/v1/, "") || "/";
  const up = request({ host: target.hostname, port: target.port, path, method: req.method, headers: { ...req.headers, host: target.host } }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on("error", () => res.writeHead(502).end());
  req.pipe(up);
}).listen(Number(port), "127.0.0.1");
