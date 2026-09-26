// ELSATIA — Manifeste d'environnement : cœur du contrôleur.
//
// Rien ici ne lit, ne compare ni n'affiche la VALEUR d'une variable d'environnement. Les
// messages ne portent que des noms de variables, des identifiants de règle et des chemins.
// Aucune dépendance : le contrôle doit tourner dans la CI sans installation préalable.

import { readFileSync } from "node:fs";

export const MANIFEST_PATH = "config/env-manifest.json";
export const SCHEMA_PATH = "config/env-manifest.schema.json";

/** Fichiers qui définissent le contrôle : jamais analysés comme du code applicatif. */
export const SELF_PATHS = [
  "scripts/check-env-manifest.mjs",
  "scripts/check-env-manifest.test.mjs",
  "scripts/lib/env-manifest-core.mjs",
  "scripts/lib/env-manifest-scan.mjs",
  "scripts/lib/env-manifest-preflight.mjs",
  "scripts/lib/env-manifest-operator.mjs",
  MANIFEST_PATH,
  SCHEMA_PATH,
];

/** Un nom qui ressemble à un secret doit être classé secret. Motif volontairement large. */
export const SECRET_NAME_PATTERN =
  /(SECRET|PRIVATE|PASSWORD|TOKEN|SERVICE_ROLE|SERVICE_KEY|API_KEY|ENCRYPTION_KEY|HMAC_KEY|SERVICE_ACCOUNT_JSON|REDIS_URL)/;

/** Secrets DR exigés au minimum par l'audit ENV/DR. Leur retrait du registre fait échouer le contrôle. */
export const DR_MINIMUM_VARIABLES = ["BANK_DATA_ENCRYPTION_KEY", "STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64"];
export const DR_MINIMUM_EXTERNAL = ["supabase_project_jwt_secret", "dr_volume_passphrase"];

/** Formes de valeurs secrètes reconnues (noms de familles seulement dans les messages). */
export const SECRET_VALUE_SHAPES = [
  { family: "clé Stripe live", re: /\b(?:sk|rk)_live_[A-Za-z0-9]{10,}/ },
  { family: "secret webhook Stripe", re: /\bwhsec_[A-Za-z0-9]{16,}/ },
  { family: "clé Supabase secrète", re: /\bsb_secret_[A-Za-z0-9_-]{16,}/ },
  { family: "clé privée PEM", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { family: "JWT", re: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}/ },
  { family: "clé OpenAI", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/ },
  { family: "clé Brevo", re: /\bxkeysib-[A-Za-z0-9-]{10,}/ },
  { family: "clé AWS", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { family: "jeton GitHub", re: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
];

export function shapeOfSecret(value) {
  if (typeof value !== "string") return null;
  return SECRET_VALUE_SHAPES.find((s) => s.re.test(value))?.family ?? null;
}

// ── Constats ────────────────────────────────────────────────────────────────

/** level : error (échoue) | warning | decision (DECISION_REQUIRED) | info. */
export function finding(level, code, subject, message) {
  return { level, code, subject, message };
}

// ── Validation de schéma (sous-ensemble JSON Schema, sans dépendance) ───────

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function resolveRef(root, ref) {
  return ref.replace(/^#\//, "").split("/").reduce((node, key) => node?.[key], root);
}

export function validateSchema(root, schema, value, path, out) {
  if (schema.$ref) return validateSchema(root, resolveRef(root, schema.$ref), value, path, out);
  if (schema.enum && !schema.enum.includes(value)) {
    out.push(`${path} : valeur hors énumération (${schema.enum.join("|")})`);
    return;
  }
  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const ok = allowed.includes(actual) || (actual === "integer" && allowed.includes("number"));
    if (!ok) {
      out.push(`${path} : type ${actual} au lieu de ${allowed.join("|")}`);
      return;
    }
  }
  if (typeof value === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) out.push(`${path} : ne respecte pas ${schema.pattern}`);
    if (schema.minLength && value.length < schema.minLength) out.push(`${path} : trop court`);
  }
  if (Array.isArray(value) && schema.items) {
    value.forEach((item, i) => validateSchema(root, schema.items, item, `${path}[${i}]`, out));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required ?? []) if (!(key in value)) out.push(`${path}.${key} : champ obligatoire absent`);
    const props = schema.properties ?? {};
    for (const [key, child] of Object.entries(value)) {
      if (props[key]) validateSchema(root, props[key], child, `${path}.${key}`, out);
      else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        validateSchema(root, schema.additionalProperties, child, `${path}.${key}`, out);
      } else if (schema.additionalProperties === false) out.push(`${path}.${key} : champ non prévu par le schéma`);
    }
  }
}

