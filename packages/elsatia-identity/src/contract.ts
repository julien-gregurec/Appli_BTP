// Contrat de confiance ELSATIA ↔ applications à projet Supabase dédié (Studio d'abord).
// Version 1. Toute évolution incompatible change `ver` et le `typ` des jetons.
//
// Deux jetons, même format (JWS compact ES256), même JWKS, `typ` distincts pour qu'un jeton ne
// soit jamais accepté à la place de l'autre :
//  - jeton de passage (handoff) : émis par l'identité centrale pour UN navigateur, usage unique ;
//  - événement de cycle de vie : poussé serveur à serveur, porte l'ÉTAT du compte (pas un delta).

export const IDENTITY_ALG = "ES256" as const;
export const IDENTITY_CONTRACT_VERSION = 1 as const;
export const TYP_HANDOFF = "elsatia-handoff+jwt" as const;
export const TYP_LIFECYCLE = "elsatia-lifecycle+jwt" as const;
export type IdentityTokenTyp = typeof TYP_HANDOFF | typeof TYP_LIFECYCLE;

/** Durée de vie d'un jeton de passage : le navigateur le poste immédiatement. */
export const DEFAULT_HANDOFF_TTL_S = 60;
/** Durée de vie d'un événement signé : re-signé à chaque tentative de livraison. */
export const DEFAULT_LIFECYCLE_TTL_S = 300;
/** Plafond refusé côté vérificateur, quelle que soit la configuration de l'émetteur. */
export const MAX_TOKEN_TTL_S = 300;
/** Tolérance d'horloge entre serveurs (NTP requis des deux côtés). */
export const CLOCK_SKEW_S = 30;
/** Taille maximale d'un jeton accepté (défense contre les entrées démesurées). */
export const MAX_TOKEN_LENGTH = 4096;
/** Fenêtre de rotation maximale : l'ancienne clé ne reste publiée que ce temps-là. */
export const MAX_ROTATION_WINDOW_S = 7 * 24 * 3600;

export const STUDIO_AUDIENCE = "studio" as const;

export const ACCOUNT_STATES = ["active", "disabled", "deleted"] as const;
export type AccountState = (typeof ACCOUNT_STATES)[number];

export const LIFECYCLE_REASONS = [
  "account_disabled",
  "account_enabled",
  "account_deleted",
  "entitlement_changed",
  "resync",
] as const;
export type LifecycleReason = (typeof LIFECYCLE_REASONS)[number];

/** Décision d'accès calculée par la plateforme (catalogue / facturation). Jamais de données métier. */
export interface Entitlement {
  granted: boolean;
  plan: string | null;
  valid_until: string | null;
}

interface CommonClaims {
  ver: typeof IDENTITY_CONTRACT_VERSION;
  /** Émetteur, propre à l'environnement (Preview ≠ Production). */
  iss: string;
  /** Application destinataire, chaîne unique (jamais un tableau). */
  aud: string;
  /** Sujet opaque par audience : base64url(SHA-256(iss|aud|auth.users.id)). */
  sub: string;
  iat: number;
  nbf: number;
  exp: number;
  /** UUID : usage unique (passage) ou identifiant stable d'événement (cycle de vie). */
  jti: string;
}

export interface HandoffClaims extends CommonClaims {
  /** SHA-256 (base64url) du secret posé en cookie httpOnly par l'application au départ. */
  nonce: string;
  email: string;
  email_verified: true;
  ent: Entitlement;
  /**
   * Numéro de séquence du dernier événement de cycle de vie émis pour ce sujet au moment de
   * l'émission (0 si aucun). Le jeton certifie « compte actif à la séquence `seq` » : un état
   * local plus récent (désactivation reçue après l'émission) l'emporte.
   */
  seq: number;
}

export interface LifecycleClaims extends CommonClaims {
  /** Séquence strictement croissante par sujet : un événement plus ancien est ignoré. */
  seq: number;
  account: AccountState;
  reason: LifecycleReason;
  /** Nouvelle décision d'accès ; null = inchangée (l'événement ne porte que l'état du compte). */
  ent: Entitlement | null;
}

export const IDENTITY_ERROR_CODES = [
  // Forme et cryptographie
  "MALFORMED",
  "ALG_REJECTED",
  "TYP_REJECTED",
  "HEADER_REJECTED",
  "UNKNOWN_KID",
  "BAD_SIGNATURE",
  // Revendications
  "BAD_VERSION",
  "BAD_ISSUER",
  "BAD_AUDIENCE",
  "EXPIRED",
  "NOT_YET_VALID",
  "TTL_TOO_LONG",
  "NONCE_MISMATCH",
  "EMAIL_NOT_VERIFIED",
  "REPLAY",
  // Décisions
  "ACCOUNT_DISABLED",
  "NOT_ENTITLED",
  "ACCOUNT_LINK_REQUIRED",
  "LINK_CONFLICT",
  "EMAIL_EXISTS",
  "PLATFORM_SESSION_INVALID",
  // Infrastructure (toujours un code stable, jamais un état partiel exposé)
  "JWKS_UNAVAILABLE",
  "PLATFORM_UNAVAILABLE",
  "STUDIO_AUTH_UNAVAILABLE",
  "STUDIO_DB_UNAVAILABLE",
  "CONFIG_INVALID",
] as const;
export type IdentityErrorCode = (typeof IDENTITY_ERROR_CODES)[number];

export class IdentityError extends Error {
  readonly code: IdentityErrorCode;
  constructor(code: IdentityErrorCode, options?: { cause?: unknown; detail?: string }) {
    super(options?.detail ? `${code}: ${options.detail}` : code, { cause: options?.cause });
    this.name = "IdentityError";
    this.code = code;
  }
}

export const isIdentityError = (value: unknown, code?: IdentityErrorCode): value is IdentityError =>
  value instanceof IdentityError && (code === undefined || value.code === code);

/** Codes qui relèvent d'une panne (réessayable) et non d'un refus. */
export const TRANSIENT_CODES: ReadonlySet<IdentityErrorCode> = new Set([
  "JWKS_UNAVAILABLE",
  "PLATFORM_UNAVAILABLE",
  "STUDIO_AUTH_UNAVAILABLE",
  "STUDIO_DB_UNAVAILABLE",
]);

export const NO_ENTITLEMENT: Entitlement = Object.freeze({ granted: false, plan: null, valid_until: null });
