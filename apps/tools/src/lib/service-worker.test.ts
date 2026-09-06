/**
 * Garde de comportement du service worker PWA reellement livre.
 *
 * On ne teste pas un brouillon : le worker est produit ici par le generateur build-time a partir
 * d'une arborescence de build factice, puis evalue dans un contexte `node:vm` muni de doublures
 * fideles de `self`, `caches`, `fetch`, `Response` et des minuteries.
 *
 * La doublure `Response` reproduit la regle qui a rendu le cache d'execution inoperant pendant tout
 * un cycle : `clone()` echoue des que le corps a commence a etre lu. La doublure `caches` reproduit
 * l'autre regle qui compte pour ce lot : chaque version ouvre SON cache, et rien n'est efface tant
 * que le precache critique de la nouvelle version n'est pas constitue.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { afterEach, describe, expect, it } from "vitest";
import { generateServiceWorker } from "../../scripts/generate-service-worker.mjs";

const ORIGIN = "https://tools.elsatia.fr";
const CSS = "/_next/static/css/app.5ff0.css";
const MAIN_JS = "/_next/static/chunks/main-1111.js";
const HOME_JS = "/_next/static/chunks/app/page-2222.js";
const LAZY_JS = "/_next/static/chunks/9001.lazy-5555.js";

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const absolute = (url: string) => new URL(url, ORIGIN).toString();
const created: string[] = [];

afterEach(() => { for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true }); });

// ---------------------------------------------------------------- build factice

function write(root: string, relativePath: string, content: string) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function shell(assets: string[]) {
  return `<!DOCTYPE html><html lang="fr"><head>${assets.map((asset) => (asset.endsWith(".css") ? `<link href="${asset}" rel="stylesheet"/>` : `<script src="${asset}"></script>`)).join("")}</head><body>ELSATIA</body></html>`;
}

/** Rend un worker complet ; `revision` simule un nouveau build (contenu du CSS modifie). */
function buildWorker(revision = "N") {
  const root = mkdtempSync(join(tmpdir(), "elsatia-swrt-"));
  created.push(root);
  write(root, ".next/server/app/index.html", shell([CSS, MAIN_JS, HOME_JS]));
  write(root, ".next/server/app/offline.html", shell([CSS, MAIN_JS]));
  write(root, ".next/server/app/projets.html", shell([CSS, MAIN_JS]));
  write(root, ".next/static/css/app.5ff0.css", `:root{--build:"${revision}"}`);
  write(root, ".next/static/chunks/main-1111.js", `/* main ${revision} */`);
  write(root, ".next/static/chunks/app/page-2222.js", `/* accueil ${revision} */`);
  write(root, ".next/static/chunks/9001.lazy-5555.js", `/* modele lazy ${revision} */`);
  return generateServiceWorker({ appDir: root, mode: "server" });
}

// ---------------------------------------------------------------- doublures navigateur

class FakeResponse {
  bodyUsed = false;
  constructor(readonly url: string, readonly ok = true) {}
  clone(): FakeResponse {
    if (this.bodyUsed) throw new TypeError("Failed to execute 'clone' on 'Response': Response body is already used");
    return new FakeResponse(this.url, this.ok);
  }
  static error() { return new FakeResponse("", false); }
}

type FakeRequest = { url: string; method: string; mode: string; headers: { get: (name: string) => string | null } };

class FakeCache {
  readonly entries = new Map<string, FakeResponse>();
  constructor(private readonly server: () => Set<string>) {}
  async put(request: FakeRequest | string, response: FakeResponse) { this.entries.set(absolute(typeof request === "string" ? request : request.url), response); }
  async add(url: string) {
    if (!this.server().has(absolute(url))) throw new TypeError(`Failed to fetch ${url}`);
    this.entries.set(absolute(url), new FakeResponse(absolute(url)));
  }
  /** `addAll` est atomique : une seule URL manquante et rien n'est ecrit. */
  async addAll(urls: string[]) {
    for (const url of urls) if (!this.server().has(absolute(url))) throw new TypeError(`Failed to fetch ${url}`);
    for (const url of urls) this.entries.set(absolute(url), new FakeResponse(absolute(url)));
  }
  async match(request: FakeRequest | string, options?: { ignoreSearch?: boolean }) {
    const wanted = absolute(typeof request === "string" ? request : request.url);
    const hit = this.entries.get(wanted);
    if (hit || !options?.ignoreSearch) return hit;
    const bare = wanted.split("?")[0];
    for (const [url, response] of this.entries) if (url.split("?")[0] === bare) return response;
    return undefined;
  }
}

