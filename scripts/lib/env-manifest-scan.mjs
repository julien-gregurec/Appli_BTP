// ELSATIA — Manifeste d'environnement : lecture du dépôt, découverte des usages, contrôles.
//
// Aucune valeur d'environnement n'est lue ici : on lit du CODE et des GABARITS. Les gabarits
// peuvent contenir des valeurs ; elles ne sont jamais recopiées dans un message.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  SELF_PATHS,
  SECRET_NAME_PATTERN,
  finding,
  indexVariables,
  shapeOfSecret,
} from "./env-manifest-core.mjs";

// ── Source du dépôt ─────────────────────────────────────────────────────────

const CODE_EXT = /\.(?:[cm]?[jt]sx?|py|ya?ml)$/;
const EXAMPLE_FILE = /(?:^|\/)\.env[^/]*$/;
const TEST_FILE = /(?:\.(?:test|spec)\.[cm]?[jt]sx?$|(?:^|\/)(?:__tests__|__mocks__)\/|(?:^|\/)src\/test\/)/;
const BASE_EXCLUDE = [
  /(?:^|\/)node_modules\//, /(?:^|\/)\.next\//, /^docs\//, /^output\//, /(?:^|\/)public\//,
  /^supabase\//, /(?:^|\/)(?:android|ios)\//, /^\.claude\//, /^scratchpad-recette\//,
];

function wantedPath(path) {
  if (EXAMPLE_FILE.test(path)) return !BASE_EXCLUDE.some((re) => re.test(path));
  if (!CODE_EXT.test(path) || TEST_FILE.test(path)) return false;
  return !BASE_EXCLUDE.some((re) => re.test(path));
}

/** Source en mémoire : `files` = { chemin: contenu }. Sert aux tests comme au dépôt réel. */
export function createMemorySource(files, label = "mémoire") {
  const map = new Map(Object.entries(files));
  return {
    label,
    paths: [...map.keys()].sort(),
    has: (p) => map.has(p),
    read: (p) => map.get(p) ?? null,
  };
}

function parseCatFileBatch(buffer, order) {
  const out = {};
  let offset = 0;
  for (const path of order) {
    const eol = buffer.indexOf(0x0a, offset);
    if (eol === -1) break;
    const header = buffer.subarray(offset, eol).toString("utf8");
    offset = eol + 1;
    if (header.endsWith(" missing")) continue;
    const size = Number(header.split(" ")[2]);
    out[path] = buffer.subarray(offset, offset + size).toString("utf8");
    offset += size + 1;
  }
  return out;
}

/**
 * Lit l'arbre de travail (fichiers suivis + nouveaux non ignorés) ou une révision Git.
 *
 * Arbre de travail : les fichiers suivis et NON modifiés sont lus depuis l'index en un seul
 * `git cat-file --batch` (contenu identique au disque, sans une lecture par fichier) ; seuls
 * les fichiers modifiés ou nouveaux sont lus sur disque.
 */
export function createGitSource({ root, rev = null }) {
  const git = (args, input) =>
    execFileSync("git", ["-C", root, ...args], { maxBuffer: 1 << 28, input, stdio: ["pipe", "pipe", "pipe"] });
  const lines = (args) => git(args).toString("utf8").split("\n").filter(Boolean);
  let files = {};
  if (rev) {
    const wanted = lines(["ls-tree", "-r", "--name-only", rev]).filter(wantedPath);
    files = parseCatFileBatch(git(["cat-file", "--batch"], wanted.map((p) => `${rev}:${p}`).join("\n") + "\n"), wanted);
  } else {
    const tracked = new Set(lines(["ls-files"]));
    const dirty = new Set([...lines(["ls-files", "-m"]), ...lines(["ls-files", "-d"])]);
    const untracked = lines(["ls-files", "-o", "--exclude-standard"]);
    const fromIndex = [...tracked].filter((p) => !dirty.has(p) && wantedPath(p));
    files = parseCatFileBatch(git(["cat-file", "--batch"], fromIndex.map((p) => `:${p}`).join("\n") + "\n"), fromIndex);
    for (const p of [...dirty, ...untracked]) {
      if (wantedPath(p) && existsSync(`${root}/${p}`)) files[p] = readFileSync(`${root}/${p}`, "utf8");
    }
  }
  return createMemorySource(files, rev ? `révision ${rev}` : "arbre de travail");
}

