// Aides communes aux étapes de qualification (aucune valeur secrète ne sort d'ici).
import { resolve } from "node:path";
import { REF_PRODUCTION_CONNUE, estDefinie, refDepuisUrlApi, refDepuisUrlDb } from "../../lib/preview-guard.mjs";
import { Identifiant, STATUT, resultat, statutDepuisSortie } from "../lib/core.mjs";

export { estDefinie };

/** Exige des variables dans un fichier d'environnement chargé ; lève Identifiant (noms seulement). */
export function exigerVars(c, fichier, noms) {
  const env = fichier === "qualification" ? null : c.envs[fichier];
  if (fichier !== "qualification" && !env) throw new Identifiant(`${fichier}.env absent de --env-dir`);
  const manquantes = noms.filter((n) => !estDefinie(fichier === "qualification" ? c.q(n) : env[n]));
  if (manquantes.length) throw new Identifiant(`${fichier === "qualification" ? "qualification.env / shell" : `${fichier}.env`} : ${manquantes.join(", ")} absente(s)`);
}

/** Lignes en échec (✖) et avertissements (!) d'un script du pack, masquées et bornées. */
export function lignesSignificatives(c, sortie, max = 40) {
  return String(sortie).split("\n").filter((l) => /^\s+[✖!]/.test(l) || /^(REFUS|ÉCHEC|NO-GO|GO)\b/.test(l.trim()))
    .slice(0, max).map((l) => c.masque.appliquer(l.trim()));
}

/** Lance un script Node du dépôt qui fait des appels distants ; statut depuis son code de sortie. */
export function scriptDistant(c, chemin, args, env = {}, { timeoutMs = 600_000 } = {}) {
  const r = c.rt.distant(process.execPath, [resolve(c.root, chemin), ...args], { env, cwd: c.root, timeoutMs });
  const sortie = `${r.stdout}\n${r.stderr}`;
  return { code: r.code, sortie, statut: statutDepuisSortie(r.code, sortie) };
}

/** Script Node purement local (aucun réseau). */
export function scriptLocal(c, chemin, args, env = {}) {
  const r = c.rt.local(process.execPath, [resolve(c.root, chemin), ...args], { env, cwd: c.root });
  return { code: r.code, sortie: `${r.stdout}\n${r.stderr}` };
}

/** Résultat standard d'un script du pack. */
export function depuisScript(c, { statut, sortie }, resumeGo, resumeKo) {
  return resultat(statut, statut === STATUT.GO ? resumeGo : resumeKo, lignesSignificatives(c, sortie));
}

/** Environnement minimal passé aux scripts enfants : uniquement ce qui est nécessaire. */
export function envEnfant(source, noms) {
  const out = {};
  for (const n of noms) if (estDefinie(source?.[n])) out[n] = source[n];
  return out;
}

/** JSON sans jamais planter (réponse non JSON = null). */
export async function jsonOuNull(reponse) {
  try { return await reponse.json(); } catch { return null; }
}

export const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

/** Le fichier de cible (confirmation opérateur) est indispensable à toute étape qui vise la Preview. */
export function exigerCible(c) {
  if (!c.cible || !c.cible.supabase?.project_ref) throw new Identifiant("fichier de cible absent ou incomplet (--target preview-target.json)");
}

/**
 * Garde de connexion PostgreSQL, AVANT toute commande psql/pg_dump/CLI : la référence de
 * ELSATIA_PREVIEW_DB_URL doit être la Preview confirmée, jamais la Production. Indépendante du
 * statut des autres étapes (une lecture de la Production est refusée elle aussi).
 */
export function exigerDbPreview(c) {
  exigerCible(c);
  exigerVars(c, "qualification", ["ELSATIA_PREVIEW_DB_URL"]);
  const ref = refDepuisUrlDb(c.q("ELSATIA_PREVIEW_DB_URL"));
  if (!ref) throw new Error("ELSATIA_PREVIEW_DB_URL : référence Supabase non identifiable (db.<ref>.supabase.co ou postgres.<ref>@…pooler.supabase.com attendu) — aucune connexion");
  if (ref === REF_PRODUCTION_CONNUE) throw new Error("ELSATIA_PREVIEW_DB_URL vise la Supabase PRODUCTION — aucune connexion");
  if (ref !== c.cible.supabase.project_ref) throw new Error("ELSATIA_PREVIEW_DB_URL ≠ projet Preview confirmé — aucune connexion");
  return ref;
}

/** Même garde pour l'API Supabase de gp.env (Auth, Storage). */
export function exigerApiPreview(c, fichier = "gp") {
  exigerCible(c);
  exigerVars(c, fichier, ["NEXT_PUBLIC_SUPABASE_URL"]);
  const ref = refDepuisUrlApi(c.envs[fichier].NEXT_PUBLIC_SUPABASE_URL);
  if (ref === REF_PRODUCTION_CONNUE) throw new Error(`${fichier}.env NEXT_PUBLIC_SUPABASE_URL vise la PRODUCTION — aucun appel`);
  if (ref !== c.cible.supabase.project_ref) throw new Error(`${fichier}.env NEXT_PUBLIC_SUPABASE_URL ≠ projet Preview confirmé — aucun appel`);
  return ref;
}
