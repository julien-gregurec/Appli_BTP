// ELSATIA — Manifeste d'environnement : raccord au preflight OPÉRATEUR du cutover.
//
// `scripts/cutover/preflight-check.mjs` (ligne cutover) contrôlait la présence de 5 variables
// listées EN DUR dans le script : un second inventaire. Ce module lui fournit, à la place, les
// contrôles d'environnement DÉRIVÉS de config/env-manifest.json, au format que ce script
// consomme déjà : { code, libelle, ok, detail, bloquant }.
//
// Règles :
//   - AUCUNE valeur n'est écrite dans un détail (noms, règles et familles de forme seulement) ;
//   - tant que le manifeste est en `preflight_enforcement: "report"`, RIEN ne bloque : les
//     constats sortent en WARN. Ils ne bloquent qu'en « enforce » ;
//   - aucun accès distant : le dump de l'environnement cible est un FICHIER LOCAL fourni par
//     l'opérateur (--env-file), jamais lu depuis Vercel.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MANIFEST_PATH, SCHEMA_PATH, checkManifest, loadJson } from "./env-manifest-core.mjs";
import { parseEnvFile, runPreflight } from "./env-manifest-preflight.mjs";

/** Applications contrôlées par défaut pour un cutover de Gestion Pro + le shell de l'opérateur. */
export const APPLICATIONS_CUTOVER = ["gestion_pro", "ops_scripts"];

/**
 * @param root         racine du dépôt (contient config/env-manifest.json)
 * @param environment  environnement cible : preview | production (défaut : production)
 * @param apps         applications du manifeste à contrôler
 * @param envFile      chemin d'un dump local de l'environnement CIBLE (facultatif)
 * @param shellEnv     variables du shell de l'opérateur (défaut : process.env)
 * @returns lignes { code, libelle, ok, detail, bloquant }
 */
export function controlesEnvironnementOperateur({
  root,
  environment = "production",
  apps = APPLICATIONS_CUTOVER,
  envFile = null,
  shellEnv = process.env,
}) {
  const manifest = loadJson(root, MANIFEST_PATH);
  const schema = loadJson(root, SCHEMA_PATH);
  const enforce = (manifest.preflight_enforcement ?? "report") === "enforce";
  const lignes = [];
  const ligne = (code, libelle, ok, detail) => lignes.push({ code, libelle, ok, detail, bloquant: enforce });

  const structure = checkManifest(manifest, schema, readFileSync(resolve(root, MANIFEST_PATH), "utf8")).filter((f) => f.level === "error");
  for (const f of structure) ligne(`ENVM-${f.code}`, `manifeste ${f.subject}`, false, f.message);
  if (structure.length) return lignes;

  // Variables de l'application cible : uniquement si l'opérateur fournit un dump de cet environnement.
  // Le shell de l'opérateur ne contient PAS les variables de l'application : sans dump, on le dit.
  const appsCible = apps.filter((a) => a !== "ops_scripts");
  if (envFile) {
    const dump = parseEnvFile(readFileSync(resolve(envFile), "utf8"));
    const { findings } = runPreflight(manifest, dump, { target: environment, apps: appsCible });
    const erreurs = findings.filter((f) => f.level === "error");
    const alertes = findings.filter((f) => f.level === "warning");
    ligne("ENVM-RESUME", `environnement ${environment} (${appsCible.join(", ")}) vs manifeste`, erreurs.length === 0,
      `${erreurs.length} erreur(s), ${alertes.length} avertissement(s) — valeurs non affichées`);
    for (const f of erreurs) ligne(`ENVM-${f.code}`, `${f.code} ${f.subject}`, false, f.message);
  } else if (appsCible.length) {
    lignes.push({
      code: "ENVM-SANS-DUMP",
      libelle: `environnement ${environment} (${appsCible.join(", ")}) vs manifeste`,
      ok: false,
      detail: "non évalué : fournir --env-file <dump local de l'environnement cible> (aucun accès Vercel)",
      bloquant: false,
    });
  }

  // Variables du SHELL de l'opérateur (jetons et URL de cutover) : présence seulement.
  if (apps.includes("ops_scripts")) {
    const { findings, rows } = runPreflight(manifest, shellEnv, { target: environment, apps: ["ops_scripts"] });
    for (const r of rows) {
      lignes.push({
        code: `ENV-${r.name}`,
        libelle: `variable ${r.name} (shell opérateur)`,
        ok: r.state === "présente",
        detail: r.state === "présente" ? "définie (valeur non affichée)" : "non définie dans ce shell",
        bloquant: false, // même comportement que le contrôle historique : jamais bloquant
      });
    }
    for (const f of findings.filter((x) => x.level === "error" && !x.code.startsWith("PF-REQUIRED"))) {
      ligne(`ENVM-${f.code}`, `${f.code} ${f.subject}`, false, f.message);
    }
  }
  return lignes;
}
