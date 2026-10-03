#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : ledger distant (fichier exporté) vs train local (Phase C), GÉNÉRIQUE.
 *
 * Usage :
 *   node scripts/preview/v9/check-ledger-v9.mjs <ledger.json|txt> [--expect pre|post|reprise]
 *        [--attendu-courant <n>] [--require-813-proof] [--json]
 * Calcule et affiche :
 *   CURRENT_LEDGER      nombre (et dernière version) du ledger fourni ;
 *   TARGET_LEDGER       nombre (et dernière version) du train local (supabase/migrations de HEAD) ;
 *   PENDING_MIGRATIONS  migrations du train absentes du ledger, dans l'ordre.
 *   --expect pre  (défaut) : préfixe exact du train, plancher 813 ORIGINALE, PENDING_MIGRATIONS ≥ 1
 *   --expect post          : ledger = train complet (PENDING_MIGRATIONS = 0)
 *   --expect reprise       : push interrompu — même contrôle que pre (gardé pour compatibilité)
 *   --attendu-courant <n>  : exige en plus CURRENT_LEDGER = n
 *   --require-813-proof    : exige la preuve de contenu de 813 (export ELSATIA_V9_LEDGER_EXPORT.sql)
 * Contrôles : noms, ordre, doublons, trous, préfixe exact, 813 originale (et refus de la
 * reconstruction 23153716), migrations étrangères, checksum si l'export en porte, référence
 * projet, ponts phase 0 (no-op si 20260921000300 est au ledger, refus sinon).
 * Sortie : 0 conforme · 1 divergence · 2 usage · 3 ledger déjà au train complet (rien à appliquer, --expect pre).
 */
import { readFileSync } from "node:fs";
import { estPointEntree, lireOptions } from "../lib/preview-guard.mjs";
import { VERDICT } from "./lib/constantes.mjs";
import { analyserLedger, ErreurLedger, lignesTrain, lireLedger, notePhase0 } from "./lib/ledger.mjs";
import { trainLocal } from "./lib/train.mjs";

export function executer(argv, { local = trainLocal(), log = console.log } = {}) {
  const fichier = argv.find((a, i) => !a.startsWith("--") && !["--expect", "--attendu-courant"].includes(argv[i - 1]));
  const o = lireOptions(argv);
  const attente = ["post", "reprise"].includes(o.expect) ? o.expect : o.expect === undefined || o.expect === "pre" ? "pre" : null;
  const attenduCourant = o["attendu-courant"] === undefined ? null : /^\d+$/.test(String(o["attendu-courant"])) ? Number(o["attendu-courant"]) : NaN;
  if (!fichier || attente === null || Number.isNaN(attenduCourant)) { log("usage : check-ledger-v9.mjs <ledger> [--expect pre|post|reprise] [--attendu-courant <n>] [--require-813-proof] [--json]"); return 2; }
  let ledger;
  try { ledger = lireLedger(readFileSync(fichier, "utf8")); } catch (e) {
    log(`${VERDICT.LEDGER_DIVERGENCE}\n  ✖ [LEDGER-LECTURE] ${e instanceof ErreurLedger ? e.message : "fichier illisible"}`);
    return 1;
  }
  const a = analyserLedger(ledger, local, { attente, attenduCourant, exigerPreuve813: Boolean(o["require-813-proof"]) });
  const dejaComplet = attente !== "post" && a.verdict === VERDICT.LEDGER_V9_COMPLET;
  if (o.json) {
    log(JSON.stringify({
      verdict: a.verdict, conforme: a.conforme, attente,
      current_ledger: a.courant, target_ledger: a.cible,
      pending_migrations: a.enAttente.map((m) => `${m.version}_${m.name}`),
      phase0: a.phase0EnAttente.map((m) => m.version),
      divergences: a.divergences, avertissements: a.avertissements,
    }, null, 2));
  } else {
    log(dejaComplet ? VERDICT.LEDGER_DEJA_V9 : a.verdict);
    log(`  ledger : format ${ledger.format}${ledger.projectRef ? `, projet ${ledger.projectRef}` : ""}`);
    for (const l of lignesTrain(a)) log(l);
    const p0 = notePhase0(a.phase0EnAttente);
    if (p0) log(`  · ${p0}`);
    for (const d of a.divergences) log(`  ✖ [${d.code}] ${d.detail}`);
    for (const w of a.avertissements) log(`  ! ${w}`);
    if (dejaComplet) log("  · ledger déjà au train complet : rien à appliquer — passer à la vérification post-cutover (--expect post)");
    if (!a.conforme && !a.divergences.length && !dejaComplet) log(`  ✖ état ${a.verdict} non admis pour --expect ${attente}`);
  }
  if (a.conforme) return 0;
  if (dejaComplet && !a.divergences.length) return 3;
  return 1;
}

if (estPointEntree(import.meta.url)) process.exitCode = executer(process.argv.slice(2));
