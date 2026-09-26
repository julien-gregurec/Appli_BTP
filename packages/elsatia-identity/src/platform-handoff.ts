// Côté plateforme : transforme une session ELSATIA (projet partagé) en jeton de passage pour une
// audience. Utilisé par la route GP /identity/studio/handoff et par les tests réels.
import { IdentityError, TRANSIENT_CODES, type Entitlement, type IdentityErrorCode } from "./contract";
import type { IdentityIssuer } from "./issuer";
import type { PreparedHandoff } from "./supabase-adapters";

export interface PlatformHandoffDeps {
  issuer: IdentityIssuer;
  /**
   * Vérification EN LIGNE de la session plateforme (équivalent auth.getUser()). Doit lever pour une
   * panne ; renvoyer null pour une session absente ou invalide.
   */
  currentUser(): Promise<{ id: string } | null>;
  /** Relecture atomique séquence + état du compte + enregistrement du sujet (RPC SQL). */
  prepare(input: { userId: string; audience: string; subject: string }): Promise<PreparedHandoff>;
  entitlementFor(email: string): Entitlement;
}

export async function issuePlatformHandoff(deps: PlatformHandoffDeps, input: { audience: string; nonce: string }) {
  let user: { id: string } | null;
  try {
    user = await deps.currentUser();
  } catch (cause) {
    throw new IdentityError("PLATFORM_UNAVAILABLE", { cause });
  }
  if (!user) throw new IdentityError("PLATFORM_SESSION_INVALID");
  const subject = deps.issuer.subjectFor(user.id, input.audience);
  let prepared: PreparedHandoff;
  try {
    prepared = await deps.prepare({ userId: user.id, audience: input.audience, subject });
  } catch (cause) {
    throw new IdentityError("PLATFORM_UNAVAILABLE", { cause });
  }
  // GET /user répond 200 pour un compte banni (GoTrue v2.192.0) : l'état relu en base décide.
  if (prepared.account !== "active") throw new IdentityError("ACCOUNT_DISABLED");
  if (!prepared.email || !prepared.emailVerified) throw new IdentityError("EMAIL_NOT_VERIFIED");
  const ent = deps.entitlementFor(prepared.email);
  return deps.issuer.issueHandoff({
    userId: user.id,
    email: prepared.email,
    emailVerified: true,
    audience: input.audience,
    nonce: input.nonce,
    ent,
    seq: prepared.seq,
  });
}

/** Réponse HTTP du point d'entrée « cycle de vie » : 2xx = acquitté, 503 = à réessayer. */
export function lifecycleHttpStatus(error: unknown): { status: number; code: IdentityErrorCode | "INTERNAL" } {
  if (error instanceof IdentityError) return { status: TRANSIENT_CODES.has(error.code) ? 503 : 400, code: error.code };
  return { status: 500, code: "INTERNAL" };
}
