/*
 * Generateur build-time du service worker ELSATIA Tools.
 *
 * Lit la sortie de `next build` (aucun reseau, aucune liste de hash ecrite a la main), en derive
 * la liste exacte des assets a precacher et une version de cache deterministe, puis rend
 * `service-worker/sw-tools.source.js` dans `public/sw-tools.js` (et `out/sw-tools.js` en export).
 *
 * Determinisme : la version est le SHA-256 des couples (URL, SHA-256 du fichier) tries, plus le
 * SHA-256 du source. Deux builds identiques donnent le meme worker octet pour octet ; le moindre
 * octet change dans un asset precache change la version, donc le nom du cache, donc declenche la
 * mise a jour. Aucune version manuelle a ne pas oublier.
 *
 * Usage : node scripts/generate-service-worker.mjs --mode=server|export
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_PATH = join(APP_DIR, "service-worker", "sw-tools.source.js");

/* Extensions et chemins qui n'ont aucune raison d'etre precaches (ou de fuiter dans le worker). */
const EXCLUDED_EXTENSIONS = [".map", ".DS_Store"];
/*
 * Charges Flight de l'export statique (`__next.*.txt`, `<route>/index.txt`) : elles repondent aux
 * requetes RSC, que le worker laisse deliberement passer au reseau. Les precacher gonflerait le
 * cache sans jamais rien servir.
 */
