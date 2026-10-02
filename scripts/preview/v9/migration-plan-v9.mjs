#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : plan de migration lisible (Phase D) et contrôle du dry-run.
 *
 * Usage :
 *   node scripts/preview/v9/migration-plan-v9.mjs <ledger> [--json] [--require-813-proof]
 *        → Preview actuelle → les 17 migrations dans l'ordre exact → état final 389 / …1113,
 *          avec les preuves (aucune ≤ 813, pas de --include-all, historique intact).
 *   node scripts/preview/v9/migration-plan-v9.mjs <ledger> --dry-run <sortie de db push --dry-run>
 *        → vérifie que le dry-run annonce EXACTEMENT ces 17 migrations, dans cet ordre, sans
 *          suggestion --include-all ni `migration repair`.
 *   node scripts/preview/v9/migration-plan-v9.mjs --write-doc
 *        → régénère docs/qualification/preview-pack/V9_MIGRATION_PLAN.generated.md depuis la
 *          fixture du socle 372 (--check : 1 si le document dérive).
 * Échoue (1) si le ledger n'est pas exactement le socle 372 (préfixe exact). Usage : 2.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { estPointEntree, lireOptions } from "../lib/preview-guard.mjs";
import { classerTrain } from "./lib/classement.mjs";
import { analyserDryRun, ErreurLedger, lireLedger, planMarkdown, planMigration } from "./lib/ledger.mjs";
import { ROOT, trainLocal } from "./lib/train.mjs";

export const DOC_PLAN = resolve(ROOT, "docs/qualification/preview-pack/V9_MIGRATION_PLAN.generated.md");
const FIXTURE_SOCLE = resolve(import.meta.dirname, "fixtures/ledger-372-ok.json");

export function documentPlan(local = trainLocal()) {
  const plan = planMigration(lireLedger(readFileSync(FIXTURE_SOCLE, "utf8")), local, { exigerPreuve813: true });
  const classes = new Map(classerTrain(plan.aAppliquer.map((m) => ({ version: m.version, name: m.name, sql: readFileSync(resolve(ROOT, "supabase/migrations", m.fichier), "utf8") }))).map((c) => [c.version, c]));
  return [
    "# ELSATIA V9 — Plan de migration Preview 372 → 389 (généré)",
    "",
    "> Généré par `node scripts/preview/v9/migration-plan-v9.mjs --write-doc` depuis le train local et la",
    "> fixture du socle Preview (`scripts/preview/v9/fixtures/ledger-372-ok.json`). Ne pas éditer à la main.",
    "> Le plan RÉEL est recalculé par `v9-cutover.sh` depuis le ledger exporté de la Preview.",
    "",
    planMarkdown(plan),
    "",
    "## Réversibilité (déterminée depuis le SQL, `classify-migrations-v9.mjs`)",
    "",
    "| Rang | Version | Classe | Note |",
    "|---|---|---|---|",
    ...plan.aAppliquer.map((m) => `| ${m.rang} | \`${m.version}\` | ${classes.get(m.version).classe} | ${classes.get(m.version).note} |`),
    "",
  ].join("\n");
}

export function executer(argv, { local = trainLocal(), log = console.log } = {}) {
  const o = lireOptions(argv);
  if (o["write-doc"] || o.check) {
    const doc = documentPlan(local);
    let actuel = null;
    try { actuel = readFileSync(DOC_PLAN, "utf8"); } catch { /* absent */ }
    if (o.check) { log(actuel === doc ? "plan généré à jour" : "DÉRIVE : relancer migration-plan-v9.mjs --write-doc"); return actuel === doc ? 0 : 1; }
    if (actuel !== doc) writeFileSync(DOC_PLAN, doc);
    log(actuel === doc ? "déjà à jour" : `écrit : ${DOC_PLAN}`);
    return 0;
  }
  const fichier = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--dry-run");
  if (!fichier) { log("usage : migration-plan-v9.mjs <ledger> [--json] [--dry-run <fichier>] [--require-813-proof]"); return 2; }
  let plan;
  try {
    plan = planMigration(lireLedger(readFileSync(fichier, "utf8")), local, { exigerPreuve813: Boolean(o["require-813-proof"]) });
  } catch (e) {
    if (!(e instanceof ErreurLedger) && e.code !== "ENOENT") throw e;
    log(`PLAN_REFUSED\n  ✖ ${e instanceof ErreurLedger ? e.message : "ledger introuvable"}`);
    return 1;
  }
  if (typeof o["dry-run"] === "string") {
    let texte;
    try { texte = readFileSync(o["dry-run"], "utf8"); } catch { log("DRY_RUN_REJECTED\n  ✖ sortie du dry-run introuvable"); return 1; }
    const d = analyserDryRun(texte, plan);
    log(d.ok ? `DRY_RUN_MATCHES_PLAN\n  ${d.annoncees.length} migration(s) annoncée(s), identiques au plan, dans l'ordre` : "DRY_RUN_REJECTED");
    for (const m of d.motifs) log(`  ✖ ${m}`);
    return d.ok ? 0 : 1;
  }
  if (o.json) log(JSON.stringify(plan, null, 2));
  else log(`MIGRATION_PLAN_OK\n${planMarkdown(plan)}`);
  return 0;
}

if (estPointEntree(import.meta.url)) process.exitCode = executer(process.argv.slice(2));
