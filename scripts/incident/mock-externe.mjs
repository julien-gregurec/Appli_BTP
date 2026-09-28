#!/usr/bin/env node
// ELSATIA — drill incident : faux Stripe et faux Brevo LOCAUX, pilotables.
//   GET  /__etat                 → { disponible }
//   POST /__panne  | /__retour   → coupe / rétablit le service simulé (503 sinon 200)
//   GET  /v1/balance (Stripe)    → 200 { object: "balance" } si disponible
//   GET  /v3/account (Brevo)     → 200 { email } si disponible
//   POST /v3/smtp/email (Brevo)  → 201 { messageId } si disponible ; compte les envois reçus
// Écoute uniquement sur 127.0.0.1. Usage : PORT=14242 NOM=stripe node mock-externe.mjs
import http from "node:http";

const PORT = Number(process.env.PORT || 14242);
const NOM = process.env.NOM || "externe";
let disponible = true;
let envois = 0;

const json = (res, statut, corps) => {
  res.writeHead(statut, { "content-type": "application/json" });
  res.end(JSON.stringify(corps));
};

http
  .createServer((req, res) => {
    const chemin = new URL(req.url, "http://local").pathname;
    if (chemin === "/__etat") return json(res, 200, { nom: NOM, disponible, envois });
    if (req.method === "POST" && chemin === "/__panne") { disponible = false; return json(res, 200, { disponible }); }
    if (req.method === "POST" && chemin === "/__retour") { disponible = true; return json(res, 200, { disponible }); }
    if (!disponible) return json(res, 503, { error: `${NOM} indisponible (simulation)` });
    if (chemin === "/v1/balance") return json(res, 200, { object: "balance", livemode: false });
    if (chemin === "/v3/account") return json(res, 200, { email: "drill@example.test" });
    if (req.method === "POST" && chemin === "/v3/smtp/email") { envois += 1; return json(res, 201, { messageId: `<drill-${envois}@local>` }); }
    return json(res, 404, { error: "route inconnue" });
  })
  .listen(PORT, "127.0.0.1", () => console.log(`${NOM} simulé sur 127.0.0.1:${PORT}`));