// ── Application propriétaire d'un chemin ────────────────────────────────────

export function unitOf(manifest, path) {
  let best = null;
  for (const [id, app] of Object.entries(manifest.applications)) {
    for (const root of app.roots) {
      const hit = root.endsWith("/") ? path.startsWith(root) : path === root;
      if (hit && (!best || root.length > best.len)) best = { id, len: root.length };
    }
  }
  return best?.id ?? "other";
}

const TOOLING_UNITS = new Set(["ops_scripts", "e2e", "ci"]);

// ── Découverte des usages ───────────────────────────────────────────────────

const DIRECT = [
  /process\.env\.([A-Z][A-Z0-9_]*)/g,
  /process\.env\[\s*["'`]([A-Z][A-Za-z0-9_]*)["'`]\s*\]/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g,
  /Deno\.env\.get\(\s*["']([A-Z][A-Za-z0-9_]*)["']/g,
  /(?<![A-Za-z0-9_$.])(?:env|environnement|environment|serverEnvironment|processEnv)\.([A-Z][A-Z0-9_]{2,})\b/g,
  /(?<![A-Za-z0-9_$.])(?:env|environnement|environment)\[\s*["'`]([A-Z][A-Z0-9_]+)["'`]\s*\]/g,
  /os\.environ(?:\.get)?\s*[\[(]\s*["']([A-Z][A-Z0-9_]*)["']/g,
  /os\.getenv\(\s*["']([A-Z][A-Z0-9_]*)["']/g,
];
const CI_SECRET = /(?:secrets|vars)\.([A-Z][A-Z0-9_]*)/g;
const YAML_KEY = /^\s+([A-Z][A-Z0-9_]*):(?:\s|$)/;
const DYNAMIC = [
  /process\.env\[\s*(?!["'`\s])[^\]]/,
  /(?<![A-Za-z0-9_$.])(?:env|environnement|environment)\[\s*(?!["'`\s])[^\]]/,
];
const QUOTED = /["'`]([A-Z][A-Z0-9_]*_[A-Z0-9_]*)["'`]/g;
const TOKEN = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g;
const COMMENT_START = /^\s*(?:\/\/|\/\*|\*|#)/;

function isClientFile(content) {
  const head = content.split("\n", 12);
  for (const raw of head) {
    const line = raw.trim();
    if (!line || COMMENT_START.test(line)) continue;
    return /^["']use client["'];?$/.test(line);
  }
  return false;
}

export function isScanned(manifest, path) {
  if (SELF_PATHS.includes(path)) return false;
  if (EXAMPLE_FILE.test(path)) return false;
  return !manifest.scan.exclude_paths.some((e) => (e.path.endsWith("/") ? path.startsWith(e.path) : path === e.path));
}

export function discover(manifest, source) {
  const prefixes = manifest.scan.literal_prefixes;
  const usages = [];
  const dynamic = [];
  const tokens = new Set();
  const clientFiles = new Set();
  const nextConfigs = [];
  const units = new Set();

  for (const path of source.paths) {
    if (!isScanned(manifest, path)) continue;
    const content = source.read(path);
    if (content == null) continue;
    const unit = unitOf(manifest, path);
    units.add(unit);
    const client = isClientFile(content);
    if (client) clientFiles.add(path);
    if (/(?:^|\/)next\.config\.[cm]?[jt]s$/.test(path)) nextConfigs.push({ path, content });
    const yaml = /\.ya?ml$/.test(path);
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      if (COMMENT_START.test(line)) return;
      for (const t of line.match(TOKEN) ?? []) tokens.add(t);
      const at = { path, line: i + 1, unit, client };
      for (const re of DIRECT) {
        re.lastIndex = 0;
        for (const m of line.matchAll(re)) usages.push({ ...at, name: m[1], kind: "direct" });
      }
      if (yaml) {
        CI_SECRET.lastIndex = 0;
        for (const m of line.matchAll(CI_SECRET)) usages.push({ ...at, name: m[1], kind: "ci" });
        const key = YAML_KEY.exec(line);
        if (key) usages.push({ ...at, name: key[1], kind: "ci" });
      }
      QUOTED.lastIndex = 0;
      for (const m of line.matchAll(QUOTED)) {
        if (prefixes.some((p) => m[1].startsWith(p))) usages.push({ ...at, name: m[1], kind: "literal" });
      }
      if (DYNAMIC.some((re) => re.test(line))) dynamic.push(at);
    });
  }
  return { usages, dynamic, tokens, clientFiles, nextConfigs, units };
}

// ── A + B + D : code ↔ manifeste, public / secret ───────────────────────────

const where = (list) => list.slice(0, 3).map((u) => `${u.path}:${u.line}`).join(", ") + (list.length > 3 ? ` (+${list.length - 3})` : "");

export function checkCodeVsManifest(manifest, found, source) {
  const out = [];
  const byName = indexVariables(manifest);
  const system = new Set(manifest.system_variables.map((s) => s.name));
  const ignored = new Set(manifest.scan.ignored_literals.map((s) => s.name));
  const unknown = new Map();
  const referenceOnly = manifest.scan.reference_only;

  for (const u of found.usages) {
    if (system.has(u.name) || ignored.has(u.name) || u.name.endsWith("_")) continue;
    // Citation par NOM sans lecture de valeur (ex. identifiant de produit envoyé au backend).
    if (referenceOnly.some((r) => r.name === u.name && r.path === u.path)) continue;
    const entry = byName.get(u.name);
    if (!entry) {
      if (!unknown.has(u.name)) unknown.set(u.name, []);
      unknown.get(u.name).push(u);
      continue;
    }
    if (!TOOLING_UNITS.has(u.unit) && !entry.applications.includes(u.unit)) {
      out.push(finding("error", "ENV-APP-MISMATCH", u.name, `lue par « ${u.unit} » (${u.path}:${u.line}) mais non déclarée pour cette application`));
    }
    if (entry.deprecated) {
      out.push(finding("warning", "ENV-DEPRECATED-USED", u.name, `dépréciée, encore lue par « ${u.unit} » (${u.path}:${u.line}) → ${entry.replacement ?? "aucun remplaçant"}`));
    }
    if (u.client && u.kind === "direct" && entry.visibility === "server") {
      out.push(finding("error", "ENV-SERVER-VAR-IN-CLIENT", u.name, `variable serveur lue dans un composant client (${u.path}:${u.line})`));
    }
  }
  for (const [name, list] of unknown) {
    out.push(finding("error", "ENV-UNKNOWN", name, `variable non déclarée au manifeste — ${where(list)}`));
  }

  // Accès dynamique : peut cacher une variable au contrôle. Doit être justifié.
  const allowed = manifest.scan.dynamic_access_allowed;
  const seenDyn = new Set();
  for (const d of found.dynamic) {
    if (allowed.some((a) => a.path === d.path) || seenDyn.has(d.path)) continue;
    seenDyn.add(d.path);
    out.push(finding("error", "ENV-DYNAMIC-ACCESS", d.path, `accès dynamique process.env[…] non justifié (${d.path}:${d.line}) : ajouter à scan.dynamic_access_allowed avec une justification`));
  }

  // Composants client : jamais de module de clé de service.
  for (const path of found.clientFiles) {
    const content = source.read(path) ?? "";
    for (const m of content.matchAll(/from\s+["']([^"']+)["']/g)) {
      if (/(?:supabase\/admin|admin-storage|storage-admin|service-role)/.test(m[1])) {
        out.push(finding("error", "ENV-SERVICE-ROLE-IN-CLIENT", path, "composant client important un module de clé de service"));
      }
    }
  }

  // next.config : le bloc `env:` est inliné dans le bundle navigateur.
  for (const cfg of found.nextConfigs) {
    for (const name of envBlockNames(cfg.content)) {
      const entry = byName.get(name);
      if (!entry) continue; // l'inconnu est déjà signalé par la découverte
      if (entry.secret || (entry.visibility === "server" && entry.public_via !== "next_config_env")) {
        out.push(finding("error", "ENV-NEXT-CONFIG-SECRET", name, `${cfg.path} : « env: » injecte une variable non publique dans le bundle`));
      }
    }
  }
  return out;
}

/** Noms injectés par le bloc `env: { … }` d'un next.config (clés et process.env.X référencés). */
export function envBlockNames(content) {
  const start = content.search(/(?:^|[\s,{])env\s*:\s*\{/m);
  if (start === -1) return [];
  const open = content.indexOf("{", start);
  let depth = 0;
  let end = open;
  for (let i = open; i < content.length; i++) {
    if (content[i] === "{") depth++;
    if (content[i] === "}" && --depth === 0) { end = i; break; }
  }
  const block = content.slice(open, end + 1);
  const names = new Set();
  for (const m of block.matchAll(/(?:^|[{,\n])\s*([A-Z][A-Z0-9_]*)\s*:/g)) names.add(m[1]);
  for (const m of block.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) names.add(m[1]);
  return [...names];
}

export function checkManifestVsCode(manifest, found) {
  const out = [];
  const used = new Set([...found.usages.map((u) => u.name), ...found.tokens]);
  const stats = { orphans: [], deprecatedUnused: [], skippedUnits: 0 };
  for (const v of manifest.variables) {
    const scannable = v.applications.some((a) => found.units.has(a));
    if (!scannable) { stats.skippedUnits++; continue; }
    if (used.has(v.name)) continue;
    if (v.external_consumer) { out.push(finding("info", "ENV-EXTERNAL-CONSUMER", v.name, `lue hors de cet arbre : ${v.external_consumer}`)); continue; }
    if (v.deprecated) { stats.deprecatedUnused.push(v.name); out.push(finding("info", "ENV-DEPRECATED-UNUSED", v.name, "dépréciée et plus lue : peut être retirée du manifeste")); continue; }
    stats.orphans.push(v.name);
    if (v.required) out.push(finding("error", "ENV-REQUIRED-UNUSED", v.name, "déclarée obligatoire mais lue nulle part dans le code analysé"));
    else out.push(finding("warning", "ENV-ORPHAN", v.name, "déclarée mais lue nulle part dans le code analysé (orpheline)"));
  }
  // Tous les drapeaux doivent être déclarés comme tels.
  for (const v of manifest.variables) {
    const looksLikeFlag = /^FEATURE_|_ENABLED$|_OUVERTS$|^DISABLE_|^ELSATIA_LOCAL_DEMO$/.test(v.name);
    if (looksLikeFlag && v.category !== "feature_flag") {
      out.push(finding("error", "ENV-FLAG-UNDECLARED", v.name, "ressemble à un drapeau : doit être de catégorie feature_flag avec son bloc flag"));
    }
  }
  return { findings: out, stats };
}

// ── C : gabarits .env.example ───────────────────────────────────────────────

const PLACEHOLDER = /^(?:<[^>]*>|\$\{[^}]*\}|(?:replace|changeme|change-me|placeholder|example|your|votre|server-only|todo|xxx|dummy|supported|random|base64|generate|shared)[-_a-z0-9 ]*|.{0,11})$/i;
const URL_NO_CREDS = /^[a-z][a-z0-9+.-]*:\/\/[^:@/\s]+(?::\d+)?(?:\/\S*)?$/i;
const LOCAL_HOST = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal)/i;

export function parseExample(content) {
  const entries = [];
  for (const raw of content.split("\n")) {
    const m = /^\s*(#\s*)?([A-Z][A-Z0-9_]*)=(.*)$/.exec(raw);
    if (m) entries.push({ name: m[2], commented: Boolean(m[1]), value: m[3].trim().replace(/^["']|["']$/g, "") });
  }
  return entries;
}

export function checkExamples(manifest, source, presentUnits) {
  const out = [];
  const byName = indexVariables(manifest);
  const parsed = new Map(); // "app|path" -> entries

  for (const [appId, app] of Object.entries(manifest.applications)) {
    for (const ex of app.examples ?? []) {
      if (!presentUnits.has(appId)) continue;
      const content = source.read(ex.path);
      if (content == null) {
        out.push(finding("error", "EXAMPLE-FILE-MISSING", ex.path, `gabarit attendu pour « ${appId} » (${ex.environment}) absent`));
        continue;
      }
      const entries = parseExample(content);
      parsed.set(`${appId}|${ex.path}`, entries);

      for (const e of entries) {
        const v = byName.get(e.name);
        const at = `${ex.path}`;
        if (!v) { out.push(finding("error", "EXAMPLE-UNKNOWN", e.name, `${at} : variable absente du manifeste`)); continue; }
        if (!v.applications.includes(appId) && !(appId === "gestion_pro" && v.applications.includes("platform"))) {
          out.push(finding("error", "EXAMPLE-FOREIGN", e.name, `${at} : le gabarit de « ${appId} » déclare une variable que le manifeste n'attribue pas à cette application (${v.applications.join(", ")})`));
        }
        if (v.deprecated && !(v.required && v.applications.includes(appId))) {
          out.push(finding("warning", "EXAMPLE-DEPRECATED", e.name, `${at} : variable dépréciée dans le gabarit → ${v.replacement ?? "à retirer"}`));
        }
        if (e.commented) continue; // une ligne commentée documente sans affecter de valeur
        const shape = shapeOfSecret(e.value);
        if (shape) out.push(finding("error", "EXAMPLE-SECRET-SHAPE", e.name, `${at} : la valeur a la forme d'un secret (${shape}) — retirer`));
        else if (v.secret && e.value && !PLACEHOLDER.test(e.value) && !URL_NO_CREDS.test(e.value)) {
          out.push(finding("error", "EXAMPLE-SECRET-VALUE", e.name, `${at} : secret avec une valeur non-placeholder (${e.value.length} caractères) — laisser vide ou placeholder`));
        }
        if ((ex.environment === "production" || ex.environment === "preview") && e.value) {
          const allowed = v.local_origin_exceptions ?? [];
          const stripped = allowed.reduce((s, x) => s.split(x).join(""), e.value);
          if (LOCAL_HOST.test(stripped)) {
            out.push(finding("error", "EXAMPLE-LOCALHOST", e.name, `${at} : adresse locale dans un gabarit ${ex.environment}`));
          }
        }
        if (e.name === "ELSATIA_APPLICATION_ENV" && e.value && ex.environment !== "any" && e.value !== ex.environment) {
          out.push(finding("error", "EXAMPLE-ENV-INDICATOR", e.name, `${at} : vaut « ${e.value} » dans un gabarit ${ex.environment}`));
        }
        const want = v.flag?.expected?.[ex.environment];
        if (want && (want === "true" || want === "false") && e.value && e.value !== want) {
          out.push(finding("error", "EXAMPLE-FLAG-VALUE", e.name, `${at} : drapeau à « ${e.value} », attendu « ${want} » en ${ex.environment}`));
        }
      }
    }
  }

  // Variables attendues par environnement.
  for (const v of manifest.variables) {
    if (!v.example_required) continue;
    for (const appId of v.applications) {
      const app = manifest.applications[appId];
      if (!app?.examples?.length || !presentUnits.has(appId)) continue;
      for (const env of v.environments) {
        if (!["local", "preview", "production"].includes(env)) continue;
        const files = app.examples.filter((e) => e.environment === env || e.environment === "any");
        if (!files.length) continue;
        const has = files.some((f) => (parsed.get(`${appId}|${f.path}`) ?? []).some((e) => e.name === v.name));
        if (!has) out.push(finding("error", "EXAMPLE-MISSING", v.name, `absente de ${files.map((f) => f.path).join(" ou ")} (${appId}, ${env})`));
      }
    }
  }
  return out;
}

// ── Contrats Stripe incompatibles ───────────────────────────────────────────

export function checkStripeContracts(manifest, source) {
  const out = [];
  const families = new Map();
  for (const c of manifest.stripe_contracts ?? []) {
    const live = c.evidence.every((ev) => {
      const content = source.read(ev.path);
      return content != null && new RegExp(ev.pattern).test(content);
    });
    if (!families.has(c.family)) families.set(c.family, []);
    families.get(c.family).push({ ...c, live });
  }
  for (const [family, contracts] of families) {
    const active = contracts.filter((c) => c.live && c.status !== "legacy");
    const legacy = contracts.filter((c) => c.live && c.status === "legacy");
    if (active.length >= 2) {
      const decision = active.map((c) => c.decision).find(Boolean) ?? "DECISION_REQUIRED:UNSPECIFIED";
      out.push(finding("decision", "STRIPE-CONTRACTS-DIVERGENT", family, `${active.length} contrats incompatibles actifs (${active.map((c) => c.id).join(" ≠ ")}) — ${decision}`));
    }
    for (const c of legacy) out.push(finding("warning", "STRIPE-LEGACY-CONTRACT-ACTIVE", family, `contrat historique encore présent : ${c.id}`));
  }
  return out;
}

export function decisionFindings(manifest) {
  const byDecision = new Map();
  for (const v of manifest.variables) if (v.decision) byDecision.set(v.decision, [...(byDecision.get(v.decision) ?? []), v.name]);
  return (manifest.decisions ?? []).map((d) =>
    finding("decision", d.id, d.owner ?? "Julien", `${d.question} — ${(byDecision.get(d.id) ?? []).length} variable(s) concernée(s)`),
  );
}

// ── Garde de pré-build de Colors : cohérence avec le manifeste ─────────────

const COLORS_GUARD = "apps/colors/scripts/verify-public-env.mjs";

/**
 * Colors a déjà son garde de pré-build (`prebuild` → verify-public-env.mjs) et son contrat de
 * variables publiques. On le CONSERVE et on vérifie qu'il ne dérive pas du manifeste, plutôt
 * que de créer un second système parallèle.
 */
export function checkColorsGuardContract(manifest, source) {
  const content = source.read(COLORS_GUARD);
  if (content == null) return [];
  const start = content.indexOf("CONTRAT_ENV_PUBLIC");
  if (start === -1) return [finding("error", "COLORS-GUARD-CONTRACT", COLORS_GUARD, "CONTRAT_ENV_PUBLIC introuvable : le garde ne déclare plus son contrat")];
  const region = content.slice(start, content.indexOf("];", start));
  const inGuard = new Set([...region.matchAll(/name:\s*"([A-Z][A-Z0-9_]*)"/g)].map((m) => m[1]));
  const inManifest = new Set(
    manifest.variables
      .filter((v) => v.applications.includes("colors") && v.required && !v.deprecated && (v.visibility === "public" || v.name === "ELSATIA_APPLICATION_ENV"))
      .map((v) => v.name),
  );
  const out = [];
  for (const n of inGuard) if (!inManifest.has(n)) out.push(finding("error", "COLORS-GUARD-CONTRACT", n, "exigée par le garde de Colors mais non requise (colors) au manifeste"));
  for (const n of inManifest) if (!inGuard.has(n)) out.push(finding("error", "COLORS-GUARD-CONTRACT", n, "requise (colors, publique) au manifeste mais absente du contrat du garde de Colors"));
  return out;
}

// ── Orchestration ───────────────────────────────────────────────────────────

export function runRepoChecks(manifest, source) {
  const found = discover(manifest, source);
  const code = checkCodeVsManifest(manifest, found, source);
  const reverse = checkManifestVsCode(manifest, found);
  const examples = checkExamples(manifest, source, found.units);
  const stripe = checkStripeContracts(manifest, source);
  const guard = checkColorsGuardContract(manifest, source);
  const decisions = decisionFindings(manifest);
  const findings = [...code, ...reverse.findings, ...examples, ...stripe, ...guard, ...decisions];
  const known = new Set(manifest.variables.map((v) => v.name));
  const stats = {
    source: source.label,
    filesScanned: source.paths.filter((p) => isScanned(manifest, p)).length,
    usages: found.usages.length,
    distinctNames: new Set(found.usages.map((u) => u.name)).size,
    unitsPresent: [...found.units].sort(),
    skippedVariables: reverse.stats.skippedUnits,
    orphans: reverse.stats.orphans,
    manifestSize: known.size,
  };
  return { findings, stats, found };
}

export { SECRET_NAME_PATTERN };
