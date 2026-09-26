// POC uniquement. Côté projet Supabase DÉDIÉ Studio : vérifie le jeton du broker,
// rattache l'identité ELSATIA à un utilisateur Auth Studio, ouvre une session Studio.
import { verifyEs256, codeError } from "./jws.mjs";

const CLOCK_SKEW_S = 30;

export function createStudioExchange({ issuer, audience, getJwks, refreshJwks, replay, links, authAdmin, now = () => Date.now() }) {
  async function verify(token, expectedNonce) {
    let verified;
    try {
      verified = verifyEs256(token, await getJwks());
    } catch (e) {
      // kid inconnu : une seule relecture du JWKS (rotation de clé), puis échec.
      if (e.code !== "UNKNOWN_KID" || !refreshJwks) throw e;
      verified = verifyEs256(token, await refreshJwks());
    }
    const p = verified.payload;
    const t = Math.floor(now() / 1000);
    if (p.iss !== issuer) throw codeError("BAD_ISSUER");
    if (p.aud !== audience) throw codeError("BAD_AUDIENCE");
    if (typeof p.exp !== "number" || t > p.exp + CLOCK_SKEW_S) throw codeError("EXPIRED");
    if (typeof p.nbf !== "number" || t + CLOCK_SKEW_S < p.nbf) throw codeError("NOT_YET_VALID");
    if (p.exp - p.iat > 300) throw codeError("TTL_TOO_LONG");
    if (!expectedNonce || p.nonce !== expectedNonce) throw codeError("NONCE_MISMATCH");
    if (p.email_verified !== true) throw codeError("EMAIL_NOT_VERIFIED");
    if (typeof p.sub !== "string" || !p.sub || typeof p.jti !== "string") throw codeError("MALFORMED");
    // Anti-rejeu : jti consommé une seule fois (en prod : table unique + purge après exp).
    if (!(await replay.consume(p.jti, p.exp))) throw codeError("REPLAY");
    return p;
  }

  return {
    // Connexion « Continuer avec mon compte ELSATIA ».
    async exchange(token, expectedNonce) {
      const p = await verify(token, expectedNonce);
      const granted = p.ent?.granted === true;
      let link = await links.bySubject(p.sub);

      if (!link) {
        if (!granted) throw codeError("NOT_ENTITLED"); // fail-closed : jamais de nouveau compte sans droit
        // Un compte Studio existant avec la même adresse n'est JAMAIS rattaché automatiquement
        // (sinon : prise de contrôle par quiconque contrôle cette adresse côté plateforme).
        if (await authAdmin.findByEmail(p.email)) throw codeError("ACCOUNT_LINK_REQUIRED");
        const user = await authAdmin.createUser({ email: p.email, platformSubject: p.sub });
        link = await links.create({ subject: p.sub, studioUserId: user.id });
      }

      await links.saveEntitlement(link.studioUserId, p.ent ?? { granted: false });
      const session = await authAdmin.mintSession(link.studioUserId);
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
      const p = await verify(token, expectedNonce);
      if (await links.bySubject(p.sub)) throw codeError("SUBJECT_ALREADY_LINKED");
      if (await links.byStudioUser(studioSessionUserId)) throw codeError("STUDIO_USER_ALREADY_LINKED");
      const link = await links.create({ subject: p.sub, studioUserId: studioSessionUserId });
      await links.saveEntitlement(link.studioUserId, p.ent ?? { granted: false });
      return link;
    },
  };
}

// Stores en mémoire (le README décrit leur équivalent SQL).
export function memoryReplayStore(now = () => Date.now()) {
  const seen = new Map();
  return {
    async consume(jti, exp) {
      const t = Math.floor(now() / 1000);
      for (const [k, e] of seen) if (e < t - 60) seen.delete(k);
      if (seen.has(jti)) return false;
      seen.set(jti, exp);
      return true;
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
