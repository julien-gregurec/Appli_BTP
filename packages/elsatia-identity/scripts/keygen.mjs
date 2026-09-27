// Génère une clé de signature ES256 pour l'identité centrale et prépare la rotation.
// Usage :
//   node packages/elsatia-identity/scripts/keygen.mjs                  → configuration initiale
//   node packages/elsatia-identity/scripts/keygen.mjs --rotate <cfg>   → nouvelle clé courante,
//        l'ancienne devient « previous » publiée 48 h (fenêtre de rotation, max 7 jours)
// La sortie est un SECRET : à coller dans le gestionnaire de secrets, jamais dans le dépôt.
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
const kid = `elsatia-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const current = { ...privateKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig" };
const config = { current };
const i = process.argv.indexOf("--rotate");
if (i > 0) {
  const old = JSON.parse(readFileSync(process.argv[i + 1], "utf8")).current;
  config.previous = { kty: old.kty, crv: old.crv, x: old.x, y: old.y, kid: old.kid, alg: "ES256", use: "sig" };
  config.previous_retire_at = new Date(Date.now() + 48 * 3600_000).toISOString();
}
process.stdout.write(JSON.stringify(config) + "\n");
