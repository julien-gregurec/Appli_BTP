// POC uniquement. Deux implémentations de l'interface « admin Auth du projet Studio » :
//  - fakeAuthAdmin : en mémoire (toujours exécutée) ;
//  - gotrueAuthAdmin : HTTP contre un vrai GoTrue (si GOTRUE_URL est fourni).
// La session Studio est émise par GoTrue lui-même (generate_link + verify) : aucun JWT
// Supabase n'est forgé à la main, le secret JWT du projet Studio ne quitte pas GoTrue.
import { randomUUID, createHmac } from "node:crypto";

export function fakeAuthAdmin() {
  const users = new Map();
  return {
    users,
    async findByEmail(email) {
      return [...users.values()].find((u) => u.email === email.toLowerCase()) ?? null;
    },
    async createUser({ email, platformSubject }) {
      if (await this.findByEmail(email)) throw new Error("email_exists");
      const u = { id: randomUUID(), email: email.toLowerCase(), app_metadata: { elsatia_subject: platformSubject } };
      users.set(u.id, u);
      return u;
    },
    async mintSession(userId) {
      if (!users.has(userId)) throw new Error("user_not_found");
      return { access_token: `fake.${userId}`, user: { id: userId } };
    },
  };
}

function serviceJwt(secret) {
  const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify({ role: "service_role", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 600 })).toString("base64url");
  const s = createHmac("sha256", secret).update(`${h}.${p}`).digest("base64url");
  return `${h}.${p}.${s}`;
}

export function gotrueAuthAdmin({ url, jwtSecret }) {
  const auth = { Authorization: `Bearer ${serviceJwt(jwtSecret)}`, "Content-Type": "application/json" };
  async function call(path, init) {
    const r = await fetch(`${url}${path}`, init);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(`gotrue ${path} ${r.status} ${JSON.stringify(body)}`), { status: r.status, body });
    return body;
  }
  return {
    async findByEmail(email) {
      // Pas d'API de recherche exacte par e-mail stable dans GoTrue : on liste (POC, petit volume).
      const body = await call(`/admin/users?per_page=1000`, { headers: auth });
      return (body.users ?? []).find((u) => u.email === email.toLowerCase()) ?? null;
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
  };
}
