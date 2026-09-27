import { createHmac, randomUUID } from "node:crypto";
import {
  createIdentityIssuer,
  createIdentityVerifier,
  generateSigningKey,
  parseSigningKeys,
  staticJwks,
  STUDIO_AUDIENCE,
  type Entitlement,
  type JwksSource,
} from "../src";

export const ISS = "https://app.elsatia.test/identity";
export const ENT_OK: Entitlement = { granted: true, plan: "studio", valid_until: null };
export const ENT_NO: Entitlement = { granted: false, plan: null, valid_until: null };

/** Clés générées à l'exécution : aucune clé n'est jamais écrite dans le dépôt. */
export function keyRing(opts: { previous?: ReturnType<typeof generateSigningKey>; retireAt?: Date } = {}) {
  const current = generateSigningKey();
  const config: Record<string, unknown> = { current: current.privateJwk };
  if (opts.previous) {
    config.previous = opts.previous.publicJwk;
    config.previous_retire_at = (opts.retireAt ?? new Date(Date.now() + 3600_000)).toISOString();
  }
  return { current, ring: parseSigningKeys(JSON.stringify(config)), config };
}

export function pair(opts: { now?: () => number; issuer?: string; audience?: string; jwks?: JwksSource } = {}) {
  const { ring, current } = keyRing();
  const issuer = createIdentityIssuer({ issuer: opts.issuer ?? ISS, keys: ring, now: opts.now });
  const verifier = createIdentityVerifier({
    issuer: ISS,
    audience: opts.audience ?? STUDIO_AUDIENCE,
    jwks: opts.jwks ?? staticJwks(ring.jwks()),
    now: opts.now,
  });
  return { issuer, verifier, ring, current };
}

export const newUser = () => ({ id: randomUUID(), email: `u-${randomUUID().slice(0, 8)}@example.test` });

export function hs256(secret: string, payload: Record<string, unknown>) {
  const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${h}.${p}.${createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url")}`;
}