/**
 * Niveau d'application du preflight pour une cible donnée. Une valeur par cible
 * (`preflight_enforcement_by_target`) l'emporte sur la valeur globale (`preflight_enforcement`),
 * qui reste le défaut ; en l'absence des deux : « report ». Une cible inconnue retombe sur le
 * défaut global — jamais sur « enforce » par surprise.
 */
export function resolveEnforcement(manifest, target) {
  const byTarget = manifest.preflight_enforcement_by_target ?? {};
  return byTarget[target] ?? manifest.preflight_enforcement ?? "report";
}

export function loadJson(root, relativePath) {
  return JSON.parse(readFileSync(`${root}/${relativePath}`, "utf8"));
}

// ── Cohérence interne du manifeste ──────────────────────────────────────────

export function indexVariables(manifest) {
  return new Map(manifest.variables.map((v) => [v.name, v]));
}

export function checkManifest(manifest, schema, rawText = "") {
  const out = [];
  const err = (code, subject, message) => out.push(finding("error", code, subject, message));
  const warn = (code, subject, message) => out.push(finding("warning", code, subject, message));

  const schemaErrors = [];
  validateSchema(schema, schema, manifest, "manifest", schemaErrors);
  for (const message of schemaErrors) err("MAN-SCHEMA", "manifest", message);
  if (schemaErrors.length) return out; // la suite suppose une structure valide

  const apps = new Set(Object.keys(manifest.applications));
  const byName = indexVariables(manifest);
  const decisionIds = new Set((manifest.decisions ?? []).map((d) => d.id));
  const findingIds = new Set((manifest.findings ?? []).map((f) => f.id));
  const seen = new Set();

  for (const v of manifest.variables) {
    const at = v.name;
    if (seen.has(at)) err("MAN-DUPLICATE", at, "variable déclarée deux fois");
    seen.add(at);

    for (const a of v.applications) if (!apps.has(a)) err("MAN-APP-UNKNOWN", at, `application inconnue « ${a} »`);
    if (!v.applications.length) err("MAN-APP-EMPTY", at, "aucune application");

    // Visibilité : le préfixe NEXT_PUBLIC_ et la classe « public » doivent coïncider.
    const prefixed = at.startsWith("NEXT_PUBLIC_");
    if (prefixed && v.visibility !== "public") err("MAN-VISIBILITY", at, "NEXT_PUBLIC_ doit être visibilité public");
    if (v.visibility === "public" && !prefixed && !v.public_via) {
      err("MAN-VISIBILITY", at, "visibilité public sans préfixe NEXT_PUBLIC_ : public_via obligatoire");
    }
    if (v.secret && v.visibility !== "server") err("MAN-SECRET-PUBLIC", at, "un secret ne peut pas être public");
    if (prefixed && v.secret) err("MAN-SECRET-PUBLIC", at, "un secret ne peut pas porter le préfixe NEXT_PUBLIC_");
    if (prefixed && SECRET_NAME_PATTERN.test(at)) {
      err("MAN-SECRET-PUBLIC", at, "nom NEXT_PUBLIC_ qui ressemble à un secret");
    }
    if (SECRET_NAME_PATTERN.test(at) && !v.secret) err("MAN-SECRET-NAME", at, "le nom ressemble à un secret mais secret=false");

    if (v.required && !v.environments.length) err("MAN-REQUIRED-ENVS", at, "required=true sans environnement");
    for (const env of v.forbidden_in ?? []) {
      if (v.required && v.environments.includes(env)) err("MAN-FORBIDDEN-CONFLICT", at, `requise et interdite en ${env}`);
    }
    if (!v.build_time && !v.runtime) err("MAN-TIMING", at, "ni build_time ni runtime");

    // Dépréciation et alias.
    if (v.deprecated) {
      if (v.replacement && !byName.has(v.replacement)) err("MAN-REPLACEMENT-UNKNOWN", at, `remplacement inconnu ${v.replacement}`);
      if (v.replacement === at) err("MAN-REPLACEMENT-SELF", at, "remplacement = soi-même");
      if (!v.migration) err("MAN-MIGRATION", at, "variable dépréciée sans plan de migration");
    } else if (v.replacement) {
      err("MAN-REPLACEMENT", at, "replacement renseigné sur une variable non dépréciée");
    }
    for (const alias of v.accepted_aliases ?? []) {
      const a = byName.get(alias);
      if (!a) err("MAN-ALIAS-UNKNOWN", at, `alias ${alias} sans entrée`);
      else if (!a.deprecated || a.replacement !== at) err("MAN-ALIAS-CONFLICT", at, `alias ${alias} doit être déprécié avec replacement=${at}`);
    }

    // DR.
    if (v.dr_critical && !v.secret) err("MAN-DR-NOT-SECRET", at, "dr_critical est réservé aux secrets");
    if (v.dr_critical && !v.dr_note) err("MAN-DR-NOTE", at, "dr_critical sans dr_note (perte, recréable ?)");

    // Drapeaux.
    if ((v.category === "feature_flag") !== Boolean(v.flag)) {
      err("MAN-FLAG", at, "category=feature_flag et champ flag doivent aller ensemble");
    }
    if (v.flag) {
      if (v.flag.absent_behavior === "closed" && v.fail_mode !== "closed") err("MAN-FLAG", at, "absent_behavior=closed exige fail_mode=closed");
      if (v.flag.absent_behavior === "open") {
        if (v.fail_mode !== "open") err("MAN-FLAG", at, "absent_behavior=open exige fail_mode=open");
        if (v.flag.open_by_design) {
          out.push(finding("info", "FLAG-FAIL-OPEN-BY-DESIGN", at, `fail-open voulu : ${v.flag.open_by_design}`));
        } else if (v.decision) {
          warn("FLAG-FAIL-OPEN", at, `écart documenté : absent = ACTIF (cible fail-closed) — ${v.decision}`);
        } else {
          err("MAN-FLAG-FAIL-OPEN", at, "drapeau fail-open sans justification (open_by_design) ni décision : la cible est fail-closed");
        }
      }
    }

    // URL.
    if (v.category === "url" && !v.url_class) err("MAN-URL", at, "category=url sans url_class");
    if (v.local_origin_exceptions?.length && v.url_class !== "origin_list") err("MAN-URL", at, "local_origin_exceptions réservé à origin_list");

    // Clés de service : jamais publiques, nom canonique ou migration documentée.
    if (v.category === "supabase_service_role") {
      if (!v.secret || v.visibility !== "server") err("MAN-SERVICE-ROLE", at, "une clé service_role est secrète et serveur seul");
      if (at !== "SUPABASE_SERVICE_ROLE_KEY" && !(v.finding_ids ?? []).length) {
        err("MAN-SERVICE-ROLE", at, "nom non canonique : un finding de migration de nom est obligatoire");
      }
    }

    if (v.decision && !decisionIds.has(v.decision)) err("MAN-DECISION-UNKNOWN", at, `décision ${v.decision} non déclarée`);
    for (const id of v.finding_ids ?? []) if (!findingIds.has(id)) err("MAN-FINDING-UNKNOWN", at, `finding ${id} non déclaré`);
  }

  // Indicateur d'environnement unique.
  const envVar = byName.get("ELSATIA_APPLICATION_ENV");
  if (!envVar) err("MAN-ENV-INDICATOR", "ELSATIA_APPLICATION_ENV", "indicateur d'environnement canonique absent");
  else {
    const want = ["local", "test", "preview", "production"];
    if (want.some((e) => !(envVar.allowed_values ?? []).includes(e))) {
      err("MAN-ENV-INDICATOR", envVar.name, "allowed_values doit contenir local, test, preview, production");
    }
    if (!envVar.required || !["preview", "production"].every((e) => envVar.environments.includes(e))) {
      err("MAN-ENV-INDICATOR", envVar.name, "doit être requis en preview et production");
    }
  }

  // Registre DR minimal.
  for (const name of DR_MINIMUM_VARIABLES) {
    if (!byName.get(name)?.dr_critical) err("MAN-DR-MINIMUM", name, "doit figurer au registre DR (dr_critical=true)");
  }
  const externals = new Map((manifest.external_secrets ?? []).map((s) => [s.id, s]));
  for (const id of DR_MINIMUM_EXTERNAL) {
    if (!externals.get(id)?.dr_critical) err("MAN-DR-MINIMUM", id, "secret externe DR obligatoire absent du registre");
  }

  for (const c of manifest.stripe_contracts ?? []) {
    if (c.decision && !decisionIds.has(c.decision)) err("MAN-DECISION-UNKNOWN", c.id, `décision ${c.decision} non déclarée`);
  }

  // Le manifeste ne porte jamais de valeur : on cherche des formes de secrets ou des identifiants inline.
  const shape = shapeOfSecret(rawText);
  if (shape) err("MAN-VALUE-LEAK", "manifest", `forme de secret détectée dans le manifeste (${shape}) : retirer`);
  if (/\b[a-z][a-z0-9+.-]*:\/\/[^\s/"@]+:[^\s/"@]+@/i.test(rawText)) {
    err("MAN-VALUE-LEAK", "manifest", "URL avec identifiants intégrés détectée dans le manifeste");
  }

  return out;
}
