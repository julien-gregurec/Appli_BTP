// POC uniquement. Deux implémentations de l'interface « admin Auth du projet Studio » :
//  - fakeAuthAdmin : en mémoire (toujours exécutée) ;
//  - gotrueAuthAdmin : HTTP contre un vrai GoTrue (si GOTRUE_URL est fourni).
// La session Studio est émise par GoTrue lui-même (generate_link + verify) : aucun JWT
// Supabase n'est forgé à la main, le secret JWT du projet Studio ne quitte pas GoTrue.
import { randomUUID, createHmac } from "node:crypto";
import { psql } from "./studio.mjs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAN_FOREVER = "876000h"; // ~100 ans : GoTrue n'a pas de « désactivé » booléen

export function fakeAuthAdmin() {
  const users = new Map();
  const sessions = new Map(); // sessionId -> userId
  return {
    users,
    sessions,
    async findByEmail(email) {
      return [...users.values()].find((u) => u.email === email.toLowerCase()) ?? null;
    },
    async findBySubject(sub) {
      return [...users.values()].find((u) => u.app_metadata.elsatia_subject === sub) ?? null;
    },
    async createUser({ email, platformSubject }) {
      if (await this.findByEmail(email)) throw Object.assign(new Error("email_exists"), { status: 422, body: { error_code: "email_exists" } });
      const u = { id: randomUUID(), email: email.toLowerCase(), app_metadata: { elsatia_subject: platformSubject }, banned: false };
      users.set(u.id, u);
      return u;
    },
    async mintSession(userId) {
      const u = users.get(userId);
      if (!u) throw new Error("user_not_found");
      if (u.banned) throw Object.assign(new Error("user_banned"), { status: 403, body: { error_code: "user_banned" } });
      const sid = randomUUID();
      sessions.set(sid, userId);
      return { access_token: `fake.${userId}.${sid}`, session_id: sid, user: { id: userId } };
    },
    async banUser(id) { users.get(id).banned = true; },
    async unbanUser(id) { users.get(id).banned = false; },
    async revokeSessions(id, sessionId) {
      for (const [sid, uid] of sessions) if (uid === id && (!sessionId || sid === sessionId)) sessions.delete(sid);
    },
  };
}

export function serviceJwt(secret) {
  const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify({ role: "service_role", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
  const s = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}

export async function gotrueCall(url, path, init = {}) {
  const r = await fetch(`${url}${path}`, init);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(`gotrue ${path} ${r.status} ${JSON.stringify(body)}`), { status: r.status, body });
  return body;
}

// `dbUrl` : base du projet Studio. GoTrue v2.192.0 n'expose AUCUNE route admin de révocation de
// session ; en production ce serait une RPC SECURITY DEFINER du projet Studio, exécutable par
// service_role seulement (`delete from auth.sessions …`, les refresh tokens suivent en cascade).
export function gotrueAuthAdmin({ url, jwtSecret, dbUrl }) {
  const auth = { Authorization: `Bearer ${serviceJwt(jwtSecret)}`, "Content-Type": "application/json" };
  const call = (path, init) => gotrueCall(url, path, init);
  const listUsers = async () => (await call(`/admin/users?per_page=1000`, { headers: auth })).users ?? [];
  return {
    async findByEmail(email) {
      // Pas d'API de recherche exacte par e-mail stable dans GoTrue : on liste (POC, petit volume).
      return (await listUsers()).find((u) => u.email === email.toLowerCase()) ?? null;
    },
    async findBySubject(sub) {
      // En production : index SQL sur raw_app_meta_data->>'elsatia_subject' (ou écriture du lien
      // dans la même transaction). app_metadata n'est modifiable que par la clé service.
      return (await listUsers()).find((u) => u.app_metadata?.elsatia_subject === sub) ?? null;
    },
    async createUser({ email, platformSubject }) {
      return call(`/admin/users`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ email, email_confirm: true, app_metadata: { elsatia_subject: platformSubject } }),
      });
    },
    async mintSession(userId) {
      const user = await call(`/admin/users/${userId}`, { headers: auth });
      const link = await call(`/admin/generate_link`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ type: "magiclink", email: user.email }),
      });
      const tokenHash = link.hashed_token ?? link.properties?.hashed_token;
      // Côté Next.js ce serait supabase.auth.verifyOtp({ token_hash, type: "magiclink" }) via le client SSR,
      // qui pose les cookies de session Studio. Ici : appel HTTP équivalent, sans clé service.
      return call(`/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
      });
    },
    async banUser(id) {
      await call(`/admin/users/${id}`, { method: "PUT", headers: auth, body: JSON.stringify({ ban_duration: BAN_FOREVER }) });
    },
    async unbanUser(id) {
      await call(`/admin/users/${id}`, { method: "PUT", headers: auth, body: JSON.stringify({ ban_duration: "none" }) });
    },
    async revokeSessions(id, sessionId) {
      if (!UUID.test(id) || (sessionId && !UUID.test(sessionId))) throw new Error("invalid id");
      if (!dbUrl) throw new Error("revokeSessions: dbUrl requis");
      await psql(dbUrl, `delete from auth.sessions where user_id = '${id}'${sessionId ? ` and id = '${sessionId}'` : ""}`);
    },
  };
}

// Client « navigateur » minimal (ce que fait @supabase/ssr) : lecture, refresh, logout.
export function gotrueUserClient(url) {
  const json = { "Content-Type": "application/json" };
  const raw = async (path, init) => {
    const r = await fetch(`${url}${path}`, init);
    return { status: r.status, body: await r.json().catch(() => null) };
  };
  return {
    getUser: (at) => raw("/user", { headers: { Authorization: `Bearer ${at}` } }),
    refresh: (rt) => raw("/token?grant_type=refresh_token", { method: "POST", headers: json, body: JSON.stringify({ refresh_token: rt }) }),
    logout: (at, scope = "local") => raw(`/logout?scope=${scope}`, { method: "POST", headers: { ...json, Authorization: `Bearer ${at}` } }),
    password: (email, password) => raw("/token?grant_type=password", { method: "POST", headers: json, body: JSON.stringify({ email, password }) }),
  };
}

// Vérification stateless d'un access token, comme le fait PostgREST (signature + exp, sans GoTrue).
export function statelessVerify(accessToken, secret, nowS = Math.floor(Date.now() / 1000)) {
  const [h, p, s] = accessToken.split(".");
  const expected = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  const claims = JSON.parse(Buffer.from(p, "base64url"));
  return { valid: expected === s && claims.exp > nowS, claims };
}
