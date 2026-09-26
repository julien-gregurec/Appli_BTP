// ELSATIA — Pack d'exécution Preview : garde-fous communs des scripts `scripts/preview/*`.
//
// Tout est pur (aucun réseau, aucune écriture) et testé par scripts/preview/preview-pack.test.mjs.
// GARANTIE : aucune fonction de ce module ne renvoie ni n'écrit une valeur d'environnement ;
// seuls des noms, des états (« présente », « identique ») et des codes sont produits.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REF_PREVIEW_AUTORISEE } from "../../garde-scripts-production.mjs";
import { parseEnvFile } from "../../lib/env-manifest-preflight.mjs";

/** Référence Supabase Production connue (docs/ia/AI_PROD_ACTIVATION_V1.md). Jamais ciblée. */
export const REF_PRODUCTION_CONNUE = "exhvuzegsefmoguxoiak";
export { REF_PREVIEW_AUTORISEE };

/** Refus d'exécution : garde-fou ou usage. Code de sortie 2. */
export class Refus extends Error {}

/** Arguments `--nom valeur` et drapeaux `--nom`. */
export function lireOptions(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const suivant = argv[i + 1];
    if (suivant === undefined || suivant.startsWith("--")) options[a.slice(2)] = true;
    else { options[a.slice(2)] = suivant; i += 1; }
  }
  return options;
}

/** Charge un fichier dotenv local (jamais versionné). Les valeurs restent en mémoire. */
export function chargerFichierEnv(chemin) {
  let texte;
  try { texte = readFileSync(chemin, "utf8"); } catch { throw new Refus(`fichier d'environnement illisible : ${chemin}`); }
  return parseEnvFile(texte);
}

export const estDefinie = (v) => typeof v === "string" && v.trim() !== "";

/** Référence du projet depuis l'URL d'API Supabase (https://<ref>.supabase.co). */
export function refDepuisUrlApi(url) {
  try {
    const m = /^([a-z0-9]{20})\.supabase\.co$/i.exec(new URL(url).hostname);
    return m ? m[1].toLowerCase() : null;
  } catch { return null; }
}

/**
 * Référence du projet depuis une URL PostgreSQL Supabase :
 *  - connexion directe : postgresql://postgres:…@db.<ref>.supabase.co:5432/postgres
 *  - pooler Supavisor : postgresql://postgres.<ref>:…@aws-0-<region>.pooler.supabase.com:6543/postgres
 */
export function refDepuisUrlDb(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (!/^postgres(?:ql)?:$/.test(u.protocol)) return null;
  const direct = /^db\.([a-z0-9]{20})\.supabase\.co$/i.exec(u.hostname);
  if (direct) return direct[1].toLowerCase();
  const pooler = /^postgres\.([a-z0-9]{20})$/i.exec(decodeURIComponent(u.username));
  if (pooler && /\.pooler\.supabase\.com$/i.test(u.hostname)) return pooler[1].toLowerCase();
  return null;
}

/** Vérifie qu'une référence est bien la Preview attendue. Lève Refus sinon. */
export function exigerRefPreview(ref, refAttendue = REF_PREVIEW_AUTORISEE) {
  const attendue = String(refAttendue ?? "").toLowerCase();
  if (!ref) throw new Refus("référence Supabase introuvable dans l'URL fournie");
  if (ref === REF_PRODUCTION_CONNUE || attendue === REF_PRODUCTION_CONNUE) throw new Refus("référence Supabase PRODUCTION : refus");
  if (ref !== attendue) throw new Refus("la référence Supabase ne correspond pas à la Preview attendue (option --preview-ref)");
  return ref;
}

/** Refuse tout indicateur d'environnement Production dans le shell ou le fichier fourni. */
export function refuserProduction(env) {
  if (env.ELSATIA_APPLICATION_ENV?.trim() === "production" || env.VERCEL_ENV?.trim() === "production") {
    throw new Refus("environnement Production détecté : les scripts du pack Preview refusent de s'exécuter");
  }
}

/** Type d'une clé Stripe secrète ou restreinte, sans jamais la renvoyer. */
export function typeCleStripe(cle) {
  if (!estDefinie(cle)) return null;
  if (/^(?:sk|rk)_live_/.test(cle)) return "live";
  if (/^(?:sk|rk)_test_/.test(cle)) return "test";
  return "inconnu";
}

export function exigerCleStripeTest(cle, nom = "STRIPE_SECRET_KEY") {
  const type = typeCleStripe(cle);
  if (type === null) throw new Refus(`${nom} absente`);
  if (type === "live") throw new Refus(`${nom} est une clé LIVE : refus (Preview = Stripe Test uniquement)`);
  if (type !== "test") throw new Refus(`${nom} : préfixe non reconnu (sk_test_ / rk_test_ attendu)`);
}

/** Origine normalisée (schéma + hôte + port) ou null. */
export function origine(url) {
  try { return new URL(String(url).trim()).origin; } catch { return null; }
}

/**
 * Une origine Preview acceptable : HTTPS, jamais locale. Par défaut seules les URL
 * `*.vercel.app` passent ; un domaine personnalisé exige --allow-custom-domain (revue humaine).
 */
export function exigerOriginePreview(url, { domainePersonnaliseAutorise = false } = {}) {
  const o = origine(url);
  if (!o) throw new Refus("origine invalide");
  const { protocol, hostname } = new URL(o);
  if (protocol !== "https:") throw new Refus(`origine non HTTPS refusée (${hostname})`);
  if (/^(?:localhost|127\.|0\.0\.0\.0|\[::1\])/.test(hostname)) throw new Refus("origine locale refusée");
  if (!hostname.endsWith(".vercel.app") && !domainePersonnaliseAutorise) {
    throw new Refus(`domaine personnalisé ${hostname} : relancer avec --allow-custom-domain après avoir vérifié qu'il ne s'agit pas de la Production`);
  }
  return o;
}

/** Codes de sortie communs. */
export const SORTIE = Object.freeze({ GO: 0, NO_GO: 1, REFUS: 2 });

/** Formate un constat sans valeur. */
export function ligne(etat, code, sujet, message = "") {
  const icone = { ok: "✓", ko: "✖", info: "·", warn: "!" }[etat] ?? "·";
  return `  ${icone} [${code}] ${sujet}${message ? ` — ${message}` : ""}`;
}

/** Vrai si ce module est le point d'entrée (pas un import de test). */
export function estPointEntree(importMetaUrl) {
  return Boolean(process.argv[1]) && fileURLToPath(importMetaUrl) === resolve(process.argv[1]);
}