const RSC_PAYLOAD = /(^|\/)(__next\.|index\.txt$)/;
/* Garde de confidentialite : aucune de ces familles d'URL ne doit entrer dans un cache partage. */
export const FORBIDDEN_URL_PATTERNS = [/\/api\//, /\/auth\//, /supabase/i, /\.env/, /token/i, /session/i, /\.map$/];
/* Pages de recette internes : presentes dans le build, sans valeur hors ligne pour le chantier. */
const PREVIEW_ROUTE = /-preview(\/)?$/;

function walk(root) {
  if (!existsSync(root)) return [];
  const out = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

function toUrlPath(relativePath) {
  return relativePath.split(sep).map((segment) => encodeURIComponent(segment)).join("/");
}

function isExcludedFile(file) {
  return EXCLUDED_EXTENSIONS.some((extension) => file.endsWith(extension)) || RSC_PAYLOAD.test(file.split(sep).join("/"));
}

/* `.next/server/app/outils/arche.html` -> `/outils/arche` ; `index.html` -> `/`. */
function serverHtmlUrl(relativePath) {
  const withoutExtension = relativePath.slice(0, -".html".length);
  const segments = withoutExtension.split(sep);
  if (segments.length === 1 && segments[0] === "index") return "/";
  return `/${toUrlPath(segments.join(sep))}`;
}

/* `out/outils/arche/index.html` -> `/outils/arche/` (trailingSlash de l'export natif). */
function exportHtmlUrl(relativePath) {
  const segments = relativePath.split(sep);
  if (segments[segments.length - 1] !== "index.html") return `/${toUrlPath(relativePath)}`;
  segments.pop();
  return segments.length === 0 ? "/" : `/${toUrlPath(segments.join(sep))}/`;
}

/* Une route interne (`_not-found`, `_global-error`) n'a pas d'URL publique. */
function isInternalRoute(url) {
  return url.split("/").some((segment) => segment.startsWith("_"));
}

export function collectBuildAssets({ appDir = APP_DIR, mode = "server" } = {}) {
  const assets = new Map();
  const add = (url, file) => { if (!assets.has(url) && !isExcludedFile(file)) assets.set(url, file); };

  if (mode === "export") {
    const root = join(appDir, "out");
    for (const file of walk(root)) {
      const rel = relative(root, file);
      if (rel === "sw-tools.js") continue;
      const url = rel.endsWith(".html") ? exportHtmlUrl(rel) : `/${toUrlPath(rel)}`;
      if (rel.endsWith(".html") && isInternalRoute(url)) continue;
      add(url, file);
    }
    return assets;
  }

  const appRoot = join(appDir, ".next", "server", "app");
  for (const file of walk(appRoot)) {
    if (!file.endsWith(".html")) continue;
    const url = serverHtmlUrl(relative(appRoot, file));
    if (isInternalRoute(url)) continue;
    add(url, file);
  }
  /* Le manifeste PWA est une route (`manifest.webmanifest.body`), pas un fichier de `public/`. */
  const webmanifest = join(appRoot, "manifest.webmanifest.body");
  if (existsSync(webmanifest)) add("/manifest.webmanifest", webmanifest);

  const staticRoot = join(appDir, ".next", "static");
  for (const file of walk(staticRoot)) add(`/_next/static/${toUrlPath(relative(staticRoot, file))}`, file);

  const publicRoot = join(appDir, "public");
  for (const file of walk(publicRoot)) {
    const rel = relative(publicRoot, file);
    if (rel === "sw-tools.js") continue;
    add(`/${toUrlPath(rel)}`, file);
  }
  return assets;
}

/* Les assets d'execution reellement requis par une page sont ceux que son HTML reference. */
export function referencedAssets(html) {
  return [...html.matchAll(/(?:src|href)="(\/_next\/[^"]+)"/g)].map((match) => match[1]);
}

export function planPrecache(assets, { readHtml = (file) => readFileSync(file, "utf8") } = {}) {
  const urls = [...assets.keys()];
  const forbidden = urls.filter((url) => FORBIDDEN_URL_PATTERNS.some((pattern) => pattern.test(url)));
  if (forbidden.length > 0) throw new Error(`URL sensibles refusees au precache : ${forbidden.join(", ")}`);

  const offlineUrl = urls.includes("/offline") ? "/offline" : "/offline/";
  const shells = ["/", offlineUrl];
  const critical = new Set(shells.filter((url) => assets.has(url)));
  for (const shell of shells) {
    const file = assets.get(shell);
    if (!file) continue;
    for (const asset of referencedAssets(readHtml(file))) {
      if (!assets.has(asset)) throw new Error(`Asset critique absent du build : ${asset} (reference par ${shell})`);
      critical.add(asset);
    }
  }
  const optional = urls.filter((url) => !critical.has(url) && !PREVIEW_ROUTE.test(url));
  return { offlineUrl, critical: [...critical].sort(), optional: optional.sort() };
}

/* La version ne depend que des octets reellement precaches : rien d'autre ne doit la faire bouger. */
export function computeVersion(assets, precachedUrls, sourceText) {
  const digest = createHash("sha256");
  for (const url of [...precachedUrls].sort()) {
    digest.update(url);
    digest.update("\0");
    digest.update(createHash("sha256").update(readFileSync(assets.get(url))).digest("hex"));
    digest.update("\n");
  }
  digest.update(createHash("sha256").update(sourceText).digest("hex"));
  return digest.digest("hex").slice(0, 16);
}

const CONSTANTS = ["CACHE_VERSION", "OFFLINE_URL", "CRITICAL_ASSETS", "OPTIONAL_ASSETS"];

export function renderServiceWorker(sourceText, values) {
  let code = sourceText;
  for (const name of CONSTANTS) {
    const marker = new RegExp(`^const ${name} = .*/\\* ELSATIA:${name} \\*/$`, "m");
    if (!marker.test(code)) throw new Error(`Marqueur ELSATIA:${name} introuvable dans le source du worker`);
    code = code.replace(marker, `const ${name} = ${JSON.stringify(values[name])};`);
  }
  return code;
}

export function generateServiceWorker({ appDir = APP_DIR, mode = "server" } = {}) {
  const sourceText = readFileSync(SOURCE_PATH, "utf8");
  const assets = collectBuildAssets({ appDir, mode });
  if (assets.size === 0) throw new Error(`Aucun asset trouve : le build ${mode} n'a pas ete produit`);
  const plan = planPrecache(assets);
  const precachedUrls = [...plan.critical, ...plan.optional];
  const version = computeVersion(assets, precachedUrls, sourceText);
  const bytes = precachedUrls.reduce((total, url) => total + statSync(assets.get(url)).size, 0);
  const code = renderServiceWorker(sourceText, {
    CACHE_VERSION: version,
    OFFLINE_URL: plan.offlineUrl,
    CRITICAL_ASSETS: plan.critical,
    OPTIONAL_ASSETS: plan.optional,
  });
  return { ...plan, version, code, assets, bytes };
}

function main() {
  const mode = (process.argv.find((argument) => argument.startsWith("--mode=")) ?? "--mode=server").slice("--mode=".length);
  if (mode !== "server" && mode !== "export") throw new Error(`Mode inconnu : ${mode}`);
  const result = generateServiceWorker({ mode });
  const targets = [join(APP_DIR, "public", "sw-tools.js")];
  if (mode === "export") targets.push(join(APP_DIR, "out", "sw-tools.js"));
  for (const target of targets) writeFileSync(target, result.code);
  const kilobytes = Math.round(result.bytes / 1024);
  console.log(`[sw] version ${result.version} — ${result.critical.length} assets critiques, ${result.optional.length} optionnels, ${kilobytes} ko couverts`);
  console.log(`[sw] ecrit : ${targets.map((target) => relative(APP_DIR, target)).join(", ")}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
