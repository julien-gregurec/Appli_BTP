// Règles pures (testables sans Next ni Supabase) de la session Studio adossée au compte ELSATIA.

export type StudioIdentityMode = "elsatia" | "local";

/**
 * `elsatia` (défaut, FAIL-CLOSED) : connexion uniquement par le pont signé, chaque requête vérifie
 * l'état de la session (compte actif, session ouverte par le pont, âge).
 * `local` : connexion par mot de passe GoTrue, réservé aux instances de test jetables
 * (apps/studio/scripts/local-test.mjs) ; jamais en Preview ni en Production.
 */
export function identityMode(value = process.env.STUDIO_IDENTITY_MODE): StudioIdentityMode {
  return value?.trim().toLowerCase() === "local" ? "local" : "elsatia";
}

export interface SessionStatus {
  status: "ok" | "stale" | "expired" | "unregistered" | "unlinked" | "disabled" | "anonymous";
  access?: "full" | "read_only";
}

export type SessionDecision =
  | { kind: "allow"; access: "full" | "read_only" }
  | { kind: "revalidate"; access: "full" | "read_only" }
  | { kind: "revoke"; reason: SessionStatus["status"] };

/**
 * `stale` : au-delà de l'âge de revalidation, une navigation repasse silencieusement par
 * l'identité centrale (borne la durée pendant laquelle une notification de révocation perdue
 * pourrait être ignorée) ; les appels API restent servis jusqu'à l'âge maximal (`expired`).
 */
export function decideSession(status: SessionStatus, navigation: boolean): SessionDecision {
  const access = status.access === "full" ? "full" : "read_only";
  switch (status.status) {
    case "ok":
      return { kind: "allow", access };
    case "stale":
      return navigation ? { kind: "revalidate", access } : { kind: "allow", access };
    default:
      return { kind: "revoke", reason: status.status };
  }
}

export function sessionAges(env: Record<string, string | undefined> = process.env) {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : d;
  };
  return {
    soft: num(env.STUDIO_IDENTITY_REVALIDATE_S, 12 * 3600),
    hard: num(env.STUDIO_IDENTITY_MAX_SESSION_S, 24 * 3600),
  };
}

const MESSAGES: Record<string, string> = {
  ACCOUNT_DISABLED: "Votre compte ELSATIA est désactivé.",
  NOT_ENTITLED: "Votre compte ELSATIA n’a pas encore accès à Studio.",
  ACCOUNT_LINK_REQUIRED: "Un compte Studio existe déjà avec cette adresse. Contactez le support pour le rattacher.",
  EMAIL_NOT_VERIFIED: "Confirmez d’abord l’adresse e-mail de votre compte ELSATIA.",
  REPLAY: "Ce lien de connexion a déjà servi. Recommencez.",
  EXPIRED: "Le lien de connexion a expiré. Recommencez.",
  NONCE_MISMATCH: "La connexion a été ouverte dans un autre navigateur. Recommencez.",
  REVOKED: "Votre session Studio a été fermée. Reconnectez-vous.",
};
const UNAVAILABLE = "Connexion ELSATIA momentanément indisponible. Réessayez dans un instant.";
const GENERIC = "Connexion impossible. Recommencez.";
const TRANSIENT = new Set(["JWKS_UNAVAILABLE", "PLATFORM_UNAVAILABLE", "STUDIO_AUTH_UNAVAILABLE", "STUDIO_DB_UNAVAILABLE"]);

/** Message utilisateur stable pour un code d'erreur (jamais de détail technique). */
export function identityMessage(code: string | undefined): string | undefined {
  if (!code) return undefined;
  if (MESSAGES[code]) return MESSAGES[code];
  return TRANSIENT.has(code) ? UNAVAILABLE : GENERIC;
}

const STATE_COOKIE_VALUE = /^([A-Za-z0-9_-]{43})\.([A-Za-z0-9_-]*)$/;
/** Cookie de départ : `<state>.<base64url(next)>`. */
export function encodeHandoffCookie(state: string, next: string) {
  return `${state}.${Buffer.from(next).toString("base64url")}`;
}
export function decodeHandoffCookie(value: string | undefined): { state: string; next: string } | null {
  const m = value ? STATE_COOKIE_VALUE.exec(value) : null;
  if (!m) return null;
  return { state: m[1], next: Buffer.from(m[2], "base64url").toString("utf8") };
}
export const HANDOFF_COOKIE = "elsatia-studio-handoff";
