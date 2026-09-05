import { describe, expect, it } from "vitest";
import type { StorageAdapter } from "../storage";
import {
  CONSEILS_RECENT_LIMIT,
  CONSEILS_STORAGE_KEYS,
  createConseilsStore,
  pushRecentId,
  toggleId,
} from "./storage";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage: StorageAdapter = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
  return { data, storage };
}

describe("helpers purs favoris / récents", () => {
  it("toggleId ajoute en tête puis retire", () => {
    expect(toggleId([], "a")).toEqual(["a"]);
    expect(toggleId(["b"], "a")).toEqual(["a", "b"]);
    expect(toggleId(["a", "b"], "a")).toEqual(["b"]);
  });

  it("toggleId borne la liste", () => {
    expect(toggleId(["a", "b"], "c", 2)).toEqual(["c", "a"]);
  });

  it("pushRecentId déduplique et borne", () => {
    expect(pushRecentId(["a", "b"], "b")).toEqual(["b", "a"]);
    const long = Array.from({ length: CONSEILS_RECENT_LIMIT + 3 }, (_, i) => `f${i}`);
    expect(pushRecentId(long, "nouveau")).toHaveLength(CONSEILS_RECENT_LIMIT);
    expect(pushRecentId(long, "nouveau")[0]).toBe("nouveau");
  });
});

describe("createConseilsStore (namespace dédié)", () => {
  it("utilise des clés distinctes de celles du catalogue Tools", () => {
    expect(CONSEILS_STORAGE_KEYS.favorites).toBe("elsatia.tools.conseils.favorites");
    expect(CONSEILS_STORAGE_KEYS.recent).toBe("elsatia.tools.conseils.recent");
  });

  it("persiste les favoris et les récents", async () => {
    const { data, storage } = memoryStorage();
    const store = createConseilsStore(storage);

    expect(await store.readFavorites()).toEqual([]);
    expect(await store.toggleFavorite("cf-1")).toEqual(["cf-1"]);
    expect(await store.toggleFavorite("cf-2")).toEqual(["cf-2", "cf-1"]);
    expect(await store.toggleFavorite("cf-1")).toEqual(["cf-2"]);
    expect(JSON.parse(data.get(CONSEILS_STORAGE_KEYS.favorites)!)).toEqual(["cf-2"]);

    await store.pushRecent("cf-3");
    await store.pushRecent("cf-4");
    await store.pushRecent("cf-3");
    expect(await store.readRecent()).toEqual(["cf-3", "cf-4"]);
  });

  it("tolère un contenu stocké corrompu", async () => {
    const { storage } = memoryStorage({ [CONSEILS_STORAGE_KEYS.favorites]: "{{{" });
    const store = createConseilsStore(storage);
    expect(await store.readFavorites()).toEqual([]);
  });
});
