// Vérificateur : côté application à projet dédié (Studio). Ne détient que des clés publiques.
// Vérifie la cryptographie ET le contrat ; l'anti-rejeu (jti consommé en base) est fait par
// l'appelant APRÈS cette vérification et AVANT tout effet de bord.
import type { KeyObject } from "node:crypto";
import {
  ACCOUNT_STATES,
  CLOCK_SKEW_S,
  IDENTITY_CONTRACT_VERSION,
  IdentityError,
  LIFECYCLE_REASONS,
  MAX_TOKEN_TTL_S,
  TYP_HANDOFF,
  TYP_LIFECYCLE,
  type Entitlement,
  type HandoffClaims,
  type IdentityTokenTyp,
  type LifecycleClaims,
} from "./contract";
import { readHeader, verifySignature } from "./jws";
import type { JwksSource } from "./jwks-source";
import { SUBJECT_PATTERN, UUID_PATTERN, safeEqual } from "./subject";

export interface IdentityVerifierOptions {
  issuer: string;
  audience: string;
  jwks: JwksSource;
  now?: () => number;
  clockSkewS?: number;
}

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v);

function entitlement(value: unknown, nullable: boolean): Entitlement | null {
  if (value === null && nullable) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new IdentityError("MALFORMED", { detail: "ent" });
  const e = value as Record<string, unknown>;
  if (typeof e.granted !== "boolean") throw new IdentityError("MALFORMED", { detail: "ent.granted" });
  if (e.plan !== null && e.plan !== undefined && (typeof e.plan !== "string" || e.plan.length > 64))
    throw new IdentityError("MALFORMED", { detail: "ent.plan" });
  if (e.valid_until !== null && e.valid_until !== undefined && (typeof e.valid_until !== "string" || Number.isNaN(Date.parse(e.valid_until))))
    throw new IdentityError("MALFORMED", { detail: "ent.valid_until" });
  return { granted: e.granted, plan: (e.plan as string | null | undefined) ?? null, valid_until: (e.valid_until as string | null | undefined) ?? null };
}

export function createIdentityVerifier(options: IdentityVerifierOptions) {
  const now = options.now ?? Date.now;
  const skew = options.clockSkewS ?? CLOCK_SKEW_S;

  async function keyFor(kid: string): Promise<KeyObject> {
    const keys = await options.jwks.get();
    const key = keys.get(kid);
    if (key) return key;
    // kid inconnu : une seule relecture (rotation), puis refus.
    const refreshed = await options.jwks.refresh();
    const retried = refreshed?.get(kid);
    if (!retried) throw new IdentityError("UNKNOWN_KID");
    return retried;
  }

  async function verifyCommon(token: unknown, typ: IdentityTokenTyp) {
    const { header, parts } = readHeader(token, typ);
    const p = verifySignature(parts, await keyFor(header.kid));
    if (p.ver !== IDENTITY_CONTRACT_VERSION) throw new IdentityError("BAD_VERSION");
    if (p.iss !== options.issuer) throw new IdentityError("BAD_ISSUER");
    if (typeof p.aud !== "string" || p.aud !== options.audience) throw new IdentityError("BAD_AUDIENCE");
    if (!isInt(p.iat) || !isInt(p.nbf) || !isInt(p.exp)) throw new IdentityError("MALFORMED", { detail: "dates" });
    const t = Math.floor(now() / 1000);
    if (p.exp <= p.iat || p.exp - p.iat > MAX_TOKEN_TTL_S) throw new IdentityError("TTL_TOO_LONG");
    if (t > p.exp + skew) throw new IdentityError("EXPIRED");
    if (t + skew < p.nbf || t + skew < p.iat) throw new IdentityError("NOT_YET_VALID");
    if (typeof p.sub !== "string" || !SUBJECT_PATTERN.test(p.sub)) throw new IdentityError("MALFORMED", { detail: "sub" });
    if (typeof p.jti !== "string" || !UUID_PATTERN.test(p.jti)) throw new IdentityError("MALFORMED", { detail: "jti" });
    if (!isInt(p.seq) || p.seq < 0) throw new IdentityError("MALFORMED", { detail: "seq" });
    return p;
  }

  return {
    async verifyHandoff(token: unknown, expectedNonce: string): Promise<HandoffClaims> {
      const p = await verifyCommon(token, TYP_HANDOFF);
      if (typeof p.nonce !== "string" || !expectedNonce || !safeEqual(p.nonce, expectedNonce))
        throw new IdentityError("NONCE_MISMATCH");
      if (p.email_verified !== true) throw new IdentityError("EMAIL_NOT_VERIFIED");
      if (typeof p.email !== "string" || !/^[^\s@]+@[^\s@]+$/.test(p.email) || p.email.length > 254)
        throw new IdentityError("MALFORMED", { detail: "email" });
      return { ...(p as unknown as HandoffClaims), ent: entitlement(p.ent, false)! };
    },

    async verifyLifecycle(token: unknown): Promise<LifecycleClaims> {
      const p = await verifyCommon(token, TYP_LIFECYCLE);
      if ((p.seq as number) < 1) throw new IdentityError("MALFORMED", { detail: "seq" });
      if (!ACCOUNT_STATES.includes(p.account as never)) throw new IdentityError("MALFORMED", { detail: "account" });
      if (!LIFECYCLE_REASONS.includes(p.reason as never)) throw new IdentityError("MALFORMED", { detail: "reason" });
      return { ...(p as unknown as LifecycleClaims), ent: entitlement(p.ent ?? null, true) };
    },
  };
}

export type IdentityVerifier = ReturnType<typeof createIdentityVerifier>;
