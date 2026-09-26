// POC uniquement. Montage commun des tests « réels » : deux GoTrue v2.192.0 distincts
//  - PLATFORM_GOTRUE_URL : projet PARTAGÉ simulé (identité centrale ELSATIA, GP) ;
//  - GOTRUE_URL          : projet DÉDIÉ Studio simulé (+ GOTRUE_DB_URL pour la base Studio).
import { randomUUID } from "node:crypto";
import { createBroker } from "./broker.mjs";
import { createStudioExchange, memoryLinkStore, pgReplayStore } from "./studio.mjs";
import { gotrueAuthAdmin, gotrueUserClient, gotrueCall, serviceJwt } from "./auth-admin.mjs";
import { createPlatformIdentity } from "./platform.mjs";

export const ISS = "https://app.elsatia.fr/identity";
export const AUD = "studio";
export const ENT_OK = { granted: true, plan: "studio_pro", valid_until: "2026-12-31T23:59:59Z" };

export const env = {
  studioUrl: process.env.GOTRUE_URL,
  studioSecret: process.env.GOTRUE_JWT_SECRET,
  studioDb: process.env.GOTRUE_DB_URL,
  platformUrl: process.env.PLATFORM_GOTRUE_URL,
  platformSecret: process.env.PLATFORM_GOTRUE_JWT_SECRET,
};
export const REAL = Boolean(env.studioUrl && env.studioSecret && env.studioDb && env.platformUrl && env.platformSecret);
export const skipReal = REAL ? false : "GOTRUE_URL/GOTRUE_JWT_SECRET/GOTRUE_DB_URL/PLATFORM_GOTRUE_URL/PLATFORM_GOTRUE_JWT_SECRET non fournis";

// Crée un utilisateur central confirmé et ouvre une session GP réelle (mot de passe).
export async function platformUser(opts = {}) {
  const email = `c-${randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${randomUUID()}`;
  const u = await gotrueCall(env.platformUrl, "/admin/users", {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceJwt(env.platformSecret)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: opts.confirmed ?? true }),
  });
  const s = await gotrueUserClient(env.platformUrl).password(email, password);
  return { id: u.id, email, password, session: s.body };
}

export async function realSetup({ studioUrl = env.studioUrl, platformUrl = env.platformUrl, entitlement = () => ENT_OK } = {}) {
  const broker = createBroker({ issuer: ISS });
  const platform = createPlatformIdentity({ url: platformUrl, jwtSecret: env.platformSecret, broker });
  const links = memoryLinkStore();
  const authAdmin = gotrueAuthAdmin({ url: studioUrl, jwtSecret: env.studioSecret, dbUrl: env.studioDb });
  const studio = createStudioExchange({
    issuer: ISS,
    audience: AUD,
    getJwks: async () => broker.jwks(),
    replay: await pgReplayStore(env.studioDb),
    links,
    authAdmin,
  });
  const studioClient = gotrueUserClient(studioUrl);
  const platformClient = gotrueUserClient(env.platformUrl);
  // Parcours navigateur complet : nonce Studio → handoff plateforme → échange Studio.
  async function login(pUser) {
    const nonce = randomUUID();
    const token = await platform.handoff({ accessToken: pUser.session.access_token, audience: AUD, nonce, entitlementOf: entitlement });
    return studio.exchange(token, nonce);
  }
  return { broker, platform, links, authAdmin, studio, studioClient, platformClient, login };
}

export const sessionIdOf = (accessToken) => JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url")).session_id;
