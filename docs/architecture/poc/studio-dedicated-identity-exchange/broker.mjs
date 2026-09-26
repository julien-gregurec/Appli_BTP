// POC uniquement. « Broker d'identité ELSATIA » : tourne côté projet Supabase PARTAGÉ
// (Gestion Pro / hub compte). Il ne voit que l'identité et la décision d'accès, jamais
// les données métier Studio. Clé privée asymétrique : Studio ne détient que la clé publique.
import { generateKeyPairSync, randomUUID, createHash } from "node:crypto";
import { signEs256 } from "./jws.mjs";

export function createBroker({ issuer, now = () => Date.now(), ttlSeconds = 60 }) {
  const keys = new Map(); // kid -> { privateKey, publicJwk }
  let activeKid = null;

  function rotate() {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const kid = `k-${randomUUID().slice(0, 8)}`;
    keys.set(kid, { privateKey, publicJwk: { ...publicKey.export({ format: "jwk" }), kid, alg: "ES256", use: "sig" } });
    activeKid = kid;
    return kid;
  }
  rotate();

  return {
    rotate,
    retire(kid) { keys.delete(kid); },
    jwks() { return { keys: [...keys.values()].map((k) => k.publicJwk) }; },
    // `session` = utilisateur déjà authentifié sur le projet partagé (auth.getUser() côté serveur).
    // `entitlement` = décision calculée par la plateforme (ex. a_acces_application / entitlements par compte).
    issue({ session, entitlement, audience, nonce }) {
      if (!session?.id || !session?.email) throw new Error("broker: session requise");
      const iat = Math.floor(now() / 1000);
      const payload = {
        iss: issuer,
        aud: audience,
        // Sujet opaque, stable, propre à l'audience : Studio ne reçoit jamais l'UUID auth.users brut.
        sub: createHash("sha256").update(`${issuer}|${audience}|${session.id}`).digest("base64url"),
        email: session.email,
        email_verified: Boolean(session.email_verified),
        ent: entitlement,
        nonce, // lie le jeton à la requête Studio d'origine (anti-injection de jeton)
        iat,
        nbf: iat,
        exp: iat + ttlSeconds,
        jti: randomUUID(),
      };
      const k = keys.get(activeKid);
      return signEs256(payload, k.privateKey, activeKid);
    },
  };
}
