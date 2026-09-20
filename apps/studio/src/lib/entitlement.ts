import "server-only";
import { hasPendingInvitation } from "./invitations";
import { parseSignupMode, signupDecision } from "./signup-gate";
/**
 * Access decision for a new account. Today: the local registration gate (open | allowlist | closed, with a live
 * invitation always accepted). Later: a `platform-token` implementation verifying the ELSATIA entitlement token
 * described in ELSATIA_STUDIO_CATALOGUE_ACCESS_CONTRACT.md, without any link to the Gestion Pro database.
 */
export interface EntitlementProvider {
  canSignUp(email: string): Promise<boolean>;
}
export const registrationGate: EntitlementProvider = {
  async canSignUp(email) {
    const mode = parseSignupMode(process.env.STUDIO_SIGNUP_MODE);
    if (mode === "open") return true;
    const invited = await hasPendingInvitation(email).catch(() => false);
    return signupDecision(mode, email, process.env.STUDIO_SIGNUP_ALLOWLIST, invited);
  },
};
