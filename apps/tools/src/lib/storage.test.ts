import { describe, expect, it } from "vitest";
import { createPersistentStorage, migrateLegacyStorage, migratePersistentStorage, readPersistentIds, readStoredIds, STORAGE_KEYS, type NativePreferencesAdapter, type StorageAdapter } from "./storage";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: StorageAdapter = { getItem: (key) => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: (key) => { data.delete(key); } };
  return { data, storage };
}

describe("migration du stockage local", () => {
  it("migre favoris et récents sans perte", () => {
    const { data, storage } = memoryStorage({ "elsatia-calculs-favorites": '["pente"]', "elsatia-calculs-recent": '["arche"]' });
    expect(migrateLegacyStorage(storage)).toBe(true);
    expect(data.get(STORAGE_KEYS.favorites)).toBe('["pente"]');
    expect(data.get(STORAGE_KEYS.recent)).toBe('["arche"]');
    expect(data.has("elsatia-calculs-favorites")).toBe(false);
  });

  it("ne remplace jamais une nouvelle préférence existante", () => {
    const { data, storage } = memoryStorage({ [STORAGE_KEYS.favorites]: '["cercle"]', "elsatia-calculs-favorites": '["pente"]' });
    migrateLegacyStorage(storage);
    expect(data.get(STORAGE_KEYS.favorites)).toBe('["cercle"]');
    expect(migrateLegacyStorage(storage)).toBe(false);
  });

  it("tolère un JSON corrompu", () => {
    const { storage } = memoryStorage({ [STORAGE_KEYS.recent]: "{" });
    expect(readStoredIds(storage, STORAGE_KEYS.recent)).toEqual([]);
  });
});

describe("abstraction de stockage multiplateforme", () => {
  function nativePreferences(initial: Record<string, string> = {}) {
    const data = new Map(Object.entries(initial));
    const adapter: NativePreferencesAdapter = {
      get: async ({ key }) => ({ value: data.get(key) ?? null }),
      set: async ({ key, value }) => { data.set(key, value); },
      remove: async ({ key }) => { data.delete(key); },
    };
    return { data, adapter };
  }

  it("utilise localStorage sur le Web", async () => {
    const { data, storage } = memoryStorage();
    const persistent = createPersistentStorage(storage, nativePreferences().adapter, false);
    await persistent.setItem(STORAGE_KEYS.favorites, '["pente"]');
    expect(data.get(STORAGE_KEYS.favorites)).toBe('["pente"]');
  });

  it("utilise Preferences en natif et importe les préférences Web existantes", async () => {
    const { storage } = memoryStorage({ [STORAGE_KEYS.favorites]: '["arche"]' });
    const native = nativePreferences();
    const persistent = createPersistentStorage(storage, native.adapter, true);
    expect(await migratePersistentStorage(persistent, storage)).toBe(true);
    expect(native.data.get(STORAGE_KEYS.favorites)).toBe('["arche"]');
    expect(await readPersistentIds(persistent, STORAGE_KEYS.favorites)).toEqual(["arche"]);
    expect(await migratePersistentStorage(persistent, storage)).toBe(false);
  });
});
