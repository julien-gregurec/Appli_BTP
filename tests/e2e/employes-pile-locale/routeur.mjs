/*
 * Routeur local de la recette « données personnelles des salariés » (V1).
 *
 * Présente UNE seule URL Supabase à Gestion Pro, comme Kong :
 *   /rest/v1/*  → un VRAI PostgREST (binaire officiel v12), préfixe retiré ;
 *   tout le reste (/auth/v1, /storage/v1, /__recette) → la passerelle locale
 *   tests/e2e/colors-pile-locale/passerelle.mjs (auth bcrypt + JWT HS256, Storage sous RLS).
 *
 * Pourquoi un vrai PostgREST : la mission porte sur les privilèges de COLONNE et une vue
 * (`employes_fiche`) ; seul PostgREST lui-même prouve le comportement réel de `select=*`,
 * des embeds depuis une vue et des erreurs 42501 renvoyées aux écrans.
 *
 * Usage : ROUTEUR_PORT=54321 POSTGREST_URL=http://127.0.0.1:3001 PASSERELLE_URL=http://127.0.0.1:54322 node routeur.mjs
 */
import http from "node:http";

const PORT = Number(process.env.ROUTEUR_PORT ?? 54321);
const POSTGREST = new URL(process.env.POSTGREST_URL ?? "http://127.0.0.1:3001");
const PASSERELLE = new URL(process.env.PASSERELLE_URL ?? "http://127.0.0.1:54322");

http.createServer((req, res) => {
  const versPostgrest = req.url.startsWith("/rest/v1/") || req.url === "/rest/v1";
  const cible = versPostgrest ? POSTGREST : PASSERELLE;
  const chemin = versPostgrest ? req.url.slice("/rest/v1".length) || "/" : req.url;
  const amont = http.request(
    { hostname: cible.hostname, port: cible.port, path: chemin, method: req.method, headers: { ...req.headers, host: cible.host } },
    (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); },
  );
  amont.on("error", (e) => { res.writeHead(502, { "content-type": "application/json" }); res.end(JSON.stringify({ message: `amont indisponible : ${e.message}` })); });
  req.pipe(amont);
}).listen(PORT, "127.0.0.1", () => console.log(`[routeur] :${PORT} → rest ${POSTGREST.href} · reste ${PASSERELLE.href}`));
