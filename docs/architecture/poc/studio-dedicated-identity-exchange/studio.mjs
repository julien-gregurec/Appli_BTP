// POC uniquement. Côté projet Supabase DÉDIÉ Studio : vérifie le jeton du broker,
// rattache l'identité ELSATIA à un utilisateur Auth Studio, ouvre une session Studio,
// applique les événements de révocation poussés par la plateforme.
import { execFile } from "node:child_process";
import { verifyEs256, codeError, TYP_HANDOFF, TYP_REVOCATION } from "./jws.mjs";

export const CLOCK_SKEW_S = 30;
const MAX_TTL_S = 300;

// Toute panne d'infrastructure (réseau, 5xx) devient un code stable : jamais d'état partiel exposé.
// GoTrue v2.192.0 : 422 email_exists en séquentiel, mais 500 + code Postgres 23505
// (users_email_partial_key) quand deux créations se chevauchent (constaté, test F4b).
const isEmailExists = (e) =>
  e?.body?.error_code === "email_exists" ||
  (e?.body?.code === "23505" && /users_email_partial_key/.test(e?.body?.message ?? "")) ||
  /email_exists/.test(e?.message ?? "");
const isBanned = (e) => e?.body?.error_code === "user_banned";
function infra(code) {
  return (e) => {
    if (e?.code && !e.status) throw e; // déjà un code métier
    if (isBanned(e)) throw codeError("ACCOUNT_DISABLED");
    if (isEmailExists(e)) throw e;
    throw Object.assign(codeError(code), { cause: e });
  };
}

