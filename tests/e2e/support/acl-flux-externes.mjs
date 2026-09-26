// ELSATIA-SERVICE-ROLE-FLUX-ACL-V1 — simulateur LOCAL des services externes pour la recette E2E.
// Aucun appel ne quitte le poste : Stripe (mode Test simulé), Brevo et Powens répondent ici, et les
// points d'envoi push sont servis en HTTPS local (certificat auto-signé de recette).
// Journal consultable : GET /__journal ; remise à zéro : DELETE /__journal.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { join } from "node:path";

const PORT_HTTP = Number(process.env.ACL_FLUX_EXTERNES_PORT ?? 3197);
const PORT_PUSH = Number(process.env.ACL_FLUX_PUSH_PORT ?? 3198);
const CERTS = process.env.ACL_FLUX_CERT_DIR;
const PRIX_SUP = process.env.STRIPE_PRICE_COMPTE_SUP_MINI_MENSUEL ?? "price_acl_sup_mini_m";
const journal = [];

const lireCorps = (req) => new Promise((resolve) => {
  let donnees = "";
  req.on("data", (morceau) => { donnees += morceau; });
  req.on("end", () => resolve(donnees));
});
const json = (res, code, corps) => {
  res.writeHead(code, { "content-type": "application/json" });
  res.end(JSON.stringify(corps));
};

createServer(async (req, res) => {
  const corps = await lireCorps(req);
  const { pathname } = new URL(req.url, "http://127.0.0.1");
  if (pathname === "/__journal") {
    if (req.method === "DELETE") { journal.length = 0; return json(res, 200, { ok: true }); }
    return json(res, 200, journal);
  }
  journal.push({ methode: req.method, chemin: pathname, corps });

  if (pathname.startsWith("/stripe/v1/subscriptions/") && req.method === "GET") {
    const id = decodeURIComponent(pathname.split("/").pop());
    return json(res, 200, {
      id, object: "subscription", customer: "cus_acl_A", status: "active", livemode: false,
      items: { data: [{ id: "si_acl_sup", object: "subscription_item", quantity: 1, price: { id: PRIX_SUP } }] },
    });
  }
  if (pathname.startsWith("/stripe/v1/subscription_items")) {
    return json(res, 200, { id: pathname.split("/")[4] ?? "si_acl_nouveau", object: "subscription_item" });
  }
  if (pathname.startsWith("/stripe/v1/")) return json(res, 200, { id: "stripe_acl_generique", object: "simule" });
  if (pathname === "/brevo/v3/smtp/email") return json(res, 201, { messageId: "<acl-flux@recette.invalid>" });
  if (pathname === "/powens/auth/token") return json(res, 200, { access_token: "powens_acl_local", token: "powens_acl_local", token_type: "Bearer", expires_in: 3600 });
  if (pathname.startsWith("/powens/payments/")) return json(res, 200, { id: decodeURIComponent(pathname.split("/").pop()), state: "done" });
  return json(res, 404, { error: "route simulée inconnue" });
}).listen(PORT_HTTP, "127.0.0.1", () => console.log(`simulateur externes http://127.0.0.1:${PORT_HTTP}`));

if (CERTS) {
  const options = { key: readFileSync(join(CERTS, "cle.pem")), cert: readFileSync(join(CERTS, "certificat.pem")) };
  createHttpsServer(options, async (req, res) => {
    const corps = await lireCorps(req);
    journal.push({ methode: req.method, chemin: `push:${req.url}`, taille: corps.length, chiffrement: req.headers["content-encoding"] ?? null });
    res.writeHead(req.url.startsWith("/gone") ? 410 : 201);
    res.end();
  }).listen(PORT_PUSH, "127.0.0.1", () => console.log(`points d'envoi push https://127.0.0.1:${PORT_PUSH}`));
}
