#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : manifeste d'environnement V9 vs inventaire Vercel EXPORTÉ (Phase I).
 *
 * Usage :
 *   node scripts/preview/v9/env-scope-check.mjs <inventaire> [--app gestion_pro] [--all] [--json]
 * <inventaire> : JSON de l'API Vercel (`{envs:[{key,target,type}]}`), sortie texte de
 * `vercel env ls`, ou dotenv de `vercel env pull --environment=preview` (fichier HORS dépôt).
 * Classes : REQUIRED · OPTIONAL · DEPRECATED · LIVE_ONLY · TEST_ONLY.
 * États   : PRESENT · MISSING · EMPTY · WRONG_SCOPE. Aucune valeur n'est affichée.
 * Sortie : 0 ENV_SCOPE_OK · 0 ENV_SCOPE_PARTIAL (avertissements) · 1 ENV_SCOPE_BLOCKED · 2 usage.
 */
import { readFileSync } from "node:fs";
import { loadJson, MANIFEST_PATH } from "../../lib/env-manifest-core.mjs";
import { estPointEntree, lireOptions } from "../lib/preview-guard.mjs";
import { comparerInventaire, lireInventaire, POINTS_IMPORTANTS } from "./lib/env-scope.mjs";
import { ROOT } from "./lib/train.mjs";

export function executer(argv, { manifest = loadJson(ROOT, MANIFEST_PATH), log = console.log } = {}) {
  const o = lireOptions(argv);
  const fichier = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--app");
  if (!fichier) { log("usage : env-scope-check.mjs <inventaire> [--app gestion_pro] [--all] [--json]"); return 2; }
  let inv;
  try { inv = lireInventaire(readFileSync(fichier, "utf8"), manifest); } catch { log("ENV_SCOPE_BLOCKED\n  ✖ inventaire illisible"); return 1; }
  const app = typeof o.app === "string" ? o.app : "gestion_pro";
  const r = comparerInventaire(manifest, inv, { app });
  if (o.json) {
    log(JSON.stringify({ verdict: r.verdict, app, lignes: r.lignes, erreurs: r.erreurs, avertissements: r.avertissements }, null, 2));
    return r.verdict === "ENV_SCOPE_BLOCKED" ? 1 : 0;
  }
  log(`${r.verdict}  (application ${app}, cible preview, ${inv.size} variable(s) dans l'inventaire)`);
  const parNom = new Map(r.lignes.map((l) => [l.name, l]));
  log("\nPoints importants :");
  for (const [groupe, noms] of Object.entries(POINTS_IMPORTANTS)) {
    log(`  ${groupe}`);
    for (const n of noms) {
      const l = parNom.get(n);
      if (l) log(`    ${l.statut.padEnd(11)} ${l.classe.padEnd(10)} ${n}`);
    }
  }
  if (o.all) {
    log("\nToutes les variables :");
    for (const l of r.lignes) log(`    ${l.statut.padEnd(11)} ${l.classe.padEnd(10)} ${l.name}`);
  }
  for (const e of r.erreurs) log(`  ✖ [${e.code}] ${e.message}`);
  for (const w of r.avertissements) log(`  ! [${w.code}] ${w.message}`);
  return r.verdict === "ENV_SCOPE_BLOCKED" ? 1 : 0;
}

if (estPointEntree(import.meta.url)) process.exitCode = executer(process.argv.slice(2));
