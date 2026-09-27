// JWS compact ES256 (RFC 7515 / 7518) avec node:crypto uniquement, sans dépendance.
// Vérification stricte : algorithme épinglé, `typ` attendu, en-tête fermé (aucun `jku`, `jwk`,
// `x5u`, `crit`… : la clé vient TOUJOURS du JWKS configuré, jamais du jeton), base64url canonique.
import { createSign, createVerify, type KeyObject } from "node:crypto";
import { IDENTITY_ALG, IdentityError, MAX_TOKEN_LENGTH, type IdentityTokenTyp } from "./contract";

const B64U = /^[A-Za-z0-9_-]+$/;
const ALLOWED_HEADER_KEYS = new Set(["alg", "typ", "kid"]);

export const b64u = (input: Buffer | string) => Buffer.from(input).toString("base64url");

function decodeSegment(segment: string): Buffer {
  if (!B64U.test(segment)) throw new IdentityError("MALFORMED");
  const buf = Buffer.from(segment, "base64url");
  // Refuse les encodages non canoniques (bits de bourrage, variantes) : un jeton = une écriture.
  if (buf.toString("base64url") !== segment) throw new IdentityError("MALFORMED");
  return buf;
}

function decodeJson(segment: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(decodeSegment(segment).toString("utf8"));
  } catch (error) {
    if (error instanceof IdentityError) throw error;
    throw new IdentityError("MALFORMED");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IdentityError("MALFORMED");
  return value as Record<string, unknown>;
}

export interface JwsHeader {
  alg: typeof IDENTITY_ALG;
  typ: IdentityTokenTyp;
  kid: string;
}

export function signCompact(payload: object, privateKey: KeyObject, kid: string, typ: IdentityTokenTyp): string {
  const header: JwsHeader = { alg: IDENTITY_ALG, typ, kid };
  const input = `${b64u(JSON.stringify(header))}.${b64u(JSON.stringify(payload))}`;
  const signature = createSign("SHA256").update(input).sign({ key: privateKey, dsaEncoding: "ieee-p1363" });
  return `${input}.${b64u(signature)}`;
}

/** Lit l'en-tête sans vérifier (sert uniquement à choisir la clé). */
export function readHeader(token: unknown, typ: IdentityTokenTyp): { header: JwsHeader; parts: [string, string, string] } {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH)
    throw new IdentityError("MALFORMED");
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => p.length === 0)) throw new IdentityError("MALFORMED");
  const header = decodeJson(parts[0]);
  if (header.alg !== IDENTITY_ALG) throw new IdentityError("ALG_REJECTED"); // jamais "none", jamais HS256
  if (header.typ !== typ) throw new IdentityError("TYP_REJECTED");
  if (Object.keys(header).some((k) => !ALLOWED_HEADER_KEYS.has(k))) throw new IdentityError("HEADER_REJECTED");
  if (typeof header.kid !== "string" || header.kid.length === 0 || header.kid.length > 64)
    throw new IdentityError("UNKNOWN_KID");
  return { header: header as unknown as JwsHeader, parts: parts as [string, string, string] };
}

/** Vérifie la signature avec la clé publique choisie par `kid`, puis décode la charge utile. */
export function verifySignature(parts: [string, string, string], publicKey: KeyObject): Record<string, unknown> {
  const signature = decodeSegment(parts[2]);
  if (signature.length !== 64) throw new IdentityError("BAD_SIGNATURE");
  const ok = createVerify("SHA256")
    .update(`${parts[0]}.${parts[1]}`)
    .verify({ key: publicKey, dsaEncoding: "ieee-p1363" }, signature);
  if (!ok) throw new IdentityError("BAD_SIGNATURE");
  return decodeJson(parts[1]);
}