export function createStudioExchange({ issuer, audience, getJwks, refreshJwks, replay, links, authAdmin, now = () => Date.now() }) {
  async function verify(token, typ, expectedNonce) {
    let jwks;
    try {
      jwks = await getJwks();
    } catch (e) {
      throw Object.assign(codeError("JWKS_UNAVAILABLE"), { cause: e });
    }
    let verified;
    try {
      verified = verifyEs256(token, jwks, typ);
    } catch (e) {
      // kid inconnu : une seule relecture du JWKS (rotation de clé), puis échec.
      if (e.code !== "UNKNOWN_KID" || !refreshJwks) throw e;
      verified = verifyEs256(token, await refreshJwks(), typ);
    }
    const p = verified.payload;
    const t = Math.floor(now() / 1000);
    if (p.iss !== issuer) throw codeError("BAD_ISSUER");
    if (p.aud !== audience) throw codeError("BAD_AUDIENCE");
    if (typeof p.exp !== "number" || t > p.exp + CLOCK_SKEW_S) throw codeError("EXPIRED");
    if (typeof p.nbf !== "number" || t + CLOCK_SKEW_S < p.nbf) throw codeError("NOT_YET_VALID");
    if (typeof p.iat !== "number" || p.exp - p.iat > MAX_TTL_S) throw codeError("TTL_TOO_LONG");
    if (typ === TYP_HANDOFF) {
      if (!expectedNonce || p.nonce !== expectedNonce) throw codeError("NONCE_MISMATCH");
      if (p.email_verified !== true) throw codeError("EMAIL_NOT_VERIFIED");
    }
    if (typeof p.sub !== "string" || !p.sub || typeof p.jti !== "string") throw codeError("MALFORMED");
    // Anti-rejeu : jti consommé une seule fois, AVANT tout effet de bord (fail-closed).
    // En cas de panne en aval, l'utilisateur relance simplement un nouveau passage (nouveau jti).
    let fresh;
    try {
      fresh = await replay.consume(p.jti, p.exp);
    } catch (e) {
      throw Object.assign(codeError("STUDIO_DB_UNAVAILABLE"), { cause: e });
    }
    if (!fresh) throw codeError("REPLAY");
    return p;
  }

  // Trouve ou crée l'utilisateur Studio pour un sujet plateforme. Idempotent : reprend un
  // provisioning interrompu (utilisateur créé, lien non écrit) grâce à app_metadata.elsatia_subject,
  // que seule la clé service Studio peut écrire (non modifiable par l'utilisateur).
  async function provision(p) {
    const orphan = await authAdmin.findBySubject(p.sub).catch(infra("STUDIO_AUTH_UNAVAILABLE"));
    if (orphan) return orphan.id;
    // Un compte Studio existant avec la même adresse n'est JAMAIS rattaché automatiquement
    // (sinon : prise de contrôle par quiconque contrôle cette adresse côté plateforme).
    if (await authAdmin.findByEmail(p.email).catch(infra("STUDIO_AUTH_UNAVAILABLE"))) throw codeError("ACCOUNT_LINK_REQUIRED");
    try {
      return (await authAdmin.createUser({ email: p.email, platformSubject: p.sub }).catch(infra("STUDIO_AUTH_UNAVAILABLE"))).id;
    } catch (e) {
      if (!isEmailExists(e)) throw e;
      // Course : un échange concurrent du même sujet vient de créer l'utilisateur.
      const raced = await authAdmin.findBySubject(p.sub).catch(infra("STUDIO_AUTH_UNAVAILABLE"));
      if (raced) return raced.id;
      throw codeError("ACCOUNT_LINK_REQUIRED");
    }
  }

  async function linkFor(subject, studioUserId) {
    try {
      return await links.create({ subject, studioUserId });
    } catch (e) {
      if (e.code !== "LINK_CONFLICT") throw Object.assign(codeError("STUDIO_DB_UNAVAILABLE"), { cause: e });
      const existing = await links.bySubject(subject);
      if (existing?.studioUserId === studioUserId) return existing; // course bénigne
      throw codeError("LINK_CONFLICT");
    }
  }

  return {
    // Connexion « Continuer avec mon compte ELSATIA ».
    async exchange(token, expectedNonce) {
      const p = await verify(token, TYP_HANDOFF, expectedNonce);
      const granted = p.ent?.granted === true;
      let link = await links.bySubject(p.sub);

      if (!link) {
        if (!granted) throw codeError("NOT_ENTITLED"); // fail-closed : jamais de nouveau compte sans droit
        link = await linkFor(p.sub, await provision(p));
      }

      // Révocation locale déjà reçue (compte désactivé / supprimé) : un jeton encore valide
      // émis avant l'événement ne rouvre rien.
      const cached = await links.entitlementOf(link.studioUserId);
      if (cached?.account === "disabled" || cached?.account === "deleted") throw codeError("ACCOUNT_DISABLED");

      await links.saveEntitlement(link.studioUserId, p.ent ?? { granted: false });
      const session = await authAdmin.mintSession(link.studioUserId).catch(infra("STUDIO_AUTH_UNAVAILABLE"));
      return {
        studioUserId: link.studioUserId,
        session,
        // Compte existant dont le droit est retiré : session ouverte en lecture seule, jamais supprimé.
        access: granted ? "full" : "read_only",
      };
    },

    // Rattachement explicite d'un compte Studio préexistant : exige une session Studio valide
    // (preuve de possession côté Studio) ET un jeton broker valide (preuve côté plateforme).
    async linkExisting(studioSessionUserId, token, expectedNonce) {
      if (!studioSessionUserId) throw codeError("STUDIO_SESSION_REQUIRED");
      const p = await verify(token, TYP_HANDOFF, expectedNonce);
      if (await links.bySubject(p.sub)) throw codeError("SUBJECT_ALREADY_LINKED");
      if (await links.byStudioUser(studioSessionUserId)) throw codeError("STUDIO_USER_ALREADY_LINKED");
      const link = await links.create({ subject: p.sub, studioUserId: studioSessionUserId });
      await links.saveEntitlement(link.studioUserId, p.ent ?? { granted: false });
      return link;
    },

    // Webhook plateforme → Studio. Idempotent par sujet ; rejeu refusé par jti.
    //  - account_disabled / account_deleted : ban GoTrue Studio + suppression de TOUTES les sessions
    //    (le ban seul ne suffit pas : GoTrue continue de répondre 200 sur GET /user).
    //  - account_enabled : levée du ban (les sessions supprimées ne reviennent pas : reconnexion).
    //  - entitlement_revoked / entitlement_granted : cache de droit seulement (lecture seule ↔ complet).
    async revoke(eventToken) {
      const p = await verify(eventToken, TYP_REVOCATION);
      const link = await links.bySubject(p.sub);
      if (!link) return { applied: false, reason: p.reason }; // sujet jamais venu sur Studio
      const u = link.studioUserId;
      const prev = (await links.entitlementOf(u)) ?? {};
      switch (p.reason) {
        case "account_disabled":
        case "account_deleted":
          await links.saveEntitlement(u, { ...prev, granted: false, account: p.reason === "account_deleted" ? "deleted" : "disabled" });
          await authAdmin.banUser(u).catch(infra("STUDIO_AUTH_UNAVAILABLE"));
          await authAdmin.revokeSessions(u).catch(infra("STUDIO_AUTH_UNAVAILABLE"));
          break;
        case "account_enabled":
          await links.saveEntitlement(u, { ...(p.ent ?? prev), account: "active" });
          await authAdmin.unbanUser(u).catch(infra("STUDIO_AUTH_UNAVAILABLE"));
          break;
        case "entitlement_revoked":
        case "entitlement_granted":
          await links.saveEntitlement(u, { ...(p.ent ?? { granted: p.reason === "entitlement_granted" }), account: prev.account });
          break;
        default:
          throw codeError("UNKNOWN_REASON");
      }
      return { applied: true, reason: p.reason, studioUserId: u };
    },

    // Droit courant, lu côté serveur Studio à chaque requête (équivalent SQL : studio_account_entitlements).
    async accessOf(studioUserId) {
      const e = await links.entitlementOf(studioUserId);
      if (!e || e.account === "disabled" || e.account === "deleted") return "none";
      return e.granted === true ? "full" : "read_only";
    },
  };
}

