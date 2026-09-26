// Émetteur : identité centrale ELSATIA (projet Supabase partagé, hébergé par Gestion Pro).
// Ne voit que l'identité et la décision d'accès ; ne détient AUCUNE clé du projet Studio.
import { randomUUID } from "node:crypto";
import {
  DEFAULT_HANDOFF_TTL_S,
  DEFAULT_LIFECYCLE_TTL_S,
  IDENTITY_CONTRACT_VERSION,
  IdentityError,
  MAX_TOKEN_TTL_S,
  TYP_HANDOFF,
  TYP_LIFECYCLE,
  type AccountState,
  type Entitlement,
  type HandoffClaims,
  type LifecycleClaims,
  type LifecycleReason,
} from "./contract";
import { signCompact } from "./jws";
import type { SigningKeyRing } from "./keys";
import { assertTrustedUrl } from "./jwks-source";
import { AUDIENCE_PATTERN, SUBJECT_PATTERN, UUID_PATTERN, isNonce, subjectFor } from "./subject";

export interface IdentityIssuerOptions {
  issuer: string;
  keys: SigningKeyRing;
  now?: () => number;
  handoffTtlS?: number;
  lifecycleTtlS?: number;
}

export interface IssueHandoffInput {
  userId: string;
  email: string;
  emailVerified: boolean;
  audience: string;
  nonce: string;
  ent: Entitlement;
  seq: number;
}

export interface IssueLifecycleInput {
  subject: string;
  audience: string;
  eventId: string;
  seq: number;
  account: AccountState;
  reason: LifecycleReason;
  ent: Entitlement | null;
}

function ttl(value: number | undefined, fallback: number) {
  const v = value ?? fallback;
  if (!Number.isInteger(v) || v < 5 || v > MAX_TOKEN_TTL_S) throw new IdentityError("CONFIG_INVALID", { detail: "TTL hors bornes" });
  return v;
}

export function createIdentityIssuer(options: IdentityIssuerOptions) {
  assertTrustedUrl(options.issuer, "émetteur (iss)");
  const issuer = options.issuer;
  const now = options.now ?? Date.now;
  const handoffTtl = ttl(options.handoffTtlS, DEFAULT_HANDOFF_TTL_S);
  const lifecycleTtl = ttl(options.lifecycleTtlS, DEFAULT_LIFECYCLE_TTL_S);
  const times = (lifetime: number) => {
    const iat = Math.floor(now() / 1000);
    return { iat, nbf: iat, exp: iat + lifetime };
  };

  return {
    issuer,
    subjectFor: (userId: string, audience: string) => subjectFor(issuer, audience, userId),

    issueHandoff(input: IssueHandoffInput): { token: string; claims: HandoffClaims } {
      if (!AUDIENCE_PATTERN.test(input.audience)) throw new IdentityError("BAD_AUDIENCE");
      if (!isNonce(input.nonce)) throw new IdentityError("NONCE_MISMATCH");
      // Ceinture : la route d'émission refuse déjà ; l'émetteur ne signe jamais un e-mail non prouvé.
      if (input.emailVerified !== true) throw new IdentityError("EMAIL_NOT_VERIFIED");
      if (!input.email || input.email.length > 254) throw new IdentityError("MALFORMED", { detail: "email" });
      if (!Number.isSafeInteger(input.seq) || input.seq < 0) throw new IdentityError("MALFORMED", { detail: "seq" });
      const claims: HandoffClaims = {
        ver: IDENTITY_CONTRACT_VERSION,
        iss: issuer,
        aud: input.audience,
        sub: subjectFor(issuer, input.audience, input.userId),
        ...times(handoffTtl),
        jti: randomUUID(),
        nonce: input.nonce,
        email: input.email.toLowerCase(),
        email_verified: true,
        ent: { granted: input.ent.granted === true, plan: input.ent.plan ?? null, valid_until: input.ent.valid_until ?? null },
        seq: input.seq,
      };
      return { token: signCompact(claims, options.keys.privateKey, options.keys.kid, TYP_HANDOFF), claims };
    },

    /** Signé à chaque tentative de livraison ; `eventId` (jti) reste stable entre les tentatives. */
    issueLifecycle(input: IssueLifecycleInput): { token: string; claims: LifecycleClaims } {
      if (!AUDIENCE_PATTERN.test(input.audience)) throw new IdentityError("BAD_AUDIENCE");
      if (!SUBJECT_PATTERN.test(input.subject)) throw new IdentityError("MALFORMED", { detail: "sub" });
      if (!UUID_PATTERN.test(input.eventId)) throw new IdentityError("MALFORMED", { detail: "eventId" });
      if (!Number.isSafeInteger(input.seq) || input.seq < 1) throw new IdentityError("MALFORMED", { detail: "seq" });
      const claims: LifecycleClaims = {
        ver: IDENTITY_CONTRACT_VERSION,
        iss: issuer,
        aud: input.audience,
        sub: input.subject,
        ...times(lifecycleTtl),
        jti: input.eventId.toLowerCase(),
        seq: input.seq,
        account: input.account,
        reason: input.reason,
        ent: input.ent,
      };
      return { token: signCompact(claims, options.keys.privateKey, options.keys.kid, TYP_LIFECYCLE), claims };
    },
  };
}

export type IdentityIssuer = ReturnType<typeof createIdentityIssuer>;
