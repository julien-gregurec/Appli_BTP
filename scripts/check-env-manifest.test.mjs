// Tests du contrôle du manifeste d'environnement.
//   node --test scripts/check-env-manifest.test.mjs
//
// AUCUNE valeur réelle : tout secret ci-dessous est fabriqué à l'exécution (concaténation ou
// encodage) pour ne jamais ressembler à un secret dans le source lui-même.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { MANIFEST_PATH, SCHEMA_PATH, checkManifest, loadJson } from "./lib/env-manifest-core.mjs";
import { controlesEnvironnementOperateur } from "./lib/env-manifest-operator.mjs";
import { parseEnvFile, runPreflight } from "./lib/env-manifest-preflight.mjs";
import { createGitSource, createMemorySource, envBlockNames, runRepoChecks } from "./lib/env-manifest-scan.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const schema = loadJson(ROOT, SCHEMA_PATH);
const realManifest = loadJson(ROOT, MANIFEST_PATH);

// ── Fabrique de manifeste minimal (structure valide, contenu fictif) ────────

const v = (name, extra = {}) => ({
  name, applications: ["gestion_pro"], required: false, environments: ["local", "preview", "production"],
  visibility: name.startsWith("NEXT_PUBLIC_") ? "public" : "server", secret: false,
  build_time: name.startsWith("NEXT_PUBLIC_"), runtime: true, category: "tooling", description: `variable fictive ${name}`,
  fail_mode: "default", deprecated: false, replacement: null, dr_critical: false, example_required: false, ...extra,
});
const secretVar = (name, extra = {}) => v(name, { secret: true, category: "security", fail_mode: "closed", ...extra });
const flagVar = (name, extra = {}) => v(name, {
  category: "feature_flag", fail_mode: "closed",
  flag: { kind: "boolean", absent_behavior: "closed", owner: "Test", criticality: "high", expected: { preview: "false" }, ...(extra.flag ?? {}) },
  ...extra, ...(extra.flag ? { flag: { kind: "boolean", absent_behavior: "closed", owner: "Test", criticality: "high", expected: { preview: "false" }, ...extra.flag } } : {}),
});

function manifestWith(variables, overrides = {}) {
  return {
    schema_version: 1,
    applications: {
      gestion_pro: { kind: "web", label: "GP", roots: ["src/", "next.config.ts"] },
      colors: { kind: "web", label: "Colors", roots: ["apps/colors/"] },
      reserves: { kind: "web", label: "Réserves", roots: ["apps/reserves/"] },
      tools: { kind: "web", label: "Tools", roots: ["apps/tools/"] },
      ops_scripts: { kind: "tooling", label: "Scripts", roots: ["scripts/"] },
    },
    system_variables: [{ name: "NODE_ENV", justification: "Next.js" }],
    scan: { exclude_paths: [], literal_prefixes: ["STRIPE_", "FEATURE_"], ignored_literals: [], dynamic_access_allowed: [], reference_only: [] },
    external_secrets: [], stripe_contracts: [], decisions: [], findings: [],
    variables, ...overrides,
  };
}

/** Déclare les gabarits d'exemple (par défaut, les fixtures n'en ont pas). */
function withExamples(manifest) {
  const out = structuredClone(manifest);
  out.applications.gestion_pro.examples = [
    { path: ".env.example", environment: "production" }, { path: ".env.preview.example", environment: "preview" }, { path: ".env.local.example", environment: "local" }];
  out.applications.reserves.examples = [{ path: "apps/reserves/.env.example", environment: "any" }];
  return out;
}

let cachedRun = null;
/** Le scan du dépôt réel est lent sur un volume externe : une seule fois pour tous les tests. */
const realRun = () => (cachedRun ??= runRepoChecks(realManifest, createGitSource({ root: ROOT })));

const errorsOf = (findings) => findings.filter((f) => f.level === "error");
const has = (findings, code, subject) => findings.some((f) => f.code === code && (!subject || f.subject === subject));
const repo = (manifest, files) => runRepoChecks(manifest, createMemorySource(files)).findings;

// ── Le dépôt réel et son manifeste ──────────────────────────────────────────

test("manifeste réel : structure et cohérence interne sans erreur", () => {
  const raw = readFileSync(`${ROOT}/${MANIFEST_PATH}`, "utf8");
  assert.deepEqual(errorsOf(checkManifest(realManifest, schema, raw)), []);
});

test("manifeste réel : aucun champ de valeur, aucune forme de secret (le manifeste ne porte que des noms)", () => {
  const raw = readFileSync(`${ROOT}/${MANIFEST_PATH}`, "utf8");
  assert.equal(has(checkManifest(realManifest, schema, raw), "MAN-VALUE-LEAK"), false);
});

test("dépôt réel : code, gabarits et manifeste concordent (aucune erreur)", () => {
  const { findings } = realRun();
  assert.deepEqual(errorsOf(findings).map((f) => `${f.code} ${f.subject}`), []);
});

test("Stripe : STRIPE_WEBHOOK_EXPECTED_MODE est requise et figure dans les trois gabarits racine", () => {
  const entry = realManifest.variables.find((x) => x.name === "STRIPE_WEBHOOK_EXPECTED_MODE");
  assert.equal(entry.required, true);
  assert.deepEqual(entry.allowed_values, ["test", "live"]);
  for (const file of [".env.example", ".env.preview.example", ".env.local.example"]) {
    const names = parseEnvFile(readFileSync(`${ROOT}/${file}`, "utf8"));
    assert.ok("STRIPE_WEBHOOK_EXPECTED_MODE" in names, `${file} doit déclarer STRIPE_WEBHOOK_EXPECTED_MODE`);
  }
});

