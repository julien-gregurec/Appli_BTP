/*
 * ELSATIA — Baseline performance V1 : routeur local unique devant la pile de mesure.
 *
 *   /auth/v1/*, /storage/v1/*, /__recette/* → passerelle de recette (tests/e2e/colors-pile-locale/passerelle.mjs)
 *   /rest/v1/*                              → PostgREST v12.2.3 RÉEL (préfixe retiré)
 *
 * Pourquoi : la passerelle ne sert qu'un sous-ensemble de PostgREST (pas de `or=`, etc.) ; les
 * pages Gestion Pro mesurées doivent parler au vrai PostgREST, avec la vraie RLS. L'auth de la
 * passerelle signe des JWT HS256 avec le même secret que PostgREST (`jwt-secret`).
 * Rôle identique à Kong en production, sans aucune règle d'accès propre.
 *
 * Usage : PORT=54321 PASSERELLE_URL=http://127.0.0.1:54320 POSTGREST_URL=http://127.0.0.1:3001 node routeur-local.mjs
 */
import http from "node:http";

const PORT = Number(process.env.PORT ?? 54321);
const PASSERELLE = new URL(process.env.PASSERELLE_URL ?? "http://127.0.0.1:54320");
const POSTGREST = new URL(process.env.POSTGREST_URL ?? "http://127.0.0.1:3001");
const agent = new http.Agent({ keepAlive: true, maxSockets: 256 });

function relayer(req, res, cible, chemin) {
  const amont = http.request(
    { hostname: cible.hostname, port: cible.port, path: chemin, method: req.method, headers: { ...req.headers, host: cible.host }, agent },
    (r) => { res.writeHead(r.statusCode, r.headers); r.pipe(res); },
  );
  amont.on("error", (e) => { if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ error: "bad_gateway", detail: String(e.message) })); });
  req.pipe(amont);
}

http.createServer((req, res) => {
  if (req.url.startsWith("/rest/v1/")) return relayer(req, res, POSTGREST, req.url.slice("/rest/v1".length));
  return relayer(req, res, PASSERELLE, req.url);
}).listen(PORT, "127.0.0.1", () => console.log(`[routeur] :${PORT} → auth/storage ${PASSERELLE.href}, rest ${POSTGREST.href}`));
