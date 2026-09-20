import "server-only";
import { interpretSignupPermitted } from "./signup-gate";
import { storageAdmin } from "./storage-admin";
/**
 * Access decision for a new account. Today: the registration policy held by the database
 * (`studio_signup_permitted`: open | allowlist | closed, a live invitation always admitted), the very same
 * predicate the Auth hook and `studio_create_workspace` apply. Later: a `platform-token` implementation verifying
 * the ELSATIA entitlement token described in ELSATIA_STUDIO_CATALOGUE_ACCESS_CONTRACT.md, without any link to
 * the Gestion Pro database.
 */
export interface EntitlementProvider {
  canSignUp(email: string): Promise<boolean>;
}
export const registrationGate: EntitlementProvider = {
  async canSignUp(email) {
    try {
      const r = await storageAdmin().rpc("studio_signup_permitted", {
        p_email: email.trim().toLowerCase(),
      });
      return interpretSignupPermitted(r.data, r.error);
    } catch {
      return false; // fail-closed: an unreachable database never opens registration
    }
  },
};
