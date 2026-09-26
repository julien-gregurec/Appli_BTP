// POC uniquement. « Identité centrale ELSATIA » : route serveur du projet PARTAGÉ qui transforme
// une session plateforme en jeton de passage Studio. Adossée à un vrai GoTrue (projet partagé
// simulé) : la session est vérifiée en ligne, puis l'état du compte est relu par l'API admin.
import { codeError } from "./jws.mjs";
import { gotrueCall, serviceJwt } from "./auth-admin.mjs";

export function createPlatformIdentity({ url, jwtSecret, broker }) {
  const admin = () => ({ Authorization: `Bearer ${serviceJwt(jwtSecret)}` });
  const down = (e) => {
    if (e.status) throw e;
    throw Object.assign(codeError("PLATFORM_UNAVAILABLE"), { cause: e });
  };
  return {
    // `accessToken` = cookie de session GP. `entitlementOf(user)` = décision catalogue/Stripe.
    async handoff({ accessToken, audience, nonce, entitlementOf }) {
      let user;
      try {
        user = await gotrueCall(url, "/user", { headers: { Authorization: `Bearer ${accessToken}` } });
      } catch (e) {
        if (e.status === 401 || e.status === 403) throw codeError("PLATFORM_SESSION_INVALID");
        down(e);
      }
      // GET /user répond 200 pour un utilisateur banni (constaté sur GoTrue v2.192.0) : l'état du
      // compte DOIT être relu explicitement avant d'émettre quoi que ce soit.
      const fresh = await gotrueCall(url, `/admin/users/${user.id}`, { headers: admin() }).catch(down);
      if (fresh.banned_until && new Date(fresh.banned_until) > new Date()) throw codeError("ACCOUNT_DISABLED");
      if (fresh.deleted_at) throw codeError("ACCOUNT_DISABLED");
      return broker.issue({
        session: { id: fresh.id, email: fresh.email, email_verified: Boolean(fresh.email_confirmed_at) },
        entitlement: await entitlementOf(fresh),
        audience,
        nonce,
      });
    },
    async disable(userId) {
      await gotrueCall(url, `/admin/users/${userId}`, {
        method: "PUT",
        headers: { ...admin(), "Content-Type": "application/json" },
        body: JSON.stringify({ ban_duration: "876000h" }),
      });
    },
  };
}