test("Studio : STUDIO_STORAGE_SERVICE_KEY est classée service_role, secrète, serveur seul, avec finding de nom", () => {
  const entry = realManifest.variables.find((x) => x.name === "STUDIO_STORAGE_SERVICE_KEY");
  assert.equal(entry.category, "supabase_service_role");
  assert.equal(entry.secret, true);
  assert.equal(entry.visibility, "server");
  assert.match(entry.description, /service_role/);
  assert.ok(entry.finding_ids.includes("F-STUDIO-SERVICE-KEY-NAME"));
});

test("DR : le registre contient BANK_DATA_ENCRYPTION_KEY, la clé Ed25519 et les secrets externes de restauration", () => {
  const dr = new Set(realManifest.variables.filter((x) => x.dr_critical).map((x) => x.name));
  assert.ok(dr.has("BANK_DATA_ENCRYPTION_KEY"));
  assert.ok(dr.has("STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64"));
  const external = new Set(realManifest.external_secrets.filter((x) => x.dr_critical).map((x) => x.id));
  assert.ok(external.has("supabase_project_jwt_secret") && external.has("dr_volume_passphrase"));
});

// ── A. Code ↔ manifeste ─────────────────────────────────────────────────────

test("variable inconnue : lue dans le code mais absente du manifeste → erreur", () => {
  const findings = repo(manifestWith([v("KNOWN_ONE")]), { "src/a.ts": "const x = process.env.BRAND_NEW_VAR;" });
  assert.ok(has(findings, "ENV-UNKNOWN", "BRAND_NEW_VAR"));
});

test("variable inconnue lue par un accès indirect (environnement.X) → erreur aussi", () => {
  const findings = repo(manifestWith([]), { "src/lib/f.ts": "export const f = (environnement = process.env) => environnement.SNEAKY_FLAG_ENABLED;" });
  assert.ok(has(findings, "ENV-UNKNOWN", "SNEAKY_FLAG_ENABLED"));
});

test("nom cité en littéral (table de noms) avec un préfixe suivi → erreur si inconnu", () => {
  const findings = repo(manifestWith([]), { "src/lib/p.ts": 'const T = { a: "STRIPE_PRICE_NOUVEAU_MENSUEL" };' });
  assert.ok(has(findings, "ENV-UNKNOWN", "STRIPE_PRICE_NOUVEAU_MENSUEL"));
});

test("variable système exclue avec justification : aucune erreur", () => {
  assert.deepEqual(errorsOf(repo(manifestWith([]), { "src/a.ts": "if (process.env.NODE_ENV === 'production') {}" })), []);
});

test("commentaire : une variable citée en commentaire n'est pas un usage", () => {
  assert.deepEqual(errorsOf(repo(manifestWith([]), { "src/a.ts": "// process.env.GHOST_VAR\n/* process.env.GHOST_TWO */\n * process.env.GHOST_THREE" })), []);
});

test("accès dynamique process.env[x] non justifié → erreur ; justifié → accepté", () => {
  const files = { "src/dyn.ts": "const r = process.env[nom];" };
  assert.ok(has(repo(manifestWith([]), files), "ENV-DYNAMIC-ACCESS"));
  const allowed = manifestWith([], { scan: { exclude_paths: [], literal_prefixes: [], ignored_literals: [], reference_only: [], dynamic_access_allowed: [{ path: "src/dyn.ts", justification: "test" }] } });
  assert.equal(has(repo(allowed, files), "ENV-DYNAMIC-ACCESS"), false);
});

test("variable lue par une application non déclarée → erreur ENV-APP-MISMATCH", () => {
  const findings = repo(manifestWith([v("ONLY_GP_VAR")]), { "apps/colors/src/x.ts": "process.env.ONLY_GP_VAR" });
  assert.ok(has(findings, "ENV-APP-MISMATCH", "ONLY_GP_VAR"));
});

// ── B. Manifeste ↔ code ─────────────────────────────────────────────────────

test("variable orpheline : déclarée, jamais lue → avertissement ; obligatoire et jamais lue → erreur", () => {
  const files = { "src/a.ts": "process.env.USED_ONE" };
  const findings = repo(manifestWith([v("USED_ONE"), v("NEVER_READ"), v("REQUIRED_NEVER_READ", { required: true })]), files);
  assert.ok(findings.some((f) => f.code === "ENV-ORPHAN" && f.subject === "NEVER_READ" && f.level === "warning"));
  assert.ok(findings.some((f) => f.code === "ENV-REQUIRED-UNUSED" && f.subject === "REQUIRED_NEVER_READ" && f.level === "error"));
});

test("alias deprecated encore lu → avertissement avec le remplaçant", () => {
  const manifest = manifestWith([
    v("CANON_KEY", { accepted_aliases: ["OLD_KEY"] }),
    v("OLD_KEY", { deprecated: true, replacement: "CANON_KEY", migration: "lire CANON_KEY" }),
  ]);
  const findings = repo(manifest, { "src/a.ts": "process.env.OLD_KEY; process.env.CANON_KEY" });
  const hit = findings.find((f) => f.code === "ENV-DEPRECATED-USED" && f.subject === "OLD_KEY");
  assert.ok(hit && hit.message.includes("CANON_KEY"));
});

test("un alias legacy doit être déprécié et pointer vers le nom canonique", () => {
  const bad = manifestWith([v("CANON_KEY", { accepted_aliases: ["OLD_KEY"] }), v("OLD_KEY")]);
  assert.ok(has(checkManifest(bad, schema), "MAN-ALIAS-CONFLICT"));
});

// ── C. Gabarits .env.example ────────────────────────────────────────────────

