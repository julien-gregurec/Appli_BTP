/**
 * Garde du generateur build-time du service worker (`scripts/generate-service-worker.mjs`).
 *
 * Le manifeste de precache n'est jamais ecrit a la main : il est derive de la sortie de
 * `next build`. Ces tests reconstituent une arborescence de build minimale mais fidele
 * (HTML prerendus, chunks hashes, feuille CSS, chunk lazy non reference, route de recette,
 * route interne) et verifient que le plan produit est complet, deterministe et sans URL sensible.
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collectBuildAssets, computeVersion, generateServiceWorker, planPrecache, referencedAssets } from "../../scripts/generate-service-worker.mjs";

const created: string[] = [];

afterEach(() => { for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function write(root: string, relativePath: string, content: string) {
  const target = join(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, content);
}

function shell(assets: string[]) {
  const tags = assets.map((asset) => (asset.endsWith(".css") ? `<link href="${asset}" rel="stylesheet"/>` : `<script src="${asset}"></script>`));
  return `<!DOCTYPE html><html lang="fr"><head>${tags.join("")}</head><body>ELSATIA</body></html>`;
}

/** Arborescence calquee sur `.next` : HTML prerendus, `static/`, `public/`. */
function buildFixture(overrides: Record<string, string> = {}) {
  const root = mkdtempSync(join(tmpdir(), "elsatia-sw-"));
  created.push(root);
  const shellAssets = ["/_next/static/css/app.5ff0.css", "/_next/static/chunks/main-1111.js"];
  write(root, ".next/server/app/index.html", shell([...shellAssets, "/_next/static/chunks/app/page-2222.js"]));
  write(root, ".next/server/app/offline.html", shell(shellAssets));
  write(root, ".next/server/app/projets.html", shell([...shellAssets, "/_next/static/chunks/app/projets/page-3333.js"]));
  write(root, ".next/server/app/outils/pente.html", shell([...shellAssets, "/_next/static/chunks/app/outils/%5Bid%5D/page-4444.js"]));
  write(root, ".next/server/app/atelier-preview.html", shell(shellAssets));
  write(root, ".next/server/app/_not-found.html", shell(shellAssets));
  write(root, ".next/server/app/manifest.webmanifest.body", '{"name":"ELSATIA Tools"}');
  write(root, ".next/static/css/app.5ff0.css", ":root{--amber:#f5aa22}");
  write(root, ".next/static/chunks/main-1111.js", "/* main */");
  write(root, ".next/static/chunks/app/page-2222.js", "/* accueil */");
  write(root, ".next/static/chunks/app/projets/page-3333.js", "/* projets */");
  write(root, ".next/static/chunks/app/outils/[id]/page-4444.js", "/* outil */");
  write(root, ".next/static/chunks/9001.lazy-5555.js", "/* modele geometrique charge a la demande */");
  write(root, "public/icon.svg", "<svg/>");
  for (const [path, content] of Object.entries(overrides)) write(root, path, content);
  return root;
}

/** Arborescence calquee sur `out/` : URL a slash final et charges Flight de l'export statique. */
function exportFixture() {
  const root = mkdtempSync(join(tmpdir(), "elsatia-sw-export-"));
  created.push(root);
  write(root, "out/index.html", shell(["/_next/static/chunks/main-1111.js"]));
  write(root, "out/index.txt", "0:flight");
  write(root, "out/offline/index.html", shell(["/_next/static/chunks/main-1111.js"]));
  write(root, "out/projets/index.html", shell(["/_next/static/chunks/main-1111.js"]));
  write(root, "out/projets/index.txt", "0:flight");
  write(root, "out/__next._tree.txt", "0:flight");
  write(root, "out/robots.txt", "User-agent: *");
  write(root, "out/_next/static/chunks/main-1111.js", "/* main */");
  return root;
}

