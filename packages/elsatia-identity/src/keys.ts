// Clés de signature de l'identité centrale et leur rotation.
//
// Côté émetteur (plateforme) : une variable d'environnement serveur, JAMAIS dans le dépôt,
//   ELSATIA_IDENTITY_SIGNING_KEYS = {
//     "current":  { JWK privé EC P-256 avec "kid" },
//     "previous": { JWK (privé ou public) de la clé retirée, avec "kid" }      // facultatif
//     "previous_retire_at": "2026-10-03T00:00:00Z"                              // requis avec previous
//   }
// Seule `current` signe. `previous` reste publiée dans le JWKS jusqu'à `previous_retire_at`
// (fenêtre de rotation ≤ 7 jours) pour les vérificateurs dont le cache JWKS est plus ancien et
// les jetons émis juste avant la bascule. Après cette date elle n'est plus publiée du tout.
//
// Côté vérificateur (Studio) : uniquement des clés PUBLIQUES (JWKS récupéré ou épinglé). Un JWKS
// qui contient une composante privée (`d`) est refusé entièrement : erreur de configuration grave.
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomUUID, type KeyObject } from "node:crypto";
import { IdentityError, MAX_ROTATION_WINDOW_S } from "./contract";

const KID = /^[A-Za-z0-9._-]{4,64}$/;

export interface PublicJwk {
  kty: "EC";
  crv: "P-256";
  x: string;
  y: string;
  kid: string;
  alg: "ES256";
  use: "sig";
}
export interface Jwks {
  keys: PublicJwk[];
}

export interface SigningKeyRing {
  /** `kid` de la clé qui signe. */
  readonly kid: string;
  readonly privateKey: KeyObject;
  /** JWKS publiable à l'instant `now` (clé courante + précédente tant que la fenêtre est ouverte). */
  jwks(now?: Date): Jwks;
}

type AnyJwk = Record<string, unknown>;

function toPublicJwk(jwk: AnyJwk, what: string): PublicJwk {
  if (jwk.kty !== "EC" || jwk.crv !== "P-256") throw new IdentityError("CONFIG_INVALID", { detail: `${what}: EC P-256 requis` });
  if (typeof jwk.kid !== "string" || !KID.test(jwk.kid)) throw new IdentityError("CONFIG_INVALID", { detail: `${what}: kid invalide` });
  if (jwk.alg !== undefined && jwk.alg !== "ES256") throw new IdentityError("CONFIG_INVALID", { detail: `${what}: alg ES256 requis` });
  if (jwk.use !== undefined && jwk.use !== "sig") throw new IdentityError("CONFIG_INVALID", { detail: `${what}: use=sig requis` });
  // Normalise via node:crypto : rejette les points hors courbe.
  let exported: AnyJwk;
  try {
    exported = createPublicKey({ key: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y } as never, format: "jwk" }).export({
      format: "jwk",
    }) as AnyJwk;
  } catch (cause) {
    throw new IdentityError("CONFIG_INVALID", { cause, detail: `${what}: point EC invalide` });
  }
  return { kty: "EC", crv: "P-256", x: String(exported.x), y: String(exported.y), kid: jwk.kid, alg: "ES256", use: "sig" };
}