test("variable d'exemple manquante : requise dans un gabarit, absente → erreur", () => {
  const manifest = manifestWith([v("NEEDED_VAR", { example_required: true, environments: ["production"] })]);
  const findings = repo(withExamples(manifest), { "src/a.ts": "process.env.NEEDED_VAR", ".env.example": "OTHER=1\n", ".env.preview.example": "", ".env.local.example": "" });
  assert.ok(has(findings, "EXAMPLE-MISSING", "NEEDED_VAR"));
});

test("un gabarit ne déclare pas une variable inconnue du manifeste", () => {
  const findings = repo(withExamples(manifestWith([v("A_VAR")])), { "src/a.ts": "process.env.A_VAR", ".env.example": "A_VAR=\nMYSTERY=1\n", ".env.preview.example": "", ".env.local.example": "" });
  assert.ok(has(findings, "EXAMPLE-UNKNOWN", "MYSTERY"));
});

test("secret avec une vraie valeur dans un gabarit → erreur sans jamais recopier la valeur", () => {
  const fake = "Zq8" + "X".repeat(30);
  const findings = repo(withExamples(manifestWith([secretVar("SOME_SECRET")])), { "src/a.ts": "process.env.SOME_SECRET", ".env.example": `SOME_SECRET=${fake}\n`, ".env.preview.example": "", ".env.local.example": "" });
  assert.ok(has(findings, "EXAMPLE-SECRET-VALUE", "SOME_SECRET"));
  assert.equal(JSON.stringify(findings).includes(fake), false, "la valeur ne doit pas apparaître dans les constats");
});

test("valeur de gabarit qui a la forme d'un secret (clé live) → erreur", () => {
  const shaped = "sk_live_" + "A".repeat(24);
  const findings = repo(withExamples(manifestWith([v("PLAIN_VAR")])), { "src/a.ts": "process.env.PLAIN_VAR", ".env.example": `PLAIN_VAR=${shaped}\n`, ".env.preview.example": "", ".env.local.example": "" });
  assert.ok(has(findings, "EXAMPLE-SECRET-SHAPE", "PLAIN_VAR"));
  assert.equal(JSON.stringify(findings).includes(shaped), false);
});

test("gabarit production/preview : adresse locale interdite ; gabarit local : permise", () => {
  const manifest = manifestWith([v("APP_URL_X", { url_class: "app_base", category: "url" })]);
  const files = { "src/a.ts": "process.env.APP_URL_X", ".env.example": "APP_URL_X=http://localhost:3000\n", ".env.preview.example": "APP_URL_X=http://127.0.0.1:3000\n", ".env.local.example": "APP_URL_X=http://localhost:3000\n" };
  const findings = repo(withExamples(manifest), files);
  assert.equal(findings.filter((f) => f.code === "EXAMPLE-LOCALHOST").length, 2);
});

test("gabarit : ELSATIA_APPLICATION_ENV doit valoir l'environnement du gabarit (jamais « local » en production)", () => {
  const manifest = manifestWith([v("ELSATIA_APPLICATION_ENV", { allowed_values: ["local", "test", "preview", "production"] })]);
  const files = { "src/a.ts": "process.env.ELSATIA_APPLICATION_ENV", ".env.example": "ELSATIA_APPLICATION_ENV=local\n" };
  assert.ok(has(repo(withExamples(manifest), { ...files, ".env.preview.example": "", ".env.local.example": "" }), "EXAMPLE-ENV-INDICATOR"));
});

test("gabarit : un drapeau doit porter la valeur attendue pour son environnement", () => {
  const manifest = manifestWith([flagVar("FEATURE_X_ENABLED")]);
  const files = { "src/a.ts": "process.env.FEATURE_X_ENABLED", ".env.preview.example": "FEATURE_X_ENABLED=true\n" };
  assert.ok(has(repo(withExamples(manifest), { ...files, ".env.example": "", ".env.local.example": "" }), "EXAMPLE-FLAG-VALUE"));
});

