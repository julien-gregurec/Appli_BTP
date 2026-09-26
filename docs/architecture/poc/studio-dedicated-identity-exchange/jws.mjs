// POC uniquement — ne pas importer depuis du code applicatif.
// JWS compact ES256 (RFC 7515/7518) avec node:crypto, sans dépendance.
import { createSign, createVerify, createPublicKey } from "node:crypto";

export const b64u = (buf) => Buffer.from(buf).toString("base64url");
export const b64uJson = (obj) => b64u(JSON.stringify(obj));
export const fromB64uJson = (s) => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

export function signEs256(payload, privateKey, kid) {
  const header = { alg: "ES256", typ: "elsatia-handoff+jwt", kid };
  const input = `${b64uJson(header)}.${b64uJson(payload)}`;
  const sig = createSign("SHA256").update(input).sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64u(sig)}`;
}

// Vérifie la signature UNIQUEMENT avec l'algorithme épinglé (ES256) et une clé du JWKS.
// Retourne { header, payload } ou lève une erreur au code stable.
export function verifyEs256(token, jwks) {
  if (typeof token !== "string" || token.length > 4096) throw codeError("MALFORMED");
  const parts = token.split(".");
  if (parts.length !== 3) throw codeError("MALFORMED");
  let header, payload;
  try {
    header = fromB64uJson(parts[0]);
    payload = fromB64uJson(parts[1]);
  } catch {
    throw codeError("MALFORMED");
  }
  if (header.alg !== "ES256") throw codeError("ALG_REJECTED"); // jamais "none", jamais HS256
  if (header.typ !== "elsatia-handoff+jwt") throw codeError("TYP_REJECTED");
  const jwk = jwks.keys.find((k) => k.kid === header.kid);
  if (!jwk || jwk.kty !== "EC" || jwk.crv !== "P-256") throw codeError("UNKNOWN_KID");
  const key = createPublicKey({ key: jwk, format: "jwk" });
  const ok = createVerify("SHA256")
    .update(`${parts[0]}.${parts[1]}`)
    .verify({ key, dsaEncoding: "ieee-p1363" }, Buffer.from(parts[2], "base64url"));
  if (!ok) throw codeError("BAD_SIGNATURE");
  return { header, payload };
}

export function codeError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}
