#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : plan de migration lisible (Phase D) et contrôle du dry-run, GÉNÉRIQUE.
 *
 * Usage :
 *   node scripts/preview/v9/migration-plan-v9.mjs <ledger> [--json] [--require-813-proof] [--attendu-courant <n>]
 *        → CURRENT_LEDGER → PENDING_MIGRATIONS dans l'ordre exact → TARGET_LEDGER (calculés depuis le
 *          ledger fourni et le train local), avec les preuves (toutes postérieures au ledger, pas de
 *          --include-all, historique intact, plancher 813, phase 0 no-op).
 *   node scripts/preview/v9/migration-plan-v9.mjs <ledger> --dry-run <sortie de db push --dry-run>
 *        → vérifie que le dry-run annonce EXACTEMENT les PENDING_MIGRATIONS, dans cet ordre, sans
 *          suggestion --include-all ni `migration repair`.
 *   node scripts/preview/v9/migration-plan-v9.mjs --write-doc
 *        → régénère docs/qualification/preview-pack/V9_MIGRATION_PLAN.generated.md : plan depuis le
 *          socle V8 ET depuis V9.1, avec classe de réversibilité, note et marqueur phase 0
 *          (--check : 1 si le document dérive).
 *   --resume : reprise d'un push interrompu (même contrôle que le plan normal, gardé pour compatibilité).
 * Échoue (1) si le ledger n'est pas un préfixe exact du train avec au moins une migration en attente. Usage : 2.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { estPointEntree, lireOptions } from "../lib/preview-guard.mjs";
import { classerMigrations } from "./classify-migrations-v9.mjs";
import { VERSION_SOCLE, VERSION_V9_1 } from "./lib/constantes.mjs";
import { analyserDryRun, ErreurLedger, lireLedger, planMarkdown, planMigration } from "./lib/ledger.mjs";
import { ROOT, trainLocal } from "./lib/train.mjs";

export const DOC_PLAN = resolve(ROOT, "docs/qualification/preview-pack/V9_MIGRATION_PLAN.generated.md");
const FIX = resolve(import.meta.dirname, "fixtures");
export const DEPARTS_DOC = Object.freeze([
  { titre: `Depuis le socle V8 (plancher Preview ${VERSION_SOCLE}, 813 ORIGINALE)`, fixture: "ledger-socle-v8-ok.json" },
  { titre: `Depuis la base publiée V9.1 (dernière ${VERSION_V9_1})`, fixture: "ledger-v9-1-ok.json" },
]);

export function documentPlan(local = trainLocal()) {
  const sections = [];
  for (const { titre, fixture } of DEPARTS_DOC) {
    const plan = planMigration(lireLedger(readFileSync(resolve(FIX, fixture), "utf8")), local, { exigerPreuve813: true });
    const classes = new Map(classerMigrations(plan.aAppliquer).map((c) => [c.version, c]));
    const k = {};
    for (const c of classes.values()) k[c.classe] = (k[c.classe] ?? 0) + 1;
    sections.push(
      `## ${titre}`,
      "",
      `Fixture : \`scripts/preview/v9/fixtures/${fixture}\`. Réversibilité déterminée depuis le SQL (\`classify-migrations-v9.mjs\`) : ${Object.entries(k).map(([a, b]) => `${a}=${b}`).join(", ")}.`,
      "",
      planMarkdown(plan, classes),
      "",
    );
  }
  return [
    "# ELSATIA V9 — Plan de migration Preview (généré)",
    "",
    "> Généré par `node scripts/preview/v9/migration-plan-v9.mjs --write-doc` depuis le train local et les",
    "> fixtures de ledger (`scripts/preview/v9/fixtures/`). Ne pas éditer à la main. Aucun nombre n'est",
    "> maintenu à la main : CURRENT_LEDGER, TARGET_LEDGER et PENDING_MIGRATIONS sont calculés.",
    "> Le plan RÉEL est recalculé par `v9-cutover.sh` depuis le ledger exporté de la Preview.",
    "",
    ...sections,
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
  const fichier = argv.find((a, i) => !a.startsWith("--") && !["--dry-run", "--attendu-courant"].includes(argv[i - 1]));
  if (!fichier) { log("usage : migration-plan-v9.mjs <ledger> [--json] [--dry-run <fichier>] [--require-813-proof] [--attendu-courant <n>]"); return 2; }
  let plan;
  try {
    plan = planMigration(lireLedger(readFileSync(fichier, "utf8")), local, {
      exigerPreuve813: Boolean(o["require-813-proof"]),
      reprise: Boolean(o.resume),
      attenduCourant: typeof o["attendu-courant"] === "string" ? o["attendu-courant"] : null,
    });
  } catch (e) {
    if (!(e instanceof ErreurLedger) && e.code !== "ENOENT") throw e;
    log(`PLAN_REFUSED\n  ✖ ${e instanceof ErreurLedger ? e.message : "ledger introuvable"}`);
    return 1;
  }
  if (typeof o["dry-run"] === "string") {
    let texte;
    try { texte = readFileSync(o["dry-run"], "utf8"); } catch { log("DRY_RUN_REJECTED\n  ✖ sortie du dry-run introuvable"); return 1; }
    const d = analyserDryRun(texte, plan);
    log(d.ok ? `DRY_RUN_MATCHES_PLAN\n  ${d.annoncees.length} migration(s) annoncée(s) = PENDING_MIGRATIONS=${plan.aAppliquer.length}, dans l'ordre` : `DRY_RUN_REJECTED (PENDING_MIGRATIONS=${plan.aAppliquer.length})`);
    for (const m of d.motifs) log(`  ✖ ${m}`);
    return d.ok ? 0 : 1;
  }
  if (o.json) log(JSON.stringify(plan, null, 2));
  else log(`MIGRATION_PLAN_OK\n${planMarkdown(plan)}`);
  return 0;
}

if (estPointEntree(import.meta.url)) process.exitCode = executer(process.argv.slice(2));
