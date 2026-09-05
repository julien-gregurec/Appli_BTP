/**
 * Garde de non-regression du service worker PWA (`public/sw-tools.js`).
 *
 * Le fichier n'est pas un module : il est evalue ici dans un contexte `node:vm` muni de
 * doublures fideles de `self`, `caches`, `fetch` et `Response`. La doublure `Response`
 * reproduit la seule regle qui compte pour ce lot : `clone()` echoue des que le corps a
 * commence a etre lu. C'est ce qui a rendu le cache d'execution totalement inoperant
 * (shell hors ligne sans JS ni CSS) tant que le clone etait pris apres `caches.open`.
 */
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const SW_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "public", "sw-tools.js");
const ORIGIN = "https://tools.elsatia.fr";

/** Rend la main apres la file de macrotaches : `caches.open` n'est jamais synchrone. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

class FakeResponse {
  bodyUsed = false;
  constructor(readonly url: string, readonly ok = true) {}
  clone(): FakeResponse {
    if (this.bodyUsed) throw new TypeError("Failed to execute 'clone' on 'Response': Response body is already used");
    return new FakeResponse(this.url, this.ok);
  }
  static error() { return new FakeResponse("", false); }
}

class FakeCache {
  readonly entries = new Map<string, FakeResponse>();
  async put(request: { url: string }, response: FakeResponse) { this.entries.set(request.url, response); }
  async addAll(urls: string[]) { for (const url of urls) this.entries.set(new URL(url, ORIGIN).toString(), new FakeResponse(url)); }
  async match(request: { url: string } | string) {
    const url = new URL(typeof request === "string" ? request : request.url, ORIGIN).toString();
    return this.entries.get(url) ?? undefined;
  }
}

type SwHarness = {
  listeners: Map<string, (event: unknown) => void>;
  store: Map<string, FakeCache>;
  requested: string[];
};

function loadServiceWorker(): SwHarness {
  const listeners = new Map<string, (event: unknown) => void>();
  const store = new Map<string, FakeCache>();
  const requested: string[] = [];

  const caches = {
    async open(name: string) {
      await tick();
      const existing = store.get(name) ?? new FakeCache();
      store.set(name, existing);
      return existing;
    },
    async keys() { return [...store.keys()]; },
    async delete(name: string) { return store.delete(name); },
    async match(request: { url: string } | string) {
      for (const cache of store.values()) {
        const hit = await cache.match(request);
        if (hit) return hit;
      }
      return undefined;
    },
  };

  const context = createContext({
    self: {
      addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
      location: { origin: ORIGIN },
      skipWaiting: () => undefined,
      clients: { claim: () => undefined },
    },
    caches,
    Response: FakeResponse,
    URL,
    Promise,
    setTimeout,
    fetch: async (request: { url: string }) => { requested.push(request.url); return new FakeResponse(request.url); },
  });
  runInContext(readFileSync(SW_PATH, "utf8"), context);
  return { listeners, store, requested };
}

/** Reproduit `respondWith` : le corps de la reponse rendue est consomme des qu'elle est disponible. */
function dispatchFetch(harness: SwHarness, url: string, mode: "navigate" | "no-cors" = "no-cors") {
  const request = { url, method: "GET", mode };
  let answered: Promise<FakeResponse> = Promise.resolve(FakeResponse.error());
  const pending: Promise<unknown>[] = [];
  harness.listeners.get("fetch")?.({
    request,
    respondWith: (value: Promise<FakeResponse>) => { answered = value.then((response) => { response.bodyUsed = true; return response; }); },
    waitUntil: (value: Promise<unknown>) => { pending.push(value); },
  });
  return { answered, settled: () => Promise.all(pending) };
}

function cacheOf(harness: SwHarness) {
  const [cache] = [...harness.store.values()];
  return cache;
}

describe("service worker Tools — precache d'installation", () => {
  it("met en cache le shell hors ligne, dont l'accueil et la page /offline", async () => {
    const harness = loadServiceWorker();
    const waited: Promise<unknown>[] = [];
    harness.listeners.get("install")?.({ waitUntil: (value: Promise<unknown>) => waited.push(value) });
    await Promise.all(waited);

    const urls = [...cacheOf(harness).entries.keys()];
    expect(urls).toContain(`${ORIGIN}/`);
    expect(urls).toContain(`${ORIGIN}/offline`);
    expect(urls).toContain(`${ORIGIN}/projets`);
    expect(urls.length).toBeGreaterThan(25);
  });

  it("purge les caches des versions precedentes a l'activation", async () => {
    const harness = loadServiceWorker();
    harness.store.set("elsatia-tools-v1", new FakeCache());
    harness.store.set("elsatia-calculs-v3", new FakeCache());
    harness.store.set("cache-etranger", new FakeCache());
    const waited: Promise<unknown>[] = [];
    harness.listeners.get("activate")?.({ waitUntil: (value: Promise<unknown>) => waited.push(value) });
    await Promise.all(waited);

    expect([...harness.store.keys()]).toEqual(["cache-etranger"]);
  });
});

describe("service worker Tools — cache d'execution", () => {
  it("met en cache une reponse reseau meme si son corps est consomme aussitot rendue", async () => {
    const harness = loadServiceWorker();
    const asset = `${ORIGIN}/_next/static/chunks/app/page-abc123.js`;
    const { answered, settled } = dispatchFetch(harness, asset);

    await answered;
    await settled();
    await tick();

    // Regression historique : le clone differe levait « Response body is already used »,
    // aucun asset n'etait jamais mis en cache et le shell hors ligne restait inerte.
    expect([...cacheOf(harness).entries.keys()]).toContain(asset);
  });

  it("declare l'ecriture de cache via waitUntil pour survivre a l'arret du worker", async () => {
    const harness = loadServiceWorker();
    const { answered, settled } = dispatchFetch(harness, `${ORIGIN}/outils/pente`, "navigate");
    await answered;
    await expect(settled()).resolves.toBeInstanceOf(Array);
    expect([...cacheOf(harness).entries.keys()]).toContain(`${ORIGIN}/outils/pente`);
  });

  it("ignore les requetes non-GET et les origines tierces", async () => {
    const harness = loadServiceWorker();
    let responded = false;
    harness.listeners.get("fetch")?.({
      request: { url: `${ORIGIN}/outils/pente`, method: "POST", mode: "no-cors" },
      respondWith: () => { responded = true; },
      waitUntil: () => undefined,
    });
    harness.listeners.get("fetch")?.({
      request: { url: "https://exemple.supabase.co/rest/v1/projets", method: "GET", mode: "no-cors" },
      respondWith: () => { responded = true; },
      waitUntil: () => undefined,
    });

    expect(responded).toBe(false);
    expect(harness.requested).toEqual([]);
  });
});