type Harness = {
  listeners: Map<string, (event: unknown) => void>;
  store: Map<string, FakeCache>;
  server: Set<string>;
  network: "ok" | "fail" | "hang";
  requested: string[];
  claimed: number;
};

function loadServiceWorker(code: string, options: { store?: Map<string, FakeCache>; server?: string[]; network?: Harness["network"] } = {}): Harness {
  const listeners = new Map<string, (event: unknown) => void>();
  const harness: Harness = {
    listeners,
    store: options.store ?? new Map<string, FakeCache>(),
    server: new Set((options.server ?? []).map(absolute)),
    network: options.network ?? "ok",
    requested: [],
    claimed: 0,
  };

  const caches = {
    async open(name: string) {
      await tick();
      const existing = harness.store.get(name) ?? new FakeCache(() => harness.server);
      harness.store.set(name, existing);
      return existing;
    },
    async keys() { return [...harness.store.keys()]; },
    async delete(name: string) { return harness.store.delete(name); },
    async match(request: FakeRequest | string, matchOptions?: { ignoreSearch?: boolean }) {
      for (const cache of harness.store.values()) {
        const hit = await cache.match(request, matchOptions);
        if (hit) return hit;
      }
      return undefined;
    },
  };

  const context = createContext({
    self: {
      addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
      location: { origin: ORIGIN },
      clients: { claim: async () => { harness.claimed += 1; } },
    },
    caches,
    Response: FakeResponse,
    URL,
    Promise,
    TypeError,
    /* Delais ecrases : la course reseau/minuterie reste deterministe (microtache avant macrotache). */
    setTimeout: (callback: () => void) => setTimeout(callback, 0),
    clearTimeout,
    fetch: async (request: FakeRequest) => {
      harness.requested.push(request.url);
      if (harness.network === "fail") throw new TypeError("Failed to fetch");
      if (harness.network === "hang") return new Promise<never>(() => undefined);
      if (!harness.server.has(absolute(request.url))) return new FakeResponse(request.url, false);
      return new FakeResponse(request.url);
    },
  });
  runInContext(code, context);
  return harness;
}

function request(url: string, mode = "no-cors", headers: Record<string, string> = {}): FakeRequest {
  return { url: absolute(url), method: "GET", mode, headers: { get: (name) => headers[name] ?? null } };
}

function dispatch(harness: Harness, target: FakeRequest) {
  let answered: Promise<FakeResponse> | null = null;
  const pending: Promise<unknown>[] = [];
  harness.listeners.get("fetch")?.({
    request: target,
    respondWith: (value: Promise<FakeResponse>) => { answered = value.then((response) => { response.bodyUsed = true; return response; }); },
    waitUntil: (value: Promise<unknown>) => { pending.push(value); },
  });
  return { answered: answered as Promise<FakeResponse> | null, settled: () => Promise.allSettled(pending) };
}

async function run(harness: Harness, type: "install" | "activate") {
  const waited: Promise<unknown>[] = [];
  harness.listeners.get(type)?.({ waitUntil: (value: Promise<unknown>) => waited.push(value) });
  await Promise.all(waited);
}

const cacheNames = (harness: Harness) => [...harness.store.keys()];
const urlsIn = (harness: Harness, name: string) => [...(harness.store.get(name)?.entries.keys() ?? [])];

// ---------------------------------------------------------------- installation

