export const STORAGE_KEYS = { favorites: "elsatia.tools.favorites", recent: "elsatia.tools.recent", migration: "elsatia.tools.storage-migration.v1" } as const;
const LEGACY_KEYS = { favorites: "elsatia-calculs-favorites", recent: "elsatia-calculs-recent" } as const;
export type StorageAdapter = Pick<Storage, "getItem" | "setItem" | "removeItem">;

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
