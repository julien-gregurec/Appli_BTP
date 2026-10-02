#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : vérifie la sauvegarde DÉCLARÉE avant migration (étape 8 du cutover).
 *
 * Usage :
 *   node scripts/preview/v9/backup-check.mjs <manifeste-sauvegarde.json> [--max-age-hours 12]
 * Le manifeste (HORS dépôt) décrit les fichiers produits selon
 * docs/runbooks/ELSATIA_V9_PREVIEW_BACKUP_AND_RESTORE.md ; gabarit :
 * scripts/preview/v9/fixtures/backup-manifest.example.json.
 * Sortie : « BACKUP_DECLARED_OK » (0) · « BACKUP_MISSING » (1) · usage (2).
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { estPointEntree, lireOptions } from "../lib/preview-guard.mjs";
import { verifierSauvegarde } from "./lib/sauvegarde.mjs";
import { ROOT, trainLocal } from "./lib/train.mjs";

export function executer(argv, { log = console.log, maintenant = new Date(), racineDepot = ROOT } = {}) {
  const o = lireOptions(argv);
  const fichier = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--max-age-hours");
  if (!fichier) { log("usage : backup-check.mjs <manifeste.json> [--max-age-hours 12]"); return 2; }
  let manifeste;
  try { manifeste = JSON.parse(readFileSync(fichier, "utf8")); } catch { log("BACKUP_MISSING\n  ✖ manifeste de sauvegarde absent ou illisible"); return 1; }
  const r = verifierSauvegarde(manifeste, {
    racineDepot, local: trainLocal(), maintenant,
    ageMaxHeures: o["max-age-hours"] ? Number(o["max-age-hours"]) : 12,
    baseManifeste: dirname(resolve(fichier)),
  });
  log(r.verdict);
  for (const c of r.constats) log(`  ${c.ok ? "✓" : c.niveau === "REQUIRED" ? "✖" : "!"} [${c.code}] (${c.niveau}) ${c.message}`);
  return r.ok ? 0 : 1;
}

if (estPointEntree(import.meta.url)) process.exitCode = executer(process.argv.slice(2));
