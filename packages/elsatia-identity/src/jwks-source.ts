// Source de clés publiques côté vérificateur.
//  - staticJwks : JWKS épinglé dans la configuration (aucune dépendance réseau) ;
//  - remoteJwks : JWKS récupéré sur l'identité centrale, mis en cache, servi « périmé » tant que
//    la plateforme est injoignable (dans une limite), relu au plus une fois par intervalle minimal
//    quand un `kid` inconnu apparaît (rotation).
import type { KeyObject } from "node:crypto";
import { IdentityError } from "./contract";
import { parsePublicJwks } from "./keys";

export interface JwksSource {
  /** Clés connues (cache). Lève JWKS_UNAVAILABLE si aucune n'est disponible. */
  get(): Promise<Map<string, KeyObject>>;
  /** Relecture forcée après un `kid` inconnu ; null si la relecture est limitée (anti-martèlement). */
  refresh(): Promise<Map<string, KeyObject> | null>;
}

export function staticJwks(jwks: unknown): JwksSource {
  const keys = parsePublicJwks(jwks);
  return { get: async () => keys, refresh: async () => null };
}

export interface RemoteJwksOptions {
  url: string;
  fetch?: typeof fetch;
  now?: () => number;
  /** Durée pendant laquelle le cache est considéré frais. */
  ttlMs?: number;
  /** Au-delà, un cache périmé n'est plus servi quand la plateforme est injoignable. */
  maxStaleMs?: number;
  /** Intervalle minimal entre deux relectures forcées (kid inconnu). */
  minRefreshIntervalMs?: number;
  timeoutMs?: number;
}

export function assertTrustedUrl(value: string, what: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new IdentityError("CONFIG_INVALID", { cause, detail: `${what} invalide` });
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
    throw new IdentityError("CONFIG_INVALID", { detail: `${what} doit être en https` });
  if (url.username || url.password) throw new IdentityError("CONFIG_INVALID", { detail: `${what} ne doit pas contenir d'identifiants` });
  return url;
}

export function remoteJwks(options: RemoteJwksOptions): JwksSource {
  const url = assertTrustedUrl(options.url, "URL JWKS").toString();
  const doFetch = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const ttl = options.ttlMs ?? 5 * 60_000;
  const maxStale = options.maxStaleMs ?? 24 * 3600_000;
  const minRefresh = options.minRefreshIntervalMs ?? 30_000;
  const timeout = options.timeoutMs ?? 3_000;
  let cache: { keys: Map<string, KeyObject>; at: number } | null = null;
  let lastAttempt = -Infinity;
  let inflight: Promise<Map<string, KeyObject>> | null = null;

  async function load(): Promise<Map<string, KeyObject>> {
    lastAttempt = now();
    const response = await doFetch(url, {
      headers: { accept: "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(timeout),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`JWKS HTTP ${response.status}`);
    const keys = parsePublicJwks(await response.json());
    cache = { keys, at: now() };
    return keys;
  }
  function loadOnce() {
    inflight ??= load().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  return {
    async get() {
      if (cache && now() - cache.at < ttl) return cache.keys;
      try {
        return await loadOnce();
      } catch (cause) {
        // Plateforme injoignable : un cache récent reste utilisable (stale-if-error borné).
        if (cache && now() - cache.at < maxStale) return cache.keys;
        throw new IdentityError("JWKS_UNAVAILABLE", { cause });
      }
    },
    async refresh() {
      if (now() - lastAttempt < minRefresh) return null;
      try {
        return await loadOnce();
      } catch (cause) {
        throw new IdentityError("JWKS_UNAVAILABLE", { cause });
      }
    },
  };
}
