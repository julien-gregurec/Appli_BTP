import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { IdentityError } from "./contract";

export const SUBJECT_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const AUDIENCE_PATTERN = /^[a-z][a-z0-9_-]{1,31}$/;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Sujet opaque, stable, propre à (émetteur, audience) : l'UUID `auth.users` ne sort jamais de la
 * plateforme, et deux applications ne peuvent pas corréler leurs utilisateurs par le sujet.
 */
export function subjectFor(issuer: string, audience: string, userId: string): string {
  if (!AUDIENCE_PATTERN.test(audience)) throw new IdentityError("CONFIG_INVALID", { detail: "audience invalide" });
  if (!UUID_PATTERN.test(userId)) throw new IdentityError("MALFORMED", { detail: "identifiant utilisateur invalide" });
  return createHash("sha256").update(`${issuer}|${audience}|${userId.toLowerCase()}`).digest("base64url");
}

/**
 * Lien navigateur ↔ jeton. L'application pose `state` (32 octets aléatoires) en cookie httpOnly et
 * n'envoie à la plateforme que `nonce = SHA-256(state)` : la valeur du cookie ne circule jamais
 * dans une URL. Au retour, le jeton doit porter `nonce` = SHA-256(cookie).
 */
export function createHandoffState() {
  const state = randomBytes(32).toString("base64url");
  return { state, nonce: nonceForState(state) };
}

export function nonceForState(state: string): string {
  if (!STATE_PATTERN.test(state)) throw new IdentityError("NONCE_MISMATCH");
  return createHash("sha256").update(state).digest("base64url");
}

export const isNonce = (value: unknown): value is string => typeof value === "string" && STATE_PATTERN.test(value);

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
