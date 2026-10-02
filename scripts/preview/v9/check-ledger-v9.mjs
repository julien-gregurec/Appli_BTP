#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : ledger distant (fichier exporté) vs train local V9 (Phase C).
 *
 * Usage :
 *   node scripts/preview/v9/check-ledger-v9.mjs <ledger.json|txt> [--expect pre|post]
 *        [--require-813-proof] [--json]
 *   --expect pre  (défaut) : seul le socle Preview 372 (…0813 ORIGINALE) passe → PENDING_MIGRATIONS=17
 *   --expect post          : seul le train complet 389 (…1113) passe
 *   --require-813-proof    : exige la preuve de contenu de 813 (export ELSATIA_V9_LEDGER_EXPORT.sql)
 * Contrôles : nombre, noms, ordre, doublons, trous, préfixe exact, 813 originale (et refus de la
 * reconstruction 23153716), migrations étrangères, checksum si l'export en porte, référence projet.
 * Sortie : 0 conforme · 1 divergence · 2 usage · 3 ledger déjà V9 (rien à appliquer, --expect pre).
 */
import { readFileSync } from "node:fs";
import { estPointEntree, lireOptions } from "../lib/preview-guard.mjs";
import { VERDICT } from "./lib/constantes.mjs";
import { analyserLedger, ErreurLedger, lireLedger } from "./lib/ledger.mjs";
import { trainLocal } from "./lib/train.mjs";

export function executer(argv, { local = trainLocal(), log = console.log } = {}) {
  const fichier = argv.find((a, i) => !a.startsWith("--") && !["--expect"].includes(argv[i - 1]));
  const o = lireOptions(argv);
  const attente = o.expect === "post" ? "post" : o.expect === undefined || o.expect === "pre" ? "pre" : null;
  if (!fichier || attente === null) { log("usage : check-ledger-v9.mjs <ledger> [--expect pre|post] [--require-813-proof] [--json]"); return 2; }
  let ledger;
  try { ledger = lireLedger(readFileSync(fichier, "utf8")); } catch (e) {
    log(`${VERDICT.LEDGER_DIVERGENCE}\n  ✖ [LEDGER-LECTURE] ${e instanceof ErreurLedger ? e.message : "fichier illisible"}`);
    return 1;
  }
  const a = analyserLedger(ledger, local, { attente, exigerPreuve813: Boolean(o["require-813-proof"]) });
  if (o.json) {
    log(JSON.stringify({ verdict: a.verdict, conforme: a.conforme, attente, nb_distantes: a.nbDistantes, derniere_distante: a.derniereDistante, pending: a.enAttente.map((m) => `${m.version}_${m.name}`), divergences: a.divergences, avertissements: a.avertissements }, null, 2));
  } else {
    log(attente === "pre" && a.verdict === VERDICT.LEDGER_V9_COMPLET ? VERDICT.LEDGER_DEJA_V9 : a.verdict);
    log(`  ledger : ${a.nbDistantes} migration(s), dernière ${a.derniereDistante ?? "—"} (format ${ledger.format}${ledger.projectRef ? `, projet ${ledger.projectRef}` : ""})`);
    if (a.verdict === VERDICT.LEDGER_PREFIXE_OK || a.verdict === VERDICT.LEDGER_V9_PARTIEL) log(`PENDING_MIGRATIONS=${a.enAttente.length}`);
    if (a.verdict === VERDICT.LEDGER_V9_COMPLET) log("PENDING_MIGRATIONS=0");
    for (const d of a.divergences) log(`  ✖ [${d.code}] ${d.detail}`);
    for (const w of a.avertissements) log(`  ! ${w}`);
    if (attente === "pre" && a.verdict === VERDICT.LEDGER_V9_COMPLET) log("  · ledger déjà au train V9 (389) : rien à appliquer — passer à la vérification post-cutover (--expect post)");
    if (!a.conforme && !a.divergences.length && a.verdict !== VERDICT.LEDGER_V9_COMPLET) log(`  ✖ état ${a.verdict} non admis pour --expect ${attente}`);
  }
  if (a.conforme) return 0;
  if (attente === "pre" && a.verdict === VERDICT.LEDGER_V9_COMPLET) return 3;
  return 1;
}

if (estPointEntree(import.meta.url)) process.exitCode = executer(process.argv.slice(2));
