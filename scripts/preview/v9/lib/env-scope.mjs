// ELSATIA — Pack opérateur V9 : manifeste d'environnement vs inventaire Vercel EXPORTÉ (Phase I).
//
// Hors ligne : l'inventaire est un fichier fourni par l'opérateur. Formats acceptés :
//   - JSON de l'API Vercel (`{ envs: [{ key, target: [...], type, value? }] }`) ou tableau équivalent ;
//   - texte de `vercel env ls` (nom, valeur masquée, environnements, date) ;
//   - dotenv de `vercel env pull --environment=preview` (toutes les clés = scope Preview).
// GARANTIE : aucune valeur n'est conservée. À la lecture, chaque valeur est réduite à des faits
// (vide ?, clé Stripe live ?, référence Supabase, valeur d'un drapeau booléen/mode NON secret),
// puis oubliée. La sortie ne contient que : PRESENT, MISSING, EMPTY, WRONG_SCOPE.

import { REF_PREVIEW_AUTORISEE } from "./constantes.mjs";
import { refDepuisApi } from "./cible.mjs";

const SCOPES = { production: "production", preview: "preview", development: "development" };
const STRIPE_LIVE = /\b(?:sk|rk|pk)_live_[A-Za-z0-9]/;

/** Variables non secrètes dont la valeur courte peut être comparée (drapeaux, modes). */
function factsDepuisValeur(nom, valeur, manifestParNom) {
  if (valeur === undefined || valeur === null) return { valeurConnue: false };
  const v = String(valeur);
  const def = manifestParNom.get(nom);
  const lisible = def && !def.secret && (def.flag || def.allowed_values || /^(STRIPE_WEBHOOK_EXPECTED_MODE|ELSATIA_APPLICATION_ENV|NEXT_PUBLIC_TOOLS_ENV|TOOLS_STORE_ENVIRONMENT)$/.test(nom)) && v.length <= 40;
  return {
    valeurConnue: true,
    vide: v.trim() === "",
    stripeLive: STRIPE_LIVE.test(v),
    refSupabase: nom === "NEXT_PUBLIC_SUPABASE_URL" ? refDepuisApi(v) : undefined,
    valeurDrapeau: lisible ? v.trim() : undefined,
  };
}

function normaliserScopes(t) {
  const liste = Array.isArray(t) ? t : typeof t === "string" ? t.split(/[,\s]+/) : [];
  return new Set(liste.map((x) => SCOPES[String(x).trim().toLowerCase()]).filter(Boolean));
}

/**
 * @returns {Map<string, {scopes: Set<string>, valeurConnue: boolean, vide?: boolean, stripeLive?: boolean, refSupabase?: string|null, valeurDrapeau?: string}>}
 */
export function lireInventaire(texte, manifest) {
  const parNom = new Map(manifest.variables.map((v) => [v.name, v]));
  const inv = new Map();
  const ajouter = (nom, scopes, valeur) => {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(nom)) return;
    const prec = inv.get(nom);
    const f = factsDepuisValeur(nom, valeur, parNom);
    if (prec) { for (const s of scopes) prec.scopes.add(s); if (f.valeurConnue && scopes.has("preview")) Object.assign(prec, f); return; }
    inv.set(nom, { scopes: new Set(scopes), ...(scopes.has("preview") ? f : { valeurConnue: false }) });
  };
  const brut = String(texte ?? "").trim();
  if (brut.startsWith("{") || brut.startsWith("[")) {
    const j = JSON.parse(brut);
    const liste = Array.isArray(j) ? j : j.envs ?? j.variables ?? [];
    for (const e of liste) {
      const valeur = e.type === "plain" || e.type === undefined ? e.value : undefined; // jamais un chiffré
      ajouter(String(e.key ?? e.name ?? ""), normaliserScopes(e.target ?? e.targets ?? e.environments), valeur);
    }
    return inv;
  }
  const lignes = brut.split(/\r?\n/);
  const estDotenv = lignes.filter((l) => l.trim() && !l.trim().startsWith("#")).every((l) => /^\s*(?:export\s+)?[A-Za-z_][A-Za-z0-9_]*=/.test(l));
  if (estDotenv) {
    for (const l of lignes) {
      const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(l);
      if (m && !/^\s*#/.test(l)) ajouter(m[1], new Set(["preview"]), m[2].trim().replace(/^["']|["']$/g, ""));
    }
    return inv;
  }
  for (const l of lignes) {
    const m = /^\s*([A-Z][A-Z0-9_]*)\s+.*?\b((?:Production|Preview|Development)(?:\s*,\s*(?:Production|Preview|Development))*)\b/.exec(l);
    if (m) ajouter(m[1], normaliserScopes(m[2]), undefined);
  }
  return inv;
}

/** Classe d'une variable du manifeste pour une cible Preview. */
export function classe(v) {
  if (v.deprecated) return "DEPRECATED";
  const envs = v.environments ?? [];
  if (envs.every((e) => e === "local" || e === "test")) return "TEST_ONLY";
  if (!envs.includes("preview") && envs.includes("production")) return "LIVE_ONLY";
  if (v.required || v.flag?.must_be_defined_in?.includes("preview")) return "REQUIRED";
  return "OPTIONAL";
}

