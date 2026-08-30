import { describe, expect, it } from "vitest";
import { migrateLegacyStorage, readStoredIds, STORAGE_KEYS, type StorageAdapter } from "./storage";

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
