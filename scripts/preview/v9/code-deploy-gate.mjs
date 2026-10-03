#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : porte d'ordre BASE → CODE (Phase G).
 *
 * Usage :
 *   node scripts/preview/v9/code-deploy-gate.mjs --report <dossier>/cutover-report.json [--ledger <export post-cutover>]
 * Affiche `CODE_DEPLOY_ALLOWED=false` tant que le ledger n'est pas confirmé égal au train complet
 * (PENDING_MIGRATIONS=0), que DB verify + contrôles V9 ne sont pas verts, ou que le rapport ne
 * porte pas le SHA de HEAD (code à déployer) ; `CODE_DEPLOY_ALLOWED=true` sinon.
 * Sortie : 0 autorisé · 1 refusé · 2 usage. À exécuter IMMÉDIATEMENT avant tout déploiement
 * Vercel du code V9 (runbook ELSATIA_V9_GP_PREVIEW_DEPLOY.md, étape 5).
 */
import { readFileSync } from "node:fs";
import { estPointEntree, lireOptions } from "../lib/preview-guard.mjs";
import { collecterEtatGit } from "./lib/git.mjs";
import { analyserLedger, lireLedger } from "./lib/ledger.mjs";
import { evaluerPorte, lireRapport } from "./lib/rapport.mjs";
import { ROOT, trainLocal } from "./lib/train.mjs";

export function executer(argv, { log = console.log, maintenant = new Date(), shaHead = collecterEtatGit(ROOT).head, local = trainLocal() } = {}) {
  const o = lireOptions(argv);
  if (typeof o.report !== "string") { log("CODE_DEPLOY_ALLOWED=false\n  ✖ --report <cutover-report.json> obligatoire"); return 2; }
  let ledgerPost = null;
  if (typeof o.ledger === "string") {
    try { ledgerPost = analyserLedger(lireLedger(readFileSync(o.ledger, "utf8")), local, { attente: "post", exigerPreuve813: true }); } catch { ledgerPost = { verdict: "ILLISIBLE" }; }
  }
  const r = evaluerPorte(lireRapport(o.report), { maintenant, ledgerPost, shaHead });
  log(`CODE_DEPLOY_ALLOWED=${r.autorise}`);
  for (const m of r.motifs) log(`  ✖ ${m}`);
  if (r.autorise) log(`  ✓ ledger = train complet, DB verify et contrôles V9 verts : le code de HEAD (${shaHead.slice(0, 12)}) peut être déployé en Preview`);
  return r.autorise ? 0 : 1;
}

if (estPointEntree(import.meta.url)) process.exitCode = executer(process.argv.slice(2));