export const POINTS_IMPORTANTS = Object.freeze({
  "Stripe Live (drapeaux)": ["ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE", "ABONNEMENTS_PUBLICS_OUVERTS", "STRIPE_WEBHOOK_EXPECTED_MODE"],
  "Stripe Test": ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_ABONNEMENT_SECRET", "STRIPE_WEBHOOK_SECRET", "STRIPE_PORTAL_CONFIGURATION_ID"],
  "Crons": ["CRON_SECRET", "FEATURE_CRONS_ENABLED"],
  "E-mail (Brevo)": ["BREVO_API_KEY", "EMAIL_FROM_ADDRESS", "EMAIL_PREVIEW_ALLOWLIST"],
  "IBAN (k1)": ["BANK_DATA_ENCRYPTION_KEY", "BANK_DATA_ENCRYPTION_KEYS", "BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID", "BANK_DATA_ENCRYPTION_WRITE_FORMAT"],
  "PDF": ["PDF_CHROMIUM_EXECUTABLE_PATH", "PDF_CONCURRENCE", "PDF_FILE_MAX", "PDF_ATTENTE_MAX_MS", "PDF_DUREE_MAX_MS"],
  "Supabase": ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
  "Limiteur de connexion (1113)": ["RATE_LIMIT_HMAC_KEY"],
  "URL applicatives": ["NEXT_PUBLIC_APP_URL", "NEXT_PUBLIC_COLORS_URL", "TOOLS_APP_URL", "ELSATIA_APPLICATION_ENV"],
});

/**
 * Compare le manifeste (application, cible preview) à l'inventaire.
 * @returns {{ lignes: object[], erreurs: object[], avertissements: object[], verdict: string }}
 */
export function comparerInventaire(manifest, inv, { app = "gestion_pro" } = {}) {
  const lignes = [];
  const erreurs = [];
  const avertissements = [];
  const vars = manifest.variables.filter((v) => v.applications.includes(app));
  for (const v of vars) {
    const k = classe(v);
    const i = inv.get(v.name);
    const enPreview = Boolean(i?.scopes.has("preview"));
    let statut;
    if (!i) statut = "MISSING";
    else if (!enPreview) statut = "WRONG_SCOPE";
    else if (i.valeurConnue && i.vide) statut = "EMPTY";
    else statut = "PRESENT";
    if ((k === "LIVE_ONLY" || k === "TEST_ONLY") && enPreview) statut = "WRONG_SCOPE";
    if ((k === "LIVE_ONLY" || k === "TEST_ONLY") && !enPreview) statut = i ? "PRESENT" : "MISSING";
    const ligne = { name: v.name, classe: k, statut, scopes: i ? [...i.scopes].sort() : [] };
    lignes.push(ligne);
    if (k === "REQUIRED" && statut !== "PRESENT") erreurs.push({ code: `ENV-${statut}`, name: v.name, message: `${v.name} requise en Preview : ${statut}` });
    if ((k === "LIVE_ONLY" || k === "TEST_ONLY") && statut === "WRONG_SCOPE") avertissements.push({ code: "ENV-WRONG_SCOPE", name: v.name, message: `${v.name} (${k}) posée en scope Preview` });
    if (k === "DEPRECATED" && enPreview) avertissements.push({ code: "ENV-DEPRECATED", name: v.name, message: `${v.name} dépréciée encore posée en Preview` });
    // Drapeaux : valeur attendue en preview (si la valeur est connue ; sinon non vérifiable).
    const attendu = v.flag?.expected?.preview;
    if (attendu && enPreview) {
      if (i.valeurDrapeau === undefined) avertissements.push({ code: "ENV-FLAG-UNVERIFIED", name: v.name, message: `${v.name} : valeur non vérifiable depuis cet inventaire (attendu ${attendu} ; fournir un dotenv)` });
      else if (i.valeurDrapeau !== attendu) erreurs.push({ code: "ENV-FLAG", name: v.name, message: `${v.name} : valeur ≠ attendue en Preview (${attendu})` });
    }
  }
  // Stripe : rien de live en Preview.
  for (const [nom, i] of inv) {
    if (!i.scopes.has("preview")) continue;
    if (i.stripeLive) erreurs.push({ code: "ENV-STRIPE-LIVE", name: nom, message: `${nom} : clé Stripe LIVE en scope Preview : REFUS` });
  }
  const mode = inv.get("STRIPE_WEBHOOK_EXPECTED_MODE");
  if (mode?.scopes.has("preview") && mode.valeurDrapeau !== undefined && mode.valeurDrapeau !== "test") erreurs.push({ code: "ENV-STRIPE-LIVE", name: "STRIPE_WEBHOOK_EXPECTED_MODE", message: "STRIPE_WEBHOOK_EXPECTED_MODE ≠ test en Preview : REFUS" });
  const env = inv.get("ELSATIA_APPLICATION_ENV");
  if (env?.scopes.has("preview") && env.valeurDrapeau !== undefined && env.valeurDrapeau !== "preview") erreurs.push({ code: "ENV-APP-ENV", name: "ELSATIA_APPLICATION_ENV", message: "ELSATIA_APPLICATION_ENV ≠ preview en scope Preview" });
  const url = inv.get("NEXT_PUBLIC_SUPABASE_URL");
  if (url?.scopes.has("preview") && url.refSupabase !== undefined && url.refSupabase !== REF_PREVIEW_AUTORISEE) erreurs.push({ code: "ENV-SUPABASE-REF", name: "NEXT_PUBLIC_SUPABASE_URL", message: "NEXT_PUBLIC_SUPABASE_URL (Preview) ne désigne pas la Preview pgvvpqyjziyapbbkydmc" });

  const verdict = erreurs.length ? "ENV_SCOPE_BLOCKED" : avertissements.length ? "ENV_SCOPE_PARTIAL" : "ENV_SCOPE_OK";
  return { lignes, erreurs, avertissements, verdict };
}
