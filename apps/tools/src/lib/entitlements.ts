import { CAPABILITIES, FREE_ACCESS, type AccessContext, type Capability, type EntitlementSource } from "./access";

export const ENTITLEMENT_CACHE_VERSION = 1;
export const DEFAULT_OFFLINE_GRACE_SECONDS = 7 * 24 * 60 * 60;
const CACHE_KEY = "elsatia.tools.entitlement-cache.v1";
const SIGNING_KEY = "elsatia.tools.entitlement-integrity-key.v1";

export type ServerEntitlement = {
  application: "tools";
  tier: "free" | "pro";
  capabilities: string[];
  source: EntitlementSource;
  expires_at: string | null;
  validated_at: string;
  cache_version: number;
  grace_seconds: number;
};

type CachedEntitlement = { userId: string; entitlement: ServerEntitlement; signature: string };
export type EntitlementCacheResult = { access: AccessContext; state: "verified" | "offline-grace" | "expired" | "tampered" | "missing" };
export type AsyncKeyValueStore = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<unknown>; removeItem(key: string): Promise<unknown> };

function base64(bytes: Uint8Array) {
  if (typeof btoa === "function") return btoa(String.fromCharCode(...bytes));
  return Buffer.from(bytes).toString("base64");
}

function stablePayload(userId: string, entitlement: ServerEntitlement) { return JSON.stringify({ userId, entitlement }); }
async function importHmacKey(bytes: Uint8Array) { return crypto.subtle.importKey("raw", bytes.slice().buffer as ArrayBuffer, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); }

async function integrityKey(secureStore: AsyncKeyValueStore) {
  const existing = await secureStore.getItem(SIGNING_KEY);
  if (existing) return Uint8Array.from(atob(existing), (value) => value.charCodeAt(0));
  const generated = crypto.getRandomValues(new Uint8Array(32));
  await secureStore.setItem(SIGNING_KEY, base64(generated));
  return generated;
}

async function signature(value: string, secureStore: AsyncKeyValueStore) {
  const signed = await crypto.subtle.sign("HMAC", await importHmacKey(await integrityKey(secureStore)), new TextEncoder().encode(value));
  return base64(new Uint8Array(signed));
}

function validCapability(value: string): value is Capability { return (CAPABILITIES as readonly string[]).includes(value); }

export function entitlementToAccess(entitlement: ServerEntitlement): AccessContext {
  if (entitlement.application !== "tools" || entitlement.tier !== "pro") return FREE_ACCESS;
  const capabilities = entitlement.capabilities.filter(validCapability);
  return { tier: "pro", capabilities: new Set(capabilities), source: entitlement.source };
}

export async function writeEntitlementCache(userId: string, entitlement: ServerEntitlement, cacheStore: AsyncKeyValueStore, secureStore: AsyncKeyValueStore) {
  const value = stablePayload(userId, entitlement);
  const envelope: CachedEntitlement = { userId, entitlement, signature: await signature(value, secureStore) };
  await cacheStore.setItem(CACHE_KEY, JSON.stringify(envelope));
}

export async function clearEntitlementCache(cacheStore: AsyncKeyValueStore) { await cacheStore.removeItem(CACHE_KEY); }

export async function readEntitlementCache(userId: string, cacheStore: AsyncKeyValueStore, secureStore: AsyncKeyValueStore, now = Date.now()): Promise<EntitlementCacheResult> {
  const raw = await cacheStore.getItem(CACHE_KEY);
  if (!raw) return { access: FREE_ACCESS, state: "missing" };
  try {
    const cached = JSON.parse(raw) as CachedEntitlement;
    if (cached.userId !== userId || cached.entitlement.cache_version !== ENTITLEMENT_CACHE_VERSION) throw new Error("cache incompatible");
    const expected = await signature(stablePayload(cached.userId, cached.entitlement), secureStore);
    if (cached.signature !== expected) return { access: FREE_ACCESS, state: "tampered" };
    const validatedAt = Date.parse(cached.entitlement.validated_at);
    const graceMs = Math.max(0, cached.entitlement.grace_seconds) * 1000;
    const expiresAt = cached.entitlement.expires_at ? Date.parse(cached.entitlement.expires_at) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(validatedAt) || now > validatedAt + graceMs || now >= expiresAt) return { access: FREE_ACCESS, state: "expired" };
    return { access: entitlementToAccess(cached.entitlement), state: "offline-grace" };
  } catch { return { access: FREE_ACCESS, state: "tampered" }; }
}