describe("manifeste de precache — derivation depuis le build", () => {
  it("derive les routes et les assets du build, sans liste ecrite a la main", () => {
    const assets = collectBuildAssets({ appDir: buildFixture(), mode: "server" });
    expect([...assets.keys()]).toEqual(expect.arrayContaining([
      "/", "/offline", "/projets", "/outils/pente", "/manifest.webmanifest",
      "/_next/static/css/app.5ff0.css", "/_next/static/chunks/main-1111.js", "/icon.svg",
    ]));
  });

  it("encode les segments dynamiques comme le fait le HTML rendu", () => {
    const assets = collectBuildAssets({ appDir: buildFixture(), mode: "server" });
    expect(assets.has("/_next/static/chunks/app/outils/%5Bid%5D/page-4444.js")).toBe(true);
  });

  it("exclut les routes internes et les pages de recette", () => {
    const urls = [...collectBuildAssets({ appDir: buildFixture(), mode: "server" }).keys()];
    const plan = planPrecache(collectBuildAssets({ appDir: buildFixture(), mode: "server" }));
    expect(urls).not.toContain("/_not-found");
    expect([...plan.critical, ...plan.optional]).not.toContain("/atelier-preview");
  });

  it("classe en critique le shell d'accueil, la page hors ligne et LEURS CSS et JS", () => {
    const plan = planPrecache(collectBuildAssets({ appDir: buildFixture(), mode: "server" }));
    expect(plan.critical).toContain("/");
    expect(plan.critical).toContain("/offline");
    expect(plan.critical).toContain("/_next/static/css/app.5ff0.css");
    expect(plan.critical).toContain("/_next/static/chunks/main-1111.js");
    expect(plan.critical).toContain("/_next/static/chunks/app/page-2222.js");
    expect(plan.offlineUrl).toBe("/offline");
  });

  it("precache aussi les chunks charges a la demande, invisibles dans le HTML", () => {
    const plan = planPrecache(collectBuildAssets({ appDir: buildFixture(), mode: "server" }));
    expect(plan.optional).toContain("/_next/static/chunks/9001.lazy-5555.js");
  });

  it("refuse tout net une URL sensible dans le manifeste", () => {
    const assets = collectBuildAssets({ appDir: buildFixture(), mode: "server" });
    assets.set("/api/facturation", "/dev/null");
    expect(() => planPrecache(assets)).toThrow(/sensibles/);
  });

  it("echoue si un asset reference par le shell manque du build", () => {
    const assets = collectBuildAssets({ appDir: buildFixture(), mode: "server" });
    assets.delete("/_next/static/chunks/main-1111.js");
    expect(() => planPrecache(assets)).toThrow(/Asset critique absent/);
  });

  it("lit les assets referencees par un document rendu", () => {
    expect(referencedAssets(shell(["/_next/static/css/a.css", "/_next/static/chunks/b.js"]))).toEqual(["/_next/static/css/a.css", "/_next/static/chunks/b.js"]);
  });

  it("reconstruit les URL a slash final de l'export natif", () => {
    const plan = planPrecache(collectBuildAssets({ appDir: exportFixture(), mode: "export" }));
    expect(plan.offlineUrl).toBe("/offline/");
    expect(plan.critical).toEqual(["/", "/_next/static/chunks/main-1111.js", "/offline/"]);
  });

  it("ecarte les charges Flight de l'export, que le worker ne sert jamais", () => {
    const urls = [...collectBuildAssets({ appDir: exportFixture(), mode: "export" }).keys()];
    expect(urls).not.toContain("/index.txt");
    expect(urls).not.toContain("/projets/index.txt");
    expect(urls).not.toContain("/__next._tree.txt");
    expect(urls).toContain("/robots.txt");
  });
});

describe("version de cache — deterministe et sensible au contenu", () => {
  it("donne la meme version pour deux builds identiques", () => {
    const first = generateServiceWorker({ appDir: buildFixture(), mode: "server" });
    const second = generateServiceWorker({ appDir: buildFixture(), mode: "server" });
    expect(first.version).toBe(second.version);
    expect(first.code).toBe(second.code);
  });

  it("change de version des qu'un octet precache change", () => {
    const before = generateServiceWorker({ appDir: buildFixture(), mode: "server" });
    const after = generateServiceWorker({ appDir: buildFixture({ ".next/static/css/app.5ff0.css": ":root{--amber:#000}" }), mode: "server" });
    expect(after.version).not.toBe(before.version);
  });

  it("change de version si la logique du worker elle-meme change", () => {
    const assets = collectBuildAssets({ appDir: buildFixture(), mode: "server" });
    const urls = [...assets.keys()];
    expect(computeVersion(assets, urls, "source A")).not.toBe(computeVersion(assets, urls, "source B"));
  });

  it("nomme le cache d'apres la version et conserve le prefixe Tools", () => {
    const generated = generateServiceWorker({ appDir: buildFixture(), mode: "server" });
    expect(generated.code).toContain(`const CACHE_VERSION = "${generated.version}";`);
    expect(generated.code).toContain("const CACHE = `elsatia-tools-${CACHE_VERSION}`;");
  });

  it("fige les delais reseau documentes", () => {
    const generated = generateServiceWorker({ appDir: buildFixture(), mode: "server" });
    expect(generated.code).toContain("const NAVIGATION_TIMEOUT_MS = 3000;");
    expect(generated.code).toContain("const ASSET_TIMEOUT_MS = 5000;");
  });
});