test("Réserves : le gabarit doit déclarer ce que le code lit (non-régression ANON / PUBLISHABLE)", () => {
  const manifest = manifestWith([
    v("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", { applications: ["gestion_pro"], accepted_aliases: ["NEXT_PUBLIC_SUPABASE_ANON_KEY"] }),
    v("NEXT_PUBLIC_SUPABASE_ANON_KEY", { applications: ["reserves"], required: true, example_required: true, deprecated: true, replacement: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", migration: "plus tard" }),
  ]);
  const code = { "apps/reserves/src/lib/supabase/server.ts": "createServerClient(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)" };
  // Gabarit incohérent (l'ancien état) : déclare PUBLISHABLE alors que le code lit ANON.
  const bad = repo(withExamples(manifest), { ...code, "apps/reserves/.env.example": "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=publishable-key\n" });
  assert.ok(has(bad, "EXAMPLE-FOREIGN", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), "PUBLISHABLE n'appartient pas à Réserves");
  assert.ok(has(bad, "EXAMPLE-MISSING", "NEXT_PUBLIC_SUPABASE_ANON_KEY"), "le nom lu par le code doit figurer au gabarit");
  // Gabarit corrigé : aucune erreur.
  const good = repo(withExamples(manifest), { ...code, "apps/reserves/.env.example": "NEXT_PUBLIC_SUPABASE_ANON_KEY=publishable-key\n" });
  assert.deepEqual(errorsOf(good), []);
});

test("Réserves réel : le gabarit déclare le nom que lit le code de Réserves", () => {
  const example = parseEnvFile(readFileSync(`${ROOT}/apps/reserves/.env.example`, "utf8"));
  const reads = readFileSync(`${ROOT}/apps/reserves/src/lib/supabase/server.ts`, "utf8");
  const nameRead = /process\.env\.(NEXT_PUBLIC_SUPABASE_[A-Z_]*KEY)/.exec(reads)[1];
  assert.ok(nameRead in example, `le gabarit de Réserves doit déclarer ${nameRead}, lu par le code`);
});

// ── D. Public / secret ──────────────────────────────────────────────────────

test("secret déclaré sous un nom public (NEXT_PUBLIC_) → erreur du manifeste", () => {
  const bad = manifestWith([v("NEXT_PUBLIC_LEAKY_SECRET", { secret: true }), v("NEXT_PUBLIC_SERVICE_ROLE_KEY")]);
  const findings = checkManifest(bad, schema);
  assert.ok(has(findings, "MAN-SECRET-PUBLIC", "NEXT_PUBLIC_LEAKY_SECRET"));
  assert.ok(has(findings, "MAN-SECRET-PUBLIC", "NEXT_PUBLIC_SERVICE_ROLE_KEY"));
});

test("un nom qui ressemble à un secret doit être classé secret", () => {
  assert.ok(has(checkManifest(manifestWith([v("PAYMENT_API_KEY")]), schema), "MAN-SECRET-NAME", "PAYMENT_API_KEY"));
});

test("composant client qui lit une variable serveur → erreur", () => {
  const manifest = manifestWith([secretVar("SERVER_SECRET")]);
  const findings = repo(manifest, { "src/components/C.tsx": '"use client";\nexport const k = process.env.SERVER_SECRET;' });
  assert.ok(has(findings, "ENV-SERVER-VAR-IN-CLIENT", "SERVER_SECRET"));
});

test("composant client qui importe un module de clé de service → erreur", () => {
  const findings = repo(manifestWith([]), { "src/components/C.tsx": '"use client";\nimport { createAdminClient } from "@/lib/supabase/admin";' });
  assert.ok(has(findings, "ENV-SERVICE-ROLE-IN-CLIENT"));
});

test("next.config : le bloc env: ne doit injecter aucun secret dans le bundle", () => {
  const manifest = manifestWith([secretVar("SIGNING_SECRET"), v("ELSATIA_BUILD_INFO", { public_via: "next_config_env", visibility: "public", build_time: true })]);
  const cfg = 'const c = { env: { ELSATIA_BUILD_INFO: "x", SIGNING_SECRET: process.env.SIGNING_SECRET }, other: 1 };';
  assert.deepEqual(envBlockNames(cfg).sort(), ["ELSATIA_BUILD_INFO", "SIGNING_SECRET"]);
  const findings = repo(manifest, { "next.config.ts": cfg });
  assert.ok(has(findings, "ENV-NEXT-CONFIG-SECRET", "SIGNING_SECRET"));
  assert.equal(has(findings, "ENV-NEXT-CONFIG-SECRET", "ELSATIA_BUILD_INFO"), false);
});

test("clé de service : catégorie supabase_service_role serveur seul ; nom non canonique sans finding refusé", () => {
  const bad = manifestWith([v("ODD_STORAGE_KEY", { category: "supabase_service_role", secret: true, fail_mode: "closed" })]);
  assert.ok(has(checkManifest(bad, schema), "MAN-SERVICE-ROLE", "ODD_STORAGE_KEY"));
  const pub = manifestWith([v("SUPABASE_SERVICE_ROLE_KEY", { category: "supabase_service_role", secret: false })]);
  assert.ok(has(checkManifest(pub, schema), "MAN-SERVICE-ROLE"));
});

test("manifeste : aucune valeur secrète tolérée (forme de clé live, URL avec identifiants)", () => {
  const shaped = "sk_live_" + "B".repeat(24);
  assert.ok(has(checkManifest(manifestWith([v("A")]), schema, `{"x":"${shaped}"}`), "MAN-VALUE-LEAK"));
  assert.ok(has(checkManifest(manifestWith([v("A")]), schema, '{"x":"postgres://user:pass@host/db"}'), "MAN-VALUE-LEAK"));
});

// ── Drapeaux ────────────────────────────────────────────────────────────────

test("drapeau : un FEATURE_* / *_ENABLED doit être déclaré comme feature_flag", () => {
  const findings = repo(manifestWith([v("FEATURE_THING_ENABLED")]), { "src/a.ts": "process.env.FEATURE_THING_ENABLED" });
  assert.ok(has(findings, "ENV-FLAG-UNDECLARED", "FEATURE_THING_ENABLED"));
});

test("drapeau fail-open : sans justification ni décision → erreur ; avec décision → avertissement documenté", () => {
  const open = flagVar("FEATURE_OPEN_ENABLED", { fail_mode: "open", flag: { absent_behavior: "open" } });
  assert.ok(has(checkManifest(manifestWith([open]), schema), "MAN-FLAG-FAIL-OPEN"));
  const documented = { ...open, decision: "DECISION_REQUIRED:X" };
  const ok = checkManifest(manifestWith([documented], { decisions: [{ id: "DECISION_REQUIRED:X", question: "q", options: ["a"] }] }), schema);
  assert.equal(has(ok, "MAN-FLAG-FAIL-OPEN"), false);
  assert.ok(ok.some((f) => f.code === "FLAG-FAIL-OPEN" && f.level === "warning"));
});

test("drapeau réel FEATURE_CRONS_ENABLED : écart fail-open documenté, comportement inchangé", () => {
  const crons = realManifest.variables.find((x) => x.name === "FEATURE_CRONS_ENABLED");
  assert.equal(crons.flag.absent_behavior, "open");
  assert.equal(crons.decision, "DECISION_REQUIRED:FLAG-CRONS-FAIL-OPEN");
  for (const closed of ["FEATURE_BOUTIQUE_ENABLED", "FEATURE_AI_ENABLED", "FEATURE_AI_DEVIS_ENABLED", "FEATURE_RELANCES_AUTO_ENABLED"]) {
    assert.equal(realManifest.variables.find((x) => x.name === closed).flag.absent_behavior, "closed", closed);
  }
});

// ── Stripe : contrats incompatibles ─────────────────────────────────────────

test("Stripe : deux contrats incompatibles actifs → constat DECISION_REQUIRED", () => {
  const manifest = manifestWith([], {
    decisions: [{ id: "DECISION_REQUIRED:STRIPE-MODULE", question: "q", options: ["a", "b"] }],
    stripe_contracts: [
      { id: "flat", family: "modules", status: "runtime", description: "d", decision: "DECISION_REQUIRED:STRIPE-MODULE", evidence: [{ path: "src/a.ts", pattern: "FLAT" }] },
      { id: "per-forfait", family: "modules", status: "catalogue_contract", description: "d", decision: "DECISION_REQUIRED:STRIPE-MODULE", evidence: [{ path: "src/b.ts", pattern: "PER_FORFAIT" }] },
    ],
  });
  const both = repo(manifest, { "src/a.ts": "FLAT", "src/b.ts": "PER_FORFAIT" });
  assert.ok(both.some((f) => f.level === "decision" && f.code === "STRIPE-CONTRACTS-DIVERGENT" && f.subject === "modules"));
  const one = repo(manifest, { "src/a.ts": "FLAT", "src/b.ts": "autre chose" });
  assert.equal(has(one, "STRIPE-CONTRACTS-DIVERGENT"), false);
});

test("Stripe réel : le CI signale les contrats incompatibles connus (modules, comptes supplémentaires, options IA)", () => {
  const { findings } = realRun();
  const families = findings.filter((f) => f.code === "STRIPE-CONTRACTS-DIVERGENT").map((f) => f.subject).sort();
  assert.deepEqual(families, ["comptes_supplementaires", "modules", "options_ia"]);
});

// ── Garde de Colors ─────────────────────────────────────────────────────────

test("garde de Colors : son contrat ne doit pas dériver du manifeste", () => {
  const manifest = manifestWith([v("NEXT_PUBLIC_COLORS_URL", { applications: ["colors"], required: true })]);
  const guard = 'export const CONTRAT_ENV_PUBLIC = [\n  { name: "NEXT_PUBLIC_COLORS_URL", kind: "url" },\n  { name: "NEXT_PUBLIC_EXTRA_URL", kind: "url" },\n];';
  const findings = repo(manifest, { "apps/colors/scripts/verify-public-env.mjs": guard });
  assert.ok(has(findings, "COLORS-GUARD-CONTRACT", "NEXT_PUBLIC_EXTRA_URL"));
});

// ── E. Preflight de déploiement ─────────────────────────────────────────────

const pfManifest = () => manifestWith([
  v("ELSATIA_APPLICATION_ENV", { required: true, environments: ["local", "test", "preview", "production"], category: "env_indicator", allowed_values: ["local", "test", "preview", "production"] }),
  v("NEXT_PUBLIC_APP_URL", { required: true, category: "url", url_class: "app_base" }),
  v("NEXT_PUBLIC_SUPABASE_URL", { required: true, category: "supabase_public", url_class: "api_endpoint" }),
  v("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", { required: true, category: "supabase_public" }),
  secretVar("SUPABASE_SERVICE_ROLE_KEY", { required: true, category: "supabase_service_role" }),
  secretVar("STRIPE_SECRET_KEY", { required: true, category: "payments", environments: ["preview", "production"] }),
  v("STRIPE_WEBHOOK_EXPECTED_MODE", { required: true, category: "payments", environments: ["preview", "production"], allowed_values: ["test", "live"] }),
  v("TOOLS_ALLOWED_ORIGINS", { category: "url", url_class: "origin_list", local_origin_exceptions: ["capacitor://localhost", "https://localhost"] }),
  flagVar("FEATURE_CRONS_ENABLED", { flag: { must_be_defined_in: ["production"], expected: { preview: "false" } } }),
  flagVar("FEATURE_LOCAL_ONLY_ENABLED", { flag: { kind: "local_only" }, forbidden_in: ["preview", "production"], required: false }),
]);
const goodEnv = () => ({
  ELSATIA_APPLICATION_ENV: "production", NEXT_PUBLIC_APP_URL: "https://app.example.test", NEXT_PUBLIC_SUPABASE_URL: "https://proj.example.test",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_" + "a".repeat(20), SUPABASE_SERVICE_ROLE_KEY: "sb_secret_" + "b".repeat(20),
  STRIPE_SECRET_KEY: "sk_live_" + "c".repeat(24), STRIPE_WEBHOOK_EXPECTED_MODE: "live", FEATURE_CRONS_ENABLED: "true",
});
const pf = (env, target = "production", apps = ["gestion_pro"]) => runPreflight(pfManifest(), env, { target, apps }).findings;

test("preflight : une configuration saine ne produit aucune erreur", () => {
  assert.deepEqual(errorsOf(pf(goodEnv())), []);
});

test("preflight : variable requise absente → erreur nommée ; ne dit jamais la valeur", () => {
  const env = goodEnv(); delete env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(has(pf(env), "PF-REQUIRED-MISSING", "SUPABASE_SERVICE_ROLE_KEY"));
});

test("preflight : localhost / adresse privée en production → erreur ; capacitor://localhost autorisé", () => {
  assert.ok(has(pf({ ...goodEnv(), NEXT_PUBLIC_APP_URL: "http://localhost:3000" }), "PF-URL-LOCALHOST", "NEXT_PUBLIC_APP_URL"));
  assert.ok(has(pf({ ...goodEnv(), NEXT_PUBLIC_SUPABASE_URL: "https://127.0.0.1:54321" }), "PF-URL-LOCALHOST", "NEXT_PUBLIC_SUPABASE_URL"));
  assert.ok(has(pf({ ...goodEnv(), NEXT_PUBLIC_APP_URL: "https://192.168.1.20" }), "PF-URL-LOCALHOST"));
  assert.ok(has(pf({ ...goodEnv(), NEXT_PUBLIC_APP_URL: "http://app.example.test" }), "PF-URL-INSECURE"));
  assert.equal(has(pf({ ...goodEnv(), TOOLS_ALLOWED_ORIGINS: "https://tools.example.test,capacitor://localhost,https://localhost" }), "PF-URL-LOCALHOST"), false);
  assert.ok(has(pf({ ...goodEnv(), TOOLS_ALLOWED_ORIGINS: "https://tools.example.test,http://localhost:3020" }), "PF-URL-LOCALHOST", "TOOLS_ALLOWED_ORIGINS"));
});

test("preflight : environnement absent, incohérent ou en désaccord avec Vercel → erreur (jamais de repli local)", () => {
  const noEnv = goodEnv(); delete noEnv.ELSATIA_APPLICATION_ENV;
  assert.ok(has(pf(noEnv), "PF-ENV-ABSENT"));
  assert.ok(has(pf({ ...goodEnv(), ELSATIA_APPLICATION_ENV: "local" }), "PF-ENV-MISMATCH"));
  assert.ok(has(pf({ ...goodEnv(), ELSATIA_APPLICATION_ENV: "prod" }), "PF-ENV-INVALID"));
  assert.ok(has(pf({ ...goodEnv(), VERCEL_ENV: "preview" }), "PF-VERCEL-ENV-MISMATCH"));
  assert.ok(has(pf({ ...goodEnv(), ELSATIA_APPLICATION_ENV: "production" }, "preview"), "PF-ENV-MISMATCH"));
});

test("preflight : alias deprecated en place → avertissement", () => {
  const manifest = manifestWith([
    v("CANON", { required: true }),
    v("LEGACY", { deprecated: true, replacement: "CANON", migration: "migrer" }),
  ]);
  const { findings } = runPreflight(manifest, { CANON: "x", LEGACY: "y" }, { target: "preview", apps: ["gestion_pro"] });
  assert.ok(findings.some((f) => f.code === "PF-DEPRECATED-PRESENT" && f.subject === "LEGACY" && f.level === "warning"));
});

test("preflight : drapeau non défini signalé ; défini mais inattendu ou interdit → erreur", () => {
  const env = goodEnv(); delete env.FEATURE_CRONS_ENABLED;
  const undefinedFlag = pf(env);
  assert.ok(undefinedFlag.some((f) => f.code === "PF-FLAG-UNDEFINED" && f.subject === "FEATURE_CRONS_ENABLED" && f.level === "error"), "obligatoirement défini en production");
  const preview = pf({ ...goodEnv(), ELSATIA_APPLICATION_ENV: "preview", STRIPE_SECRET_KEY: "sk_test_" + "d".repeat(24), STRIPE_WEBHOOK_EXPECTED_MODE: "test", FEATURE_CRONS_ENABLED: "true" }, "preview");
  assert.ok(has(preview, "PF-FLAG-UNEXPECTED", "FEATURE_CRONS_ENABLED"));
  assert.ok(has(pf({ ...goodEnv(), FEATURE_LOCAL_ONLY_ENABLED: "true" }), "PF-FORBIDDEN-PRESENT", "FEATURE_LOCAL_ONLY_ENABLED"));
  assert.equal(has(pf({ ...goodEnv(), FEATURE_LOCAL_ONLY_ENABLED: "false" }), "PF-FORBIDDEN-PRESENT"), false);
});

test("preflight Stripe : mode attendu invalide, live en preview, clé incohérente avec le mode, test en production", () => {
  assert.ok(has(pf({ ...goodEnv(), STRIPE_WEBHOOK_EXPECTED_MODE: "maybe" }), "PF-STRIPE-MODE-INVALID"));
  const previewBase = { ...goodEnv(), ELSATIA_APPLICATION_ENV: "preview", FEATURE_CRONS_ENABLED: "false" };
  assert.ok(has(pf({ ...previewBase, STRIPE_WEBHOOK_EXPECTED_MODE: "live", STRIPE_SECRET_KEY: "sk_test_" + "e".repeat(24) }, "preview"), "PF-STRIPE-MODE-PREVIEW-LIVE"));
  assert.ok(has(pf({ ...previewBase, STRIPE_WEBHOOK_EXPECTED_MODE: "test" }, "preview"), "PF-STRIPE-LIVE-KEY-IN-PREVIEW", "STRIPE_SECRET_KEY"));
  assert.ok(has(pf({ ...goodEnv(), STRIPE_SECRET_KEY: "sk_test_" + "f".repeat(24) }), "PF-STRIPE-KEY-MODE-MISMATCH", "STRIPE_SECRET_KEY"));
  const testInProd = pf({ ...goodEnv(), STRIPE_WEBHOOK_EXPECTED_MODE: "test", STRIPE_SECRET_KEY: "sk_test_" + "g".repeat(24) });
  assert.ok(testInProd.some((f) => f.code === "PF-STRIPE-TEST-IN-PRODUCTION" && f.level === "warning"));
  const noMode = goodEnv(); delete noMode.STRIPE_WEBHOOK_EXPECTED_MODE;
  assert.ok(has(pf(noMode), "PF-REQUIRED-MISSING", "STRIPE_WEBHOOK_EXPECTED_MODE"));
});

test("preflight Supabase : clé de service dans une variable publique, clé publique dans la variable de service", () => {
  assert.ok(has(pf({ ...goodEnv(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_secret_" + "h".repeat(20) }), "PF-SUPABASE-KEY-ROLE", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"));
  assert.ok(has(pf({ ...goodEnv(), SUPABASE_SERVICE_ROLE_KEY: "sb_publishable_" + "i".repeat(20) }), "PF-SUPABASE-KEY-ROLE", "SUPABASE_SERVICE_ROLE_KEY"));
  const jwt = (role) => ["e30", Buffer.from(JSON.stringify({ role })).toString("base64url"), "sig"].join(".");
  assert.ok(has(pf({ ...goodEnv(), NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt("service_role") }), "PF-SUPABASE-KEY-ROLE"));
  assert.ok(has(pf({ ...goodEnv(), SUPABASE_SERVICE_ROLE_KEY: jwt("anon") }), "PF-SUPABASE-KEY-ROLE"));
});

test("preflight : une variable NEXT_PUBLIC_ inconnue ou qui ressemble à un secret est refusée", () => {
  const shaped = "sk_live_" + "j".repeat(24);
  const findings = pf({ ...goodEnv(), NEXT_PUBLIC_STRIPE_SECRET_KEY: shaped, NEXT_PUBLIC_WHATEVER: "x" });
  assert.ok(has(findings, "PF-PUBLIC-SECRET-NAME", "NEXT_PUBLIC_STRIPE_SECRET_KEY"));
  assert.ok(has(findings, "PF-PUBLIC-VALUE-SECRET-SHAPED", "NEXT_PUBLIC_STRIPE_SECRET_KEY"));
  assert.ok(has(findings, "PF-UNKNOWN-PUBLIC", "NEXT_PUBLIC_WHATEVER"));
});

test("preflight : GARANTIE — aucune valeur n'apparaît jamais dans les constats", () => {
  const secrets = ["sb_secret_" + "k".repeat(22), "sk_live_" + "l".repeat(26), "sb_publishable_" + "m".repeat(22)];
  const env = { ...goodEnv(), SUPABASE_SERVICE_ROLE_KEY: secrets[2], STRIPE_SECRET_KEY: secrets[1], NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secrets[0], ELSATIA_APPLICATION_ENV: "preview", NEXT_PUBLIC_APP_URL: "http://localhost:3000" };
  const out = JSON.stringify(runPreflight(pfManifest(), env, { target: "production", apps: ["gestion_pro"] }));
  for (const s of secrets) assert.equal(out.includes(s), false, "une valeur a fuité dans un constat");
  assert.equal(out.includes("localhost:3000"), false, "même une valeur d'URL ne doit pas être recopiée");
});

test("preflight : le registre DR est signalé (info), sans contrôle d'une copie hors site", () => {
  const manifest = manifestWith([secretVar("A_KEY_SECRET", { dr_critical: true, dr_note: "irrécupérable", required: true })]);
  const { findings } = runPreflight(manifest, { A_KEY_SECRET: "x" }, { target: "production", apps: ["gestion_pro"] });
  const dr = findings.find((f) => f.code === "PF-DR-REGISTRY");
  assert.ok(dr && dr.level === "info" && dr.message.includes("A_KEY_SECRET"));
});

test("registre DR : les éléments de l'audit sont obligatoires ; dr_critical est réservé aux secrets", () => {
  const stripped = structuredClone(realManifest);
  stripped.variables.find((x) => x.name === "BANK_DATA_ENCRYPTION_KEY").dr_critical = false;
  stripped.external_secrets = [];
  const findings = checkManifest(stripped, schema);
  assert.ok(has(findings, "MAN-DR-MINIMUM", "BANK_DATA_ENCRYPTION_KEY"));
  assert.ok(has(findings, "MAN-DR-MINIMUM", "supabase_project_jwt_secret"));
  assert.ok(has(checkManifest(manifestWith([v("PUBLIC_THING", { dr_critical: true, dr_note: "x" })]), schema), "MAN-DR-NOT-SECRET"));
});

test("indicateur d'environnement : ELSATIA_APPLICATION_ENV est requis en preview et production avec les 4 valeurs", () => {
  const bad = structuredClone(realManifest);
  bad.variables.find((x) => x.name === "ELSATIA_APPLICATION_ENV").allowed_values = ["local", "preview", "production"];
  assert.ok(has(checkManifest(bad, schema), "MAN-ENV-INDICATOR"));
});


// ── Raccord au preflight opérateur du cutover ───────────────────────────────

/** Racine temporaire avec une copie du manifeste, pour tester « report » et « enforce » sans toucher au dépôt. */
function rootWithEnforcement(mode) {
  const dir = mkdtempSync(`${tmpdir()}/elsatia-env-op-`);
  mkdirSync(`${dir}/config`);
  cpSync(`${ROOT}/${SCHEMA_PATH}`, `${dir}/${SCHEMA_PATH}`);
  writeFileSync(`${dir}/${MANIFEST_PATH}`, JSON.stringify({ ...realManifest, preflight_enforcement: mode }));
  return dir;
}
function fakeTargetDump(dir) {
  const secretLike = "sk_live_" + "p".repeat(26);
  const file = `${dir}/target.env`;
  writeFileSync(file, `ELSATIA_APPLICATION_ENV=preview\nNEXT_PUBLIC_APP_URL=http://localhost:3000\nSTRIPE_SECRET_KEY=${secretLike}\n`);
  return { file, secretLike };
}

test("raccord cutover : en mode report, aucune ligne du manifeste ne bloque, et aucune valeur n'apparaît", () => {
  const dir = rootWithEnforcement("report");
  const { file, secretLike } = fakeTargetDump(dir);
  const lignes = controlesEnvironnementOperateur({ root: dir, environment: "production", envFile: file, shellEnv: {} });
  assert.ok(lignes.some((l) => l.code === "ENVM-RESUME" && l.ok === false));
  assert.ok(lignes.some((l) => l.code === "ENVM-PF-URL-LOCALHOST"), "l'URL locale est signalée");
  assert.equal(lignes.every((l) => l.bloquant === false), true, "report = rien ne bloque");
  const out = JSON.stringify(lignes);
  assert.equal(out.includes(secretLike), false);
  assert.equal(out.includes("localhost:3000"), false, "même une URL n'est pas recopiée");
});

test("raccord cutover : en mode enforce, les erreurs du manifeste deviennent bloquantes", () => {
  const dir = rootWithEnforcement("enforce");
  const { file } = fakeTargetDump(dir);
  const lignes = controlesEnvironnementOperateur({ root: dir, environment: "production", envFile: file, shellEnv: {} });
  const erreurs = lignes.filter((l) => l.code.startsWith("ENVM-PF-") && l.ok === false);
  assert.ok(erreurs.length > 0 && erreurs.every((l) => l.bloquant === true));
});

test("raccord cutover : sans dump l'environnement cible n'est pas évalué (jamais d'accès Vercel), sans bloquer", () => {
  const dir = rootWithEnforcement("enforce");
  const lignes = controlesEnvironnementOperateur({ root: dir, environment: "production", shellEnv: {} });
  const sansDump = lignes.find((l) => l.code === "ENVM-SANS-DUMP");
  assert.ok(sansDump && sansDump.ok === false && sansDump.bloquant === false);
});

test("raccord cutover : les variables du shell opérateur viennent du manifeste, présence seulement, jamais bloquantes", () => {
  const dir = rootWithEnforcement("enforce");
  const jeton = "tok_" + "r".repeat(30);
  const lignes = controlesEnvironnementOperateur({ root: dir, environment: "production", shellEnv: { SUPABASE_DB_URL: jeton } });
  const db = lignes.find((l) => l.code === "ENV-SUPABASE_DB_URL");
  const token = lignes.find((l) => l.code === "ENV-SUPABASE_ACCESS_TOKEN");
  assert.equal(db.ok, true);
  assert.equal(token.ok, false);
  assert.equal(db.bloquant === false && token.bloquant === false, true);
  assert.equal(JSON.stringify(lignes).includes(jeton), false);
  for (const name of ["SUPABASE_DB_URL", "SUPABASE_ACCESS_TOKEN"]) {
    const entry = realManifest.variables.find((x) => x.name === name);
    assert.deepEqual(entry.applications, ["ops_scripts"]);
    assert.equal(entry.secret, true);
  }
});

test("raccord cutover : le patch supprime l'inventaire en dur et n'ajoute aucun second système", () => {
  const patch = readFileSync(`${ROOT}/docs/runbooks/patches/ELSATIA_PREFLIGHT_CHECK_ENV_MANIFEST_V1.patch`, "utf8");
  const removed = patch.split("\n").filter((l) => l.startsWith("-") && !l.startsWith("---")).join("\n");
  const added = patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).join("\n");
  assert.match(removed, /envAttendues/, "l'ancien inventaire en dur est retiré");
  assert.match(added, /controlesEnvironnementOperateur/, "les contrôles viennent de l'adaptateur du manifeste");
  assert.doesNotMatch(added, /STRIPE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|process\.env\[/, "aucune liste de variables réintroduite");
});

test("variable lue hors de cet arbre (external_consumer) : pas orpheline", () => {
  const manifest = manifestWith([v("OPERATOR_ONLY_VAR", { applications: ["ops_scripts"], external_consumer: "scripts/cutover/x.mjs (autre ligne)" })]);
  const findings = repo(manifest, { "scripts/a.mjs": "// rien" });
  assert.equal(has(findings, "ENV-ORPHAN", "OPERATOR_ONLY_VAR"), false);
  assert.ok(has(findings, "ENV-EXTERNAL-CONSUMER", "OPERATOR_ONLY_VAR"));
});

// ── CLI ─────────────────────────────────────────────────────────────────────

test("CLI : le mode --preflight n'affiche aucune valeur et sort en échec sur une configuration dangereuse", () => {
  const fake = "sk_live_" + "n".repeat(26);
  const file = `${process.env.TMPDIR ?? "/tmp"}/elsatia-env-preflight-${process.pid}.env`;
  execFileSync("node", ["-e", `require("node:fs").writeFileSync(${JSON.stringify(file)}, "STRIPE_SECRET_KEY=${fake}\\nNEXT_PUBLIC_APP_URL=http://localhost:3000\\n")`]);
  let output = "";
  let status = 0;
  try {
    output = execFileSync("node", [resolve(ROOT, "scripts/check-env-manifest.mjs"), "--preflight", "--environment", "production", "--app", "gestion_pro", "--env-file", file], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) { status = error.status; output = `${error.stdout}${error.stderr}`; }
  assert.equal(status, 1);
  assert.equal(output.includes(fake), false, "la clé ne doit pas apparaître dans la sortie");
  assert.match(output, /PF-URL-LOCALHOST/);
  assert.match(output, /NO-GO/);
});