describe("service worker Tools — installation", () => {
  it("precache le shell, la page hors ligne, le CSS, le JS et les chunks charges a la demande", async () => {
    const built = buildWorker();
    const harness = loadServiceWorker(built.code, { server: [...built.critical, ...built.optional] });
    await run(harness, "install");

    const cached = urlsIn(harness, `elsatia-tools-${built.version}`);
    for (const url of ["/", "/offline", CSS, MAIN_JS, HOME_JS, LAZY_JS]) expect(cached).toContain(absolute(url));
  });

  it("echoue l'installation si un asset critique est indisponible", async () => {
    const built = buildWorker();
    const available = [...built.critical, ...built.optional].filter((url) => url !== CSS);
    const harness = loadServiceWorker(built.code, { server: available });
    const waited: Promise<unknown>[] = [];
    harness.listeners.get("install")?.({ waitUntil: (value: Promise<unknown>) => waited.push(value) });

    await expect(Promise.all(waited)).rejects.toThrow(/Failed to fetch/);
  });

  it("installe quand meme si un asset optionnel manque", async () => {
    const built = buildWorker();
    const harness = loadServiceWorker(built.code, { server: [...built.critical, ...built.optional].filter((url) => url !== LAZY_JS) });
    await run(harness, "install");

    expect(urlsIn(harness, `elsatia-tools-${built.version}`)).toContain(absolute(CSS));
  });

  it("ne prend jamais la main au milieu d'une session (pas de skipWaiting)", () => {
    expect(buildWorker().code).not.toMatch(/skipWaiting\s*\(/);
  });
});

// ---------------------------------------------------------------- mise a jour

describe("service worker Tools — mise a jour N vers N+1", () => {
  async function installedVersion(revision: string, store?: Map<string, FakeCache>) {
    const built = buildWorker(revision);
    const harness = loadServiceWorker(built.code, { store, server: [...built.critical, ...built.optional] });
    await run(harness, "install");
    return { built, harness };
  }

  it("conserve le cache de la version N tant que N+1 n'est pas activee", async () => {
    const first = await installedVersion("N");
    await run(first.harness, "activate");
    const second = await installedVersion("N+1", first.harness.store);

    expect(cacheNames(second.harness)).toContain(`elsatia-tools-${first.built.version}`);
    expect(cacheNames(second.harness)).toContain(`elsatia-tools-${second.built.version}`);
  });

  it("purge la version N seulement une fois N+1 activee", async () => {
    const first = await installedVersion("N");
    await run(first.harness, "activate");
    const second = await installedVersion("N+1", first.harness.store);
    await run(second.harness, "activate");

    expect(cacheNames(second.harness)).toEqual([`elsatia-tools-${second.built.version}`]);
    expect(second.harness.claimed).toBe(1);
  });

  it("laisse la version N intacte quand le precache de N+1 echoue", async () => {
    const first = await installedVersion("N");
    await run(first.harness, "activate");

    const next = buildWorker("N+1");
    const broken = loadServiceWorker(next.code, { store: first.harness.store, server: [...next.critical, ...next.optional].filter((url) => url !== MAIN_JS) });
    const waited: Promise<unknown>[] = [];
    broken.listeners.get("install")?.({ waitUntil: (value: Promise<unknown>) => waited.push(value) });
    await expect(Promise.all(waited)).rejects.toThrow();

    /* Le worker N reste actif : hors ligne, il sert toujours son shell complet. */
    first.harness.network = "fail";
    const home = await dispatch(first.harness, request("/", "navigate")).answered;
    const css = await dispatch(first.harness, request(CSS)).answered;
    expect(home?.ok).toBe(true);
    expect(css?.ok).toBe(true);
    expect(urlsIn(first.harness, `elsatia-tools-${first.built.version}`)).toContain(absolute(MAIN_JS));
  });

  it("ne purge pas si le precache critique de la version active est incomplet", async () => {
    const first = await installedVersion("N");
    await run(first.harness, "activate");
    const second = await installedVersion("N+1", first.harness.store);
    second.harness.store.get(`elsatia-tools-${second.built.version}`)?.entries.clear();
    await run(second.harness, "activate");

    expect(cacheNames(second.harness)).toContain(`elsatia-tools-${first.built.version}`);
  });

  it("n'efface que les caches ELSATIA Tools", async () => {
    const first = await installedVersion("N");
    first.harness.store.set("elsatia-calculs-v3", new FakeCache(() => first.harness.server));
    first.harness.store.set("cache-etranger", new FakeCache(() => first.harness.server));
    await run(first.harness, "activate");

    expect(cacheNames(first.harness).sort()).toEqual([`elsatia-tools-${first.built.version}`, "cache-etranger"].sort());
  });
});

// ---------------------------------------------------------------- hors ligne

describe("service worker Tools — hors ligne", () => {
  async function offlineWorker(revision = "N") {
    const built = buildWorker(revision);
    const harness = loadServiceWorker(built.code, { server: [...built.critical, ...built.optional] });
    await run(harness, "install");
    await run(harness, "activate");
    harness.network = "fail";
    return { built, harness };
  }

  it("sert l'accueil, son CSS et son JS apres une premiere visite en ligne", async () => {
    const { harness } = await offlineWorker();
    for (const target of [request("/", "navigate"), request(CSS), request(MAIN_JS), request(HOME_JS)]) {
      const response = await dispatch(harness, target).answered;
      expect(response?.ok, target.url).toBe(true);
    }
  });

  it("sert la page hors ligne pour une navigation jamais visitee", async () => {
    const { harness } = await offlineWorker();
    const response = await dispatch(harness, request("/outils/inconnu", "navigate")).answered;
    expect(response?.url).toBe(absolute("/offline"));
  });

  it("reste fonctionnel immediatement apres une mise a jour", async () => {
    const first = await offlineWorker("N");
    first.harness.network = "ok";
    const next = buildWorker("N+1");
    const second = loadServiceWorker(next.code, { store: first.harness.store, server: [...next.critical, ...next.optional] });
    await run(second, "install");
    await run(second, "activate");
    second.network = "fail";

    for (const target of [request("/", "navigate"), request(CSS), request(MAIN_JS)]) {
      const response = await dispatch(second, target).answered;
      expect(response?.ok, target.url).toBe(true);
    }
  });
});

// ---------------------------------------------------------------- strategies reseau

describe("service worker Tools — strategies reseau", () => {
  async function ready() {
    const built = buildWorker();
    const harness = loadServiceWorker(built.code, { server: [...built.critical, ...built.optional] });
    await run(harness, "install");
    await run(harness, "activate");
    return { built, harness };
  }

  it("sert le cache quand le reseau depasse le delai, et laisse la reponse alimenter le cache", async () => {
    const { harness } = await ready();
    harness.network = "hang";
    const attempt = dispatch(harness, request("/projets", "navigate"));
    const response = await attempt.answered;

    expect(response?.ok).toBe(true);
    expect(harness.requested).toContain(absolute("/projets"));
  });

  it("prefere le reseau quand il repond avant le delai", async () => {
    const { harness } = await ready();
    const response = await dispatch(harness, request("/projets", "navigate")).answered;

    expect(response?.ok).toBe(true);
    expect(harness.requested).toContain(absolute("/projets"));
  });

  it("sert les assets immuables depuis le cache sans toucher au reseau", async () => {
    const { harness } = await ready();
    harness.requested.length = 0;
    const response = await dispatch(harness, request(CSS)).answered;

    expect(response?.ok).toBe(true);
    expect(harness.requested).toEqual([]);
  });

  it("met en cache une reponse reseau meme si son corps est consomme aussitot rendue", async () => {
    const built = buildWorker();
    const asset = "/_next/static/chunks/tardif-9999.js";
    const harness = loadServiceWorker(built.code, { server: [...built.critical, ...built.optional, asset] });
    await run(harness, "install");
    const attempt = dispatch(harness, request(asset));
    await attempt.answered;
    await attempt.settled();
    await tick();

    /* Regression historique : le clone differe levait « Response body is already used »,
       aucun asset n'etait jamais mis en cache et le shell hors ligne restait inerte. */
    expect(urlsIn(harness, `elsatia-tools-${built.version}`)).toContain(absolute(asset));
  });

  it("prend le clone de maniere synchrone, avant toute attente", () => {
    const code = buildWorker().code;
    const body = code.slice(code.indexOf("function cacheResponse"), code.indexOf("function delay"));
    expect(body.indexOf("response.clone()")).toBeLessThan(body.indexOf("caches.open"));
  });
});

// ---------------------------------------------------------------- requetes ignorees

describe("service worker Tools — requetes hors perimetre", () => {
  function fresh() {
    const built = buildWorker();
    return loadServiceWorker(built.code, { server: [...built.critical, ...built.optional] });
  }

  it("ignore les requetes non-GET, les autres origines et les chemins sensibles", () => {
    const harness = fresh();
    const ignored = [
      { ...request("/projets"), method: "POST" },
      { url: "https://exemple.supabase.co/rest/v1/projets", method: "GET", mode: "no-cors", headers: { get: () => null } },
      { url: `${ORIGIN}.attaquant.fr/`, method: "GET", mode: "navigate", headers: { get: () => null } },
      request("/api/facturation"),
      request("/auth/callback"),
    ];
    for (const target of ignored) expect(dispatch(harness, target as FakeRequest).answered, target.url).toBeNull();
    expect(harness.requested).toEqual([]);
  });

  it("laisse passer les requetes RSC sans les mettre en cache", async () => {
    const harness = fresh();
    expect(dispatch(harness, request("/projets", "no-cors", { RSC: "1" })).answered).toBeNull();
    expect(dispatch(harness, request("/projets?_rsc=abc123")).answered).toBeNull();
    expect(harness.requested).toEqual([]);
  });
});
