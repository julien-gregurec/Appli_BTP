import { Preferences } from "@capacitor/preferences";
import { isNativeRuntime } from "./platform";

export const STORAGE_KEYS = { favorites: "elsatia.tools.favorites", recent: "elsatia.tools.recent", migration: "elsatia.tools.storage-migration.v1" } as const;
const LEGACY_KEYS = { favorites: "elsatia-calculs-favorites", recent: "elsatia-calculs-recent" } as const;
export type StorageAdapter = Pick<Storage, "getItem" | "setItem" | "removeItem">;
export type PersistentStorageAdapter = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};
export type NativePreferencesAdapter = {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
  remove(options: { key: string }): Promise<void>;
};

export function migrateLegacyStorage(storage: StorageAdapter) {
  if (storage.getItem(STORAGE_KEYS.migration) === "done") return false;
  for (const kind of ["favorites", "recent"] as const) {
    const target = STORAGE_KEYS[kind];
    const legacy = LEGACY_KEYS[kind];
    if (storage.getItem(target) === null) {
      const value = storage.getItem(legacy);
      if (value !== null) storage.setItem(target, value);
    }
    storage.removeItem(legacy);
  }
  storage.setItem(STORAGE_KEYS.migration, "done");
  return true;
}

export function readStoredIds<T extends string>(storage: StorageAdapter, key: string): T[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is T => typeof value === "string") : [];
  } catch { return []; }
}

export function createPersistentStorage(webStorage: StorageAdapter, nativePreferences: NativePreferencesAdapter = Preferences, native = isNativeRuntime()): PersistentStorageAdapter {
  if (!native) return {
    getItem: async (key) => webStorage.getItem(key),
    setItem: async (key, value) => { webStorage.setItem(key, value); },
    removeItem: async (key) => { webStorage.removeItem(key); },
  };
  return {
    getItem: async (key) => (await nativePreferences.get({ key })).value,
    setItem: async (key, value) => { await nativePreferences.set({ key, value }); },
    removeItem: async (key) => { await nativePreferences.remove({ key }); },
  };
}

export async function migratePersistentStorage(storage: PersistentStorageAdapter, webStorage: StorageAdapter) {
  migrateLegacyStorage(webStorage);
  if (await storage.getItem(STORAGE_KEYS.migration) === "done") return false;
  for (const key of [STORAGE_KEYS.favorites, STORAGE_KEYS.recent]) {
    if (await storage.getItem(key) === null) {
      const webValue = webStorage.getItem(key);
      if (webValue !== null) await storage.setItem(key, webValue);
    }
  }
  await storage.setItem(STORAGE_KEYS.migration, "done");
  return true;
}

export async function readPersistentIds<T extends string>(storage: PersistentStorageAdapter, key: string): Promise<T[]> {
  try {
    const parsed: unknown = JSON.parse(await storage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is T => typeof value === "string") : [];
  } catch {
    return [];
  }
}
