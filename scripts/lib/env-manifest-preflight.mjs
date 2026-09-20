// ELSATIA — Manifeste d'environnement : preflight de déploiement Preview / Production.
//
// Compare un ensemble de variables (fichier dotenv local ou environnement du processus) au
// manifeste. Il ne se connecte à rien : ni Vercel, ni Supabase, ni Stripe.
// GARANTIE : aucune valeur n'apparaît jamais dans un constat. Seuls noms, règles et familles
// de forme (« clé Stripe live ») sont écrits.

import { SECRET_NAME_PATTERN, finding, shapeOfSecret } from "./env-manifest-core.mjs";

const TARGETS = ["local", "test", "preview", "production"];
const FALSY = new Set(["", "0", "false", "off", "no"]);
const LOCAL_HOST_RE = /^(?:localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[?::1\]?|.*\.local|.*\.localhost|host\.docker\.internal|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/i;

/** Analyse un fichier dotenv. Les valeurs restent en mémoire, jamais journalisées. */
export function parseEnvFile(text) {
  const env = {};
  for (const raw of text.split("\n")) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(raw);
    if (!m || /^\s*#/.test(raw)) continue;
    env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const isSet = (env, name) => typeof env[name] === "string" && env[name].trim() !== "";

/** Variables qui s'appliquent à ces applications dans cet environnement. */
export function applicableVariables(manifest, apps, target, phase = "all") {
  return manifest.variables.filter((v) => {
    if (!v.applications.some((a) => apps.includes(a))) return false;
    if (!v.environments.includes(target)) return false;
    if (phase === "build") return v.build_time;
    if (phase === "runtime") return v.runtime;
    return true;
  });
}

function jwtRole(value) {
  const parts = String(value).split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

function urlProblems(name, value, target, exceptions) {
  const out = [];
  const pieces = value.split(",").map((s) => s.trim()).filter(Boolean);
  for (const piece of pieces) {
    if (exceptions.includes(piece)) continue;
    let url;
    try { url = new URL(piece); } catch { out.push(["PF-URL-INVALID", "n'est pas une URL valide"]); continue; }
    if (LOCAL_HOST_RE.test(url.hostname)) out.push(["PF-URL-LOCALHOST", `adresse locale ou privée interdite en ${target}`]);
    else if (target === "production" && url.protocol === "http:") out.push(["PF-URL-INSECURE", "HTTPS obligatoire en production"]);
  }
  return out;
}

/**
 * @param manifest  manifeste chargé
 * @param env       { NOM: valeur } — jamais affiché
 * @param options   { target, apps, phase }
 * @returns { findings, rows } — rows = { name, state } sans valeur, pour le tableau
 */
export function runPreflight(manifest, env, { target, apps, phase = "all" }) {
  const out = [];
  const rows = [];
  const err = (code, subject, message) => out.push(finding("error", code, subject, message));
  const warn = (code, subject, message) => out.push(finding("warning", code, subject, message));

  if (!TARGETS.includes(target)) err("PF-TARGET", String(target), "environnement cible inconnu");
  const unknownApps = apps.filter((a) => !manifest.applications[a]);
  for (const a of unknownApps) err("PF-APP", a, "application inconnue du manifeste");
  if (out.length) return { findings: out, rows };

  const byName = new Map(manifest.variables.map((v) => [v.name, v]));
  const applicable = applicableVariables(manifest, apps, target, phase);
  const applicableNames = new Set(applicable.map((v) => v.name));

  // 1. Indicateur d'environnement : jamais de repli silencieux.
  const indicator = byName.get("ELSATIA_APPLICATION_ENV");
  if (indicator && apps.some((a) => indicator.applications.includes(a)) && ["preview", "production"].includes(target)) {
    const value = env.ELSATIA_APPLICATION_ENV?.trim();
    if (!value) err("PF-ENV-ABSENT", indicator.name, "absent : l'application se croirait « local » sur un déploiement");
    else if (!(indicator.allowed_values ?? []).includes(value)) err("PF-ENV-INVALID", indicator.name, "valeur hors {local,test,preview,production}");
    else if (value !== target) err("PF-ENV-MISMATCH", indicator.name, `l'environnement déclaré ne correspond pas à la cible ${target}`);
  }
  const vercelEnv = env.VERCEL_ENV?.trim();
  if (vercelEnv && ["preview", "production"].includes(target) && vercelEnv !== target) {
    err("PF-VERCEL-ENV-MISMATCH", "VERCEL_ENV", `le déploiement Vercel est « ${vercelEnv} », la cible contrôlée est « ${target} »`);
  }

  // 2. Présence, dépréciation, interdits, formats.
  for (const v of applicable) {
    const present = isSet(env, v.name);
    rows.push({ name: v.name, required: v.required, state: present ? "présente" : "absente", secret: v.secret, dr: v.dr_critical });
    if (!present) {
      if (v.flag) {
        const must = v.flag.must_be_defined_in?.includes(target);
        (must ? err : warn)("PF-FLAG-UNDEFINED", v.name, `drapeau non défini : comportement « ${v.flag.absent_behavior === "closed" ? "fermé (fonction éteinte)" : "OUVERT (fonction active)"} »`);
      } else if (v.required) {
        // L'indicateur d'environnement absent est déjà signalé plus haut (PF-ENV-ABSENT) : pas de doublon.
        const already = v.name === "ELSATIA_APPLICATION_ENV" && ["preview", "production"].includes(target);
        if (!already) err("PF-REQUIRED-MISSING", v.name, "variable requise absente");
      }
      else if (v.required_when) out.push(finding("info", "PF-CONDITIONAL-ABSENT", v.name, `absente — requise ${v.required_when}`));
      continue;
    }
    const value = env[v.name];
    if (v.deprecated) warn("PF-DEPRECATED-PRESENT", v.name, `variable dépréciée en place → ${v.replacement ?? "aucun remplaçant"} (${v.migration ?? "voir manifeste"})`);
    if (v.forbidden_in?.includes(target) && !FALSY.has(value.trim().toLowerCase())) {
      err("PF-FORBIDDEN-PRESENT", v.name, `interdite (ou à false) en ${target}`);
    }
    if (v.allowed_values && !v.allowed_values.includes(value.trim())) err("PF-VALUE-NOT-ALLOWED", v.name, `valeur hors {${v.allowed_values.join(",")}}`);
    if (v.value_pattern && !new RegExp(v.value_pattern).test(value.trim())) err("PF-VALUE-FORMAT", v.name, "format inattendu (valeur non affichée)");
    if (v.url_class && ["preview", "production"].includes(target)) {
      for (const [code, message] of urlProblems(v.name, value, target, v.local_origin_exceptions ?? [])) err(code, v.name, message);
    }
    if (v.flag) {
      const normalized = value.trim().toLowerCase();
      if (v.flag.kind === "boolean" && !["true", "false"].includes(normalized)) err("PF-FLAG-VALUE-INVALID", v.name, "un drapeau booléen vaut exactement true ou false");
      const want = v.flag.expected?.[target];
      if ((want === "true" || want === "false") && normalized !== want) err("PF-FLAG-UNEXPECTED", v.name, `attendu « ${want} » en ${target}`);
    }
    if (v.category === "supabase_public") {
      if (/^sb_secret_/.test(value) || jwtRole(value) === "service_role") err("PF-SUPABASE-KEY-ROLE", v.name, "clé publique qui porte un rôle de service");
    }
    if (v.category === "supabase_service_role") {
      if (/^sb_publishable_/.test(value) || jwtRole(value) === "anon") err("PF-SUPABASE-KEY-ROLE", v.name, "clé de service qui porte un rôle public");
    }
  }

  // 3. Public / secret sur tout ce qui est fourni, y compris les noms inconnus.
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("NEXT_PUBLIC_")) continue;
    if (SECRET_NAME_PATTERN.test(name)) err("PF-PUBLIC-SECRET-NAME", name, "nom NEXT_PUBLIC_ qui ressemble à un secret");
    if (!byName.has(name)) warn("PF-UNKNOWN-PUBLIC", name, "variable NEXT_PUBLIC_ inconnue du manifeste");
    const shape = shapeOfSecret(value);
    if (shape) err("PF-PUBLIC-VALUE-SECRET-SHAPED", name, `la valeur d'une variable publique a la forme d'un secret (${shape})`);
  }

  // 4. Stripe : mode attendu, cohérence clé / mode.
  const stripeApplies = applicableNames.has("STRIPE_WEBHOOK_EXPECTED_MODE") || applicableNames.has("STRIPE_SECRET_KEY");
  if (stripeApplies) {
    const mode = env.STRIPE_WEBHOOK_EXPECTED_MODE?.trim().toLowerCase();
    if (mode && !["test", "live"].includes(mode)) err("PF-STRIPE-MODE-INVALID", "STRIPE_WEBHOOK_EXPECTED_MODE", "doit valoir test ou live");
    if (target === "preview" && mode === "live") err("PF-STRIPE-MODE-PREVIEW-LIVE", "STRIPE_WEBHOOK_EXPECTED_MODE", "mode live interdit en preview");
    if (target === "production" && mode === "test") {
      warn("PF-STRIPE-TEST-IN-PRODUCTION", "STRIPE_WEBHOOK_EXPECTED_MODE", "production en mode test : normal avant le cutover commercial, à basculer en live à l'ouverture (DECISION Julien)");
    }
    for (const keyName of ["STRIPE_SECRET_KEY", "STRIPE_TOOLS_SECRET_KEY"]) {
      if (!isSet(env, keyName) || !applicableNames.has(keyName)) continue;
      const kind = /^(?:sk|rk)_live_/.test(env[keyName]) ? "live" : /^(?:sk|rk)_test_/.test(env[keyName]) ? "test" : null;
      if (target === "preview" && kind === "live") err("PF-STRIPE-LIVE-KEY-IN-PREVIEW", keyName, "clé Stripe live dans un environnement preview");
      else if (kind && mode && kind !== mode) err("PF-STRIPE-KEY-MODE-MISMATCH", keyName, `la clé est de type ${kind}, le mode attendu est ${mode}`);
      else if (!kind) warn("PF-STRIPE-KEY-KIND", keyName, "préfixe de clé non reconnu (ni test ni live)");
    }
  }

  // 5. Registre DR : signalement seulement, jamais de contrôle d'une copie hors site.
  const dr = applicable.filter((v) => v.dr_critical).map((v) => v.name);
  if (dr.length) out.push(finding("info", "PF-DR-REGISTRY", "registre DR", `${dr.length} secret(s) critique(s) pour la reprise après sinistre : ${dr.join(", ")}`));

  return { findings: out, rows };
}

/** Détermine cible et application depuis le build Vercel, sans rien exiger hors déploiement. */
export function detectVercelTarget(env) {
  const v = env.VERCEL_ENV?.trim();
  return v === "preview" || v === "production" ? v : null;
}
