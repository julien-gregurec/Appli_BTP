#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : petites étapes appelées par v9-cutover.sh (aucun réseau).
 *
 *   cutover-step.mjs report-set <rapport.json> <clé.pointée> <valeur JSON>
 *   cutover-step.mjs ledger-tag <ref> <ledger-brut.json> <ledger.json>   ajoute project_ref (ref déjà validée par la garde)
 *   cutover-step.mjs v9-checks <sortie psql>                             0 si les 11 contrôles V9 sont verts
 *   cutover-step.mjs train-check                                         0 si le train local = attendus V9 (389, …1113, 813 originale)
 *   cutover-step.mjs git-check                                           0 si SHA / branche / worktree conformes
 */
import { readFileSync, writeFileSync } from "node:fs";
import { estPointEntree } from "../lib/preview-guard.mjs";
import { REF_PREVIEW_AUTORISEE } from "./lib/constantes.mjs";
import { collecterEtatGit, evaluerGit } from "./lib/git.mjs";
import { lireLedger } from "./lib/ledger.mjs";
import { majRapport } from "./lib/rapport.mjs";
import { ROOT, trainLocal, verifierTrainLocal } from "./lib/train.mjs";
import { evaluerControlesV9 } from "./post-cutover-check.mjs";

export function executer([cmd, ...a], { log = console.log } = {}) {
  switch (cmd) {
    case "report-set": {
      const [fichier, cle, valeur] = a;
      if (!fichier || !cle || valeur === undefined) return 2;
      majRapport(fichier, cle, JSON.parse(valeur));
      return 0;
    }
    case "ledger-tag": {
      const [ref, entree, sortie] = a;
      if (ref !== REF_PREVIEW_AUTORISEE) { log("REFUS : ledger-tag n'accepte que la référence Preview"); return 2; }
      const brut = readFileSync(entree, "utf8").trim();
      lireLedger(brut); // valide le format avant d'écrire
      const j = JSON.parse(brut);
      writeFileSync(sortie, `${JSON.stringify({ ...j, project_ref: ref })}\n`);
      return 0;
    }
    case "v9-checks": {
      const v = evaluerControlesV9(readFileSync(a[0], "utf8"));
      for (const l of v.lignes) log(`  ${l.ok ? "✓" : "✖"} ${l.controle}${l.ok ? "" : ` — attendu ${l.attendu}, observé ${l.observe}`}`);
      log(v.ok ? "V9_CHECKS_GO" : `V9_CHECKS_NO_GO (${v.lignes.length} ligne(s) lue(s), 11 attendues)`);
      return v.ok ? 0 : 1;
    }
    case "train-check": {
      const r = verifierTrainLocal(trainLocal());
      for (const c of r.constats) log(`  ${c.ok ? "✓" : "✖"} [${c.code}] ${c.message}`);
      return r.ok ? 0 : 1;
    }
    case "git-check": {
      const r = evaluerGit(collecterEtatGit(ROOT));
      for (const c of r.constats) log(`  ${c.ok ? "✓" : "✖"} [${c.code}] ${c.message}`);
      return r.ok ? 0 : 1;
    }
    default:
      log("usage : cutover-step.mjs report-set|ledger-tag|v9-checks|train-check|git-check …");
      return 2;
  }
}

if (estPointEntree(import.meta.url)) process.exitCode = executer(process.argv.slice(2));
