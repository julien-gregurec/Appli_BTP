/**
 * Favoris & récents du module Conseils & Techniques.
 *
 * Réutilise les primitives de stockage Tools (`@/lib/storage`) — web localStorage ou
 * Capacitor Preferences en natif — sous un **namespace dédié**. Aucune table Supabase.
 */
import {
  createPersistentStorage,
  readPersistentIds,
  type PersistentStorageAdapter,
  type StorageAdapter,
} from "../storage";

export const CONSEILS_STORAGE_KEYS = {
  favorites: "elsatia.tools.conseils.favorites",
  recent: "elsatia.tools.conseils.recent",
} as const;

export const CONSEILS_RECENT_LIMIT = 8;
export const CONSEILS_FAVORITES_LIMIT = 60;

/** Bascule un id dans une liste de favoris (ajout en tête / retrait). Fonction pure. */
export function toggleId(ids: readonly string[], id: string, limit = CONSEILS_FAVORITES_LIMIT): string[] {
  return ids.includes(id)
    ? ids.filter((value) => value !== id)
    : [id, ...ids].slice(0, limit);
}

/** Pousse un id en tête des récents, sans doublon, borné à `limit`. Fonction pure. */
export function pushRecentId(ids: readonly string[], id: string, limit = CONSEILS_RECENT_LIMIT): string[] {
  return [id, ...ids.filter((value) => value !== id)].slice(0, limit);
}

async function readIds(storage: PersistentStorageAdapter, key: string): Promise<string[]> {
  return readPersistentIds<string>(storage, key);
}

async function writeIds(storage: PersistentStorageAdapter, key: string, ids: readonly string[]): Promise<void> {
  await storage.setItem(key, JSON.stringify(ids));
}

export type ConseilsStore = {
  readFavorites(): Promise<string[]>;
  toggleFavorite(id: string): Promise<string[]>;
  readRecent(): Promise<string[]>;
  pushRecent(id: string): Promise<string[]>;
};

/**
 * Construit un accès aux favoris / récents Conseils. `webStorage` par défaut =
 * `localStorage` (à ne passer explicitement que dans les tests / SSR guards).
 */
export function createConseilsStore(webStorage: StorageAdapter): ConseilsStore {
  const storage = createPersistentStorage(webStorage);
  return {
    async readFavorites() {
      return readIds(storage, CONSEILS_STORAGE_KEYS.favorites);
    },
    async toggleFavorite(id: string) {
      const next = toggleId(await readIds(storage, CONSEILS_STORAGE_KEYS.favorites), id);
      await writeIds(storage, CONSEILS_STORAGE_KEYS.favorites, next);
      return next;
    },
    async readRecent() {
      return readIds(storage, CONSEILS_STORAGE_KEYS.recent);
    },
    async pushRecent(id: string) {
      const next = pushRecentId(await readIds(storage, CONSEILS_STORAGE_KEYS.recent), id);
      await writeIds(storage, CONSEILS_STORAGE_KEYS.recent, next);
      return next;
    },
  };
}