// Stores en mémoire (le README décrit leur équivalent SQL).
export function memoryReplayStore(now = () => Date.now()) {
  const seen = new Map();
  return {
    async consume(jti, exp) {
      const t = Math.floor(now() / 1000);
      for (const [k, e] of seen) if (e < t - 2 * CLOCK_SKEW_S) seen.delete(k);
      if (seen.has(jti)) return false;
      seen.set(jti, exp);
      return true;
    },
  };
}

// Anti-rejeu réel en PostgreSQL : contrainte d'unicité, sûre en concurrence (plusieurs instances Next).
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function psql(dbUrl, sql) {
  return new Promise((resolve, reject) =>
    execFile("psql", ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", dbUrl, "-c", sql], (err, stdout, stderr) =>
      err ? reject(Object.assign(new Error(stderr || err.message), { cause: err })) : resolve(stdout.trim()),
    ),
  );
}
export async function pgReplayStore(dbUrl) {
  await psql(dbUrl, "create table if not exists public.studio_handoff_jti (jti uuid primary key, expires_at timestamptz not null)");
  return {
    async consume(jti, exp) {
      if (!UUID.test(jti) || !Number.isInteger(exp)) return false;
      const out = await psql(
        dbUrl,
        `insert into public.studio_handoff_jti (jti, expires_at) values ('${jti}', to_timestamp(${exp})) on conflict (jti) do nothing returning 1`,
      );
      return out === "1";
    },
  };
}

export function memoryLinkStore() {
  const bySub = new Map();
  const byUser = new Map();
  const entitlements = new Map();
  return {
    async bySubject(s) { return bySub.get(s) ?? null; },
    async byStudioUser(u) { return byUser.get(u) ?? null; },
    async create({ subject, studioUserId }) {
      if (bySub.has(subject) || byUser.has(studioUserId)) throw codeError("LINK_CONFLICT");
      const l = { subject, studioUserId };
      bySub.set(subject, l);
      byUser.set(studioUserId, l);
      return l;
    },
    async saveEntitlement(u, ent) { entitlements.set(u, ent); },
    entitlementOf(u) { return entitlements.get(u); },
  };
}
