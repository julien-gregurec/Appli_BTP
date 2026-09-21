import { describe, expect, it } from "vitest";
import { readEntitlementCache, writeEntitlementCache, type AsyncKeyValueStore, type ServerEntitlement } from "./entitlements";

class MemoryStore implements AsyncKeyValueStore {
  values = new Map<string, string>(); async getItem(key: string) { return this.values.get(key) ?? null; }
  async setItem(key: string, value: string) { this.values.set(key, value); }
  async removeItem(key: string) { this.values.delete(key); }
}
const entitlement: ServerEntitlement = { application: "tools", tier: "pro", capabilities: ["saved-projects", "export-pdf"], source: "internal", expires_at: null, validated_at: "2026-08-30T10:00:00.000Z", cache_version: 1, grace_seconds: 604800 };

describe("cache local des entitlements", () => {
  it("restaure Pro hors ligne pendant la grâce", async () => {
    const cache = new MemoryStore(); const secure = new MemoryStore();
    await writeEntitlementCache("user-a", entitlement, cache, secure);
    const result = await readEntitlementCache("user-a", cache, secure, Date.parse("2026-09-05T10:00:00.000Z"));
    expect(result.state).toBe("offline-grace"); expect(result.access.tier).toBe("pro"); expect(result.access.capabilities.has("export-pdf")).toBe(true);
  });
  it("retombe sur Free après sept jours", async () => {
    const cache = new MemoryStore(); const secure = new MemoryStore(); await writeEntitlementCache("user-a", entitlement, cache, secure);
    expect((await readEntitlementCache("user-a", cache, secure, Date.parse("2026-09-06T10:00:01.000Z"))).access.tier).toBe("free");
  });
  it("refuse un cache falsifié et un cache appartenant à un autre compte", async () => {
    const cache = new MemoryStore(); const secure = new MemoryStore(); await writeEntitlementCache("user-a", entitlement, cache, secure);
    const key = [...cache.values.keys()][0]; cache.values.set(key, cache.values.get(key)!.replace('"tier":"pro"', '"tier":"free"'));
    expect((await readEntitlementCache("user-a", cache, secure)).state).toBe("tampered");
    expect((await readEntitlementCache("user-b", cache, secure)).access.tier).toBe("free");
  });
  it("respecte l'expiration serveur même dans la fenêtre de grâce", async () => {
    const cache = new MemoryStore(); const secure = new MemoryStore();
    await writeEntitlementCache("user-a", { ...entitlement, expires_at: "2026-08-31T00:00:00Z" }, cache, secure);
    expect((await readEntitlementCache("user-a", cache, secure, Date.parse("2026-09-01T00:00:00Z"))).state).toBe("expired");
  });
  it("ne restaure jamais l'entitlement d'une autre entreprise", async () => {
    const cache = new MemoryStore(); const secure = new MemoryStore();
    await writeEntitlementCache("user-a", entitlement, cache, secure, "entreprise-a");
    expect((await readEntitlementCache("user-a", cache, secure, Date.parse("2026-08-31T10:00:00Z"), "entreprise-a")).access.tier).toBe("pro");
    expect((await readEntitlementCache("user-a", cache, secure, Date.parse("2026-08-31T10:00:00Z"), "entreprise-b")).access.tier).toBe("free");
  });
});