/** Analyse la configuration de l'émetteur. `now` sert à valider la fenêtre de rotation. */
export function parseSigningKeys(raw: string | undefined, now: Date = new Date()): SigningKeyRing {
  if (!raw) throw new IdentityError("CONFIG_INVALID", { detail: "ELSATIA_IDENTITY_SIGNING_KEYS absente" });
  let config: AnyJwk;
  try {
    config = JSON.parse(raw) as AnyJwk;
  } catch (cause) {
    throw new IdentityError("CONFIG_INVALID", { cause, detail: "JSON invalide" });
  }
  const current = config.current as AnyJwk | undefined;
  if (!current || typeof current !== "object") throw new IdentityError("CONFIG_INVALID", { detail: "current requis" });
  if (typeof current.d !== "string") throw new IdentityError("CONFIG_INVALID", { detail: "current: clé privée requise" });
  const currentPublic = toPublicJwk(current, "current");
  let privateKey: KeyObject;
  try {
    privateKey = createPrivateKey({ key: { kty: "EC", crv: "P-256", x: current.x, y: current.y, d: current.d } as never, format: "jwk" });
  } catch (cause) {
    throw new IdentityError("CONFIG_INVALID", { cause, detail: "current: clé privée illisible" });
  }

  let previousPublic: PublicJwk | null = null;
  let retireAt: Date | null = null;
  if (config.previous !== undefined && config.previous !== null) {
    previousPublic = toPublicJwk(config.previous as AnyJwk, "previous");
    if (previousPublic.kid === currentPublic.kid) throw new IdentityError("CONFIG_INVALID", { detail: "previous.kid = current.kid" });
    if (typeof config.previous_retire_at !== "string")
      throw new IdentityError("CONFIG_INVALID", { detail: "previous_retire_at requis avec previous" });
    retireAt = new Date(config.previous_retire_at);
    if (Number.isNaN(retireAt.getTime())) throw new IdentityError("CONFIG_INVALID", { detail: "previous_retire_at invalide" });
    if (retireAt.getTime() - now.getTime() > MAX_ROTATION_WINDOW_S * 1000)
      throw new IdentityError("CONFIG_INVALID", { detail: "fenêtre de rotation > 7 jours" });
  }

  return {
    kid: currentPublic.kid,
    privateKey,
    jwks(at: Date = new Date()) {
      const keys = [currentPublic];
      if (previousPublic && retireAt && at < retireAt) keys.push(previousPublic);
      return { keys };
    },
  };
}

/** Analyse un JWKS de vérification : clés publiques EC P-256 uniquement, composante privée interdite. */
export function parsePublicJwks(value: unknown): Map<string, KeyObject> {
  if (!value || typeof value !== "object" || !Array.isArray((value as { keys?: unknown }).keys))
    throw new IdentityError("CONFIG_INVALID", { detail: "JWKS invalide" });
  const keys = new Map<string, KeyObject>();
  for (const jwk of (value as { keys: AnyJwk[] }).keys) {
    if (!jwk || typeof jwk !== "object") throw new IdentityError("CONFIG_INVALID", { detail: "JWK invalide" });
    if ("d" in jwk) throw new IdentityError("CONFIG_INVALID", { detail: "JWKS contenant une clé privée refusé" });
    // Les clés d'autres types sont ignorées (un JWKS peut en publier), jamais utilisées.
    if (jwk.kty !== "EC" || jwk.crv !== "P-256" || (jwk.alg !== undefined && jwk.alg !== "ES256")) continue;
    if (jwk.use !== undefined && jwk.use !== "sig") continue;
    const pub = toPublicJwk(jwk, "jwks");
    if (keys.has(pub.kid)) throw new IdentityError("CONFIG_INVALID", { detail: `kid dupliqué ${pub.kid}` });
    keys.set(pub.kid, createPublicKey({ key: { kty: "EC", crv: "P-256", x: pub.x, y: pub.y } as never, format: "jwk" }));
  }
  if (keys.size === 0) throw new IdentityError("CONFIG_INVALID", { detail: "JWKS sans clé ES256" });
  return keys;
}

/** Génère une paire de clés (outil de rotation et tests). La clé privée ne doit jamais être commitée. */
export function generateSigningKey(kid = `elsatia-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`) {
  if (!KID.test(kid)) throw new IdentityError("CONFIG_INVALID", { detail: "kid invalide" });
  const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const privateJwk = { ...(privateKey.export({ format: "jwk" }) as AnyJwk), kid, alg: "ES256", use: "sig" };
  const publicJwk = { ...(publicKey.export({ format: "jwk" }) as AnyJwk), kid, alg: "ES256", use: "sig" } as unknown as PublicJwk;
  return { kid, privateJwk, publicJwk };
}
