#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : préflight en UNE commande (Phase M), hors ligne.
 *
 *   npm run preview:v9:preflight [-- --ledger <export>] [--env-inventory <export Vercel>]
 *        [--backup-manifest <manifeste>] [--bank-keys-status <json>] [--json]
 *
 * Pack GÉNÉRIQUE : CURRENT_LEDGER (ledger fourni), TARGET_LEDGER (train local de HEAD) et
 * PENDING_MIGRATIONS (train − ledger) sont calculés, jamais codés.
 * Agrège tout ce qui se vérifie SANS réseau : base V9.1 / branche / worktree, train local, migrations
 * (verify:migrations), attendus du train, fixtures et auto-tests du ledger, plan de migration,
 * manifeste d'environnement, scan de secrets, configuration de build, garde Production,
 * préparation du rollback (runbooks + classement). Les entrées facultatives (exports réels) sont
 * contrôlées si fournies ; sinon elles sont listées « à faire avec accès ».
 *
 * Verdict :
 *   PREVIEW_V9_OPERATOR_PACK_READY    tout contrôle hors ligne vert, chaque contrôle distant outillé
 *   PREVIEW_V9_OPERATOR_PACK_PARTIAL  hors ligne vert, mais une entrée réelle fournie est non conforme
 *   PREVIEW_V9_OPERATOR_PACK_BLOCKED  au moins un contrôle hors ligne en échec
 * Sortie : 0 READY · 1 PARTIAL · 2 BLOCKED.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { estPointEntree, lireOptions } from "../lib/preview-guard.mjs";
import { loadJson, MANIFEST_PATH } from "../../lib/env-manifest-core.mjs";
import { synchroniser } from "../train-expectations.mjs";
import { classementV9 } from "./classify-migrations-v9.mjs";
import { evaluerCible } from "./lib/cible.mjs";
import { REF_PREVIEW_AUTORISEE, REF_PRODUCTION_CONNUE, VERDICT, VERSION_SOCLE, VERSION_V9_1 } from "./lib/constantes.mjs";
import { lireInventaire, comparerInventaire } from "./lib/env-scope.mjs";
import { collecterEtatGit, evaluerGit } from "./lib/git.mjs";
import { evaluerIban } from "./lib/iban.mjs";
import { analyserDryRun, analyserLedger, lignesTrain, lireLedger, planMigration } from "./lib/ledger.mjs";
import { verifierSauvegarde } from "./lib/sauvegarde.mjs";
import { cibleTrain, rangDe, ROOT, trainLocal, verifierTrainLocal } from "./lib/train.mjs";
import { fixtures, orphelines } from "./fixtures/generate-fixtures.mjs";
import { documentPlan, DOC_PLAN } from "./migration-plan-v9.mjs";

const FIX = resolve(import.meta.dirname, "fixtures");
const lire = (p) => readFileSync(p, "utf8");

export const DOCS_PACK = Object.freeze({
  backup: "docs/runbooks/ELSATIA_V9_PREVIEW_BACKUP_AND_RESTORE.md",
  deploy: "docs/runbooks/ELSATIA_V9_GP_PREVIEW_DEPLOY.md",
  rollback: "docs/runbooks/ELSATIA_V9_PREVIEW_ROLLBACK.md",
  checklist: "docs/runbooks/ELSATIA_V9_PREVIEW_OPERATOR_CHECKLIST.md",
  rapport: "docs/qualification/ELSATIA_V9_PREVIEW_OPERATOR_PACK_V1.md",
  exportSql: "docs/runbooks/sql/ELSATIA_V9_LEDGER_EXPORT.sql",
  checksSql: "docs/runbooks/sql/ELSATIA_V9_POST_CUTOVER_CHECKS.sql",
});

function node(args) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8" });
  return { code: r.status, sortie: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

export function controlesHorsLigne({ git = collecterEtatGit(ROOT), local = trainLocal() } = {}) {
  const res = [];
  const c = (groupe, ok, code, message) => res.push({ groupe, ok, code, message });

  // Git
  for (const x of evaluerGit(git).constats) c("git", x.ok, x.code, x.message);
  // Train local
  for (const x of verifierTrainLocal(local).constats) c("migrations", x.ok, x.code, x.message);
  const vm = node(["scripts/verify-migrations.mjs"]);
  c("migrations", vm.code === 0, "VERIFY-MIGRATIONS", vm.code === 0 ? "verify-migrations.mjs : OK" : "verify-migrations.mjs en échec");
  const vt = node(["scripts/verify-migration-targets.mjs"]);
  c("migrations", vt.code === 0, "VERIFY-MIGRATION-TARGETS", vt.code === 0 ? "verify-migration-targets.mjs : OK" : "verify-migration-targets.mjs en échec");
  const te = synchroniser({ ecrire: false });
  const cible = cibleTrain(local);
  c("migrations", te.changes.length === 0 && te.attendus.nb === cible.nb && te.attendus.derniere === cible.derniere, "TRAIN-EXPECTATIONS", te.changes.length ? `attendus dérivés : ${te.changes.join(", ")}` : `attendus générés = train local : ${te.attendus.nb} / ${te.attendus.derniere} (DB verify ${te.attendus.controles} contrôles, SQL post-cutover synchronisé)`);

  // Ledger : fixtures à jour (aucune orpheline) + auto-tests (positifs et négatifs)
  const attendues = fixtures(local);
  const derives = Object.entries(attendues).filter(([n, contenu]) => !existsSync(resolve(FIX, n)) || lire(resolve(FIX, n)) !== contenu).map(([n]) => n);
  const orph = orphelines(attendues, FIX);
  c("ledger", derives.length === 0 && orph.length === 0, "FIXTURES", derives.length || orph.length ? `fixtures dérivées ou orphelines : ${[...derives, ...orph].join(", ")} (relancer generate-fixtures.mjs)` : `${Object.keys(attendues).length} fixtures à jour, générées depuis le train local`);
  const an = (f, o = {}) => analyserLedger(lireLedger(lire(resolve(FIX, f))), local, o);
  for (const [code, f, version] of [["LEDGER-SOCLE-V8", "ledger-socle-v8-ok.json", VERSION_SOCLE], ["LEDGER-V9-1", "ledger-v9-1-ok.json", VERSION_V9_1]]) {
    const a = an(f, { exigerPreuve813: true });
    const attendu = cible.nb - rangDe(local, version);
    c("ledger", a.conforme && a.verdict === VERDICT.LEDGER_PREFIXE_OK && a.enAttente.length === attendu && attendu >= 1, code, `${a.verdict} ; ${lignesTrain(a).join(" ; ")}`);
  }
  const negatifs = ["ledger-813-non-originale.json", "ledger-etrangere.json", "ledger-ordre-incorrect.json", "ledger-version-manquante.json", "ledger-ref-production.json", "ledger-sans-300-production.json"];
  const fuites = negatifs.filter((f) => an(f).verdict !== VERDICT.LEDGER_DIVERGENCE);
  c("ledger", fuites.length === 0, "LEDGER-NEGATIFS", fuites.length ? `divergence NON détectée : ${fuites.join(", ")}` : `${negatifs.length} ledgers divergents tous refusés (813 non originale, étrangère, ordre, trou, Production, sans 300)`);
  const p0 = an("ledger-sans-300-production.json");
  c("ledger", p0.divergences.some((d) => d.code === "LEDGER-PHASE0-PRODUCTION"), "LEDGER-PHASE0", "ledger sans 20260921000300 : phase 0 refusée (historique de type Production, hors pack Preview)");
  const complet = an("ledger-complet.json", { attente: "post", exigerPreuve813: true });
  c("ledger", complet.verdict === VERDICT.LEDGER_V9_COMPLET && complet.conforme && !an("ledger-complet.json").conforme, "LEDGER-COMPLET", `ledger = train complet reconnu (${complet.courant.nb}/${cible.nb}, PENDING_MIGRATIONS=0) ; refusé en --expect pre`);

  // Plan (depuis le socle V8 et depuis V9.1)
  let plan = null;
  try { plan = planMigration(lireLedger(lire(resolve(FIX, "ledger-socle-v8-ok.json"))), local, { exigerPreuve813: true }); } catch { /* signalé ci-dessous */ }
  c("plan", Boolean(plan), "PLAN", plan ? `depuis le socle V8 : ${lignesTrain(plan).join(" ; ")} ; ${plan.preuves.length} preuves vertes${plan.phase0.length ? ` ; phase 0 no-op (${plan.phase0.join(", ")})` : ""}` : "plan impossible depuis le socle V8");
  let planV91 = null;
  try { planV91 = planMigration(lireLedger(lire(resolve(FIX, "ledger-v9-1-ok.json"))), local, { exigerPreuve813: true }); } catch { /* ci-dessous */ }
  c("plan", Boolean(planV91), "PLAN-V9-1", planV91 ? `depuis V9.1 : ${lignesTrain(planV91).join(" ; ")}` : "plan impossible depuis V9.1");
  if (plan) {
    const dry = ["dry-run-exact.txt", "dry-run-une-de-moins.txt", "dry-run-une-de-plus.txt", "dry-run-include-all.txt"].map((f) => [f, analyserDryRun(lire(resolve(FIX, f)), plan).ok]);
    c("plan", dry[0][1] && dry.slice(1).every(([, ok]) => !ok), "PLAN-DRY-RUN", `dry-run : exactement les ${plan.aAppliquer.length} PENDING accepté ; une de moins, une de plus et --include-all refusés`);
  }
  let doc = null;
  try { doc = documentPlan(local); } catch { /* ci-dessous */ }
  c("plan", existsSync(DOC_PLAN) && doc === lire(DOC_PLAN), "PLAN-DOC", "docs/qualification/preview-pack/V9_MIGRATION_PLAN.generated.md à jour (socle V8 et V9.1)");

  // Environnement et secrets (dépôt)
  const em = node(["scripts/check-env-manifest.mjs"]);
  c("env", em.code === 0, "VERIFY-ENV-MANIFEST", em.code === 0 ? "check-env-manifest.mjs : OK" : "check-env-manifest.mjs en échec");
  const vs = node(["scripts/verify-secrets.mjs"]);
  c("secrets", vs.code === 0, "VERIFY-SECRETS", vs.code === 0 ? "verify-secrets.mjs : aucun secret détecté" : "verify-secrets.mjs : secret détecté");

  // Build
  const pkg = JSON.parse(lire(resolve(ROOT, "package.json")));
  const vercel = JSON.parse(lire(resolve(ROOT, "vercel.json")));
  c("build", Boolean(pkg.scripts["build:gestion-pro"]) && /check-env-manifest\.mjs --auto --app gestion_pro/.test(pkg.scripts["prebuild:gestion-pro"] ?? ""), "BUILD-GP", "build:gestion-pro + préflight du manifeste avant build (commande Vercel GP)");
  c("build", Array.isArray(vercel.crons) && vercel.crons.every((x) => x.path.startsWith("/api/cron/")), "BUILD-VERCEL", `vercel.json : ${vercel.crons?.length ?? 0} cron(s) (jamais exécutés sur un déploiement Preview)`);

  // Garde Production (auto-test) et absence de --include-all
  const prod = evaluerCible({ ref: REF_PRODUCTION_CONNUE, env: {} });
  const prev = evaluerCible({ ref: REF_PREVIEW_AUTORISEE, env: {} });
  c("garde", !prod.ok && prev.ok && prod.motifs.some((m) => m.includes("PRODUCTION")), "GUARD-PRODUCTION", "Production refusée, Preview confirmée (auto-test)");
  const cutover = lire(resolve(import.meta.dirname, "v9-cutover.sh"));
  const pushs = cutover.split("\n").filter((l) => /db push/.test(l) && !/^\s*#/.test(l));
  c("garde", pushs.length > 0 && pushs.every((l) => !/include-all/.test(l) || /REFUS|refus/.test(l)), "GUARD-INCLUDE-ALL", "v9-cutover.sh n'appelle jamais db push avec --include-all");
  c("garde", /APPLY=0/.test(cutover) && /--confirm-ref/.test(cutover), "GUARD-DRY-RUN-DEFAUT", "v9-cutover.sh en DRY-RUN par défaut ; --apply-preview exige --confirm-ref");

  // Rollback
  const manquants = Object.entries(DOCS_PACK).filter(([, p]) => !existsSync(resolve(ROOT, p))).map(([, p]) => p);
  c("rollback", manquants.length === 0, "DOCS", manquants.length ? `documents manquants : ${manquants.join(", ")}` : `${Object.keys(DOCS_PACK).length} documents du pack présents`);
  if (existsSync(resolve(ROOT, DOCS_PACK.rollback))) {
    const rb = lire(resolve(ROOT, DOCS_PACK.rollback));
    c("rollback", ["Cas A", "Cas B", "Cas C"].every((x) => rb.includes(x)), "ROLLBACK-CAS", "runbook de rollback : cas A, B et C");
    c("rollback", rb.includes("V9_MIGRATION_PLAN.generated.md"), "ROLLBACK-RENVOI", "runbook de rollback : renvoie au plan généré (classement par migration)");
  }
  // Classement : chaque migration en attente depuis le socle V8 a sa classe dans le plan généré.
  const docPlan = existsSync(DOC_PLAN) ? lire(DOC_PLAN) : "";
  const classes = classementV9({ local });
  const absentes = classes.filter((m) => !new RegExp(`\\| \`${m.version}\` \\|[^\\n]*\\| ${m.classe} \\|`).test(docPlan)).map((m) => m.version);
  c("rollback", classes.length > 0 && absentes.length === 0, "ROLLBACK-CLASSEMENT", absentes.length ? `classement absent du plan généré ou ≠ SQL pour : ${absentes.join(", ")}` : `les ${classes.length} migrations en attente depuis le socle V8 classées dans le plan généré (${classes.filter((m) => m.classe === "RESTORE_REQUIRED").length} RESTORE_REQUIRED)`);
  return res;
}

export function controlesEntrees({ ledger, envInventory, backupManifest, bankKeysStatus }, local = trainLocal()) {
  const res = [];
  const c = (groupe, ok, code, message) => res.push({ groupe, ok, code, message });
  const manifest = loadJson(ROOT, MANIFEST_PATH);
  if (ledger) {
    try {
      const a = analyserLedger(lireLedger(lire(ledger)), local, { exigerPreuve813: true });
      c("entrées", a.conforme, "INPUT-LEDGER", `${a.verdict} ; ${lignesTrain(a).join(" ; ")}${a.conforme ? "" : ` : ${a.divergences.map((d) => d.code).join(", ") || "rien à appliquer"}`}`);
    } catch { c("entrées", false, "INPUT-LEDGER", "ledger illisible"); }
  }
  let inv = null;
  if (envInventory) {
    try {
      inv = lireInventaire(lire(envInventory), manifest);
      const r = comparerInventaire(manifest, inv);
      c("entrées", r.verdict !== "ENV_SCOPE_BLOCKED", "INPUT-ENV", `${r.verdict} (${r.erreurs.length} erreur(s), ${r.avertissements.length} avertissement(s))`);
    } catch { c("entrées", false, "INPUT-ENV", "inventaire illisible"); }
  }
  if (inv) {
    let statut = null;
    try { if (bankKeysStatus) statut = JSON.parse(lire(bankKeysStatus).trim().split("\n").filter((l) => l.startsWith("{")).at(-1)); } catch { /* ci-dessous */ }
    const r = evaluerIban(inv, statut);
    c("entrées", r.verdict === VERDICT.IBAN_OK, "INPUT-IBAN", `${r.verdict}${r.blocker ? ` / ${r.blocker}` : ""} (attestation ${r.attestation})`);
  }
  if (backupManifest) {
    try {
      const r = verifierSauvegarde(JSON.parse(lire(backupManifest)), { racineDepot: ROOT, local, baseManifeste: resolve(backupManifest, "..") });
      c("entrées", r.ok, "INPUT-BACKUP", r.verdict);
    } catch { c("entrées", false, "INPUT-BACKUP", "manifeste illisible"); }
  }
  return res;
}

export const A_FAIRE_AVEC_ACCES = Object.freeze([
  "export du ledger réel (ELSATIA_V9_LEDGER_EXPORT.sql) — accès base Preview",
  "`supabase db push --dry-run` réel — CLI liée à pgvvpqyjziyapbbkydmc + mot de passe base",
  "sauvegarde réelle (dumps schéma / données / Auth / ledger) — accès base Preview",
  "inventaire Vercel réel du projet elsatia-preview — accès Vercel",
  "attestation k1 (`bank-keys status` / `register`) — environnement Preview (clé jamais affichée)",
  "application (--apply-preview), DB verify, contrôles V9, déploiement code, recette HTTP et pilote",
]);

export function verdictPack(horsLigne, entrees) {
  if (horsLigne.some((x) => !x.ok)) return VERDICT.PACK_BLOCKED;
  if (entrees.some((x) => !x.ok)) return VERDICT.PACK_PARTIAL;
  return VERDICT.PACK_READY;
}

if (estPointEntree(import.meta.url)) {
  const o = lireOptions(process.argv.slice(2));
  const s = (k) => (typeof o[k] === "string" ? o[k] : undefined);
  const horsLigne = controlesHorsLigne();
  const entrees = controlesEntrees({ ledger: s("ledger"), envInventory: s("env-inventory"), backupManifest: s("backup-manifest"), bankKeysStatus: s("bank-keys-status") });
  const verdict = verdictPack(horsLigne, entrees);
  if (o.json) console.log(JSON.stringify({ verdict, horsLigne, entrees, aFaireAvecAcces: A_FAIRE_AVEC_ACCES }, null, 2));
  else {
    console.log("ELSATIA V9 — préflight du pack opérateur (hors ligne)\n");
    let groupe = "";
    for (const x of [...horsLigne, ...entrees]) {
      if (x.groupe !== groupe) { groupe = x.groupe; console.log(`${groupe}`); }
      console.log(`  ${x.ok ? "✓" : "✖"} [${x.code}] ${x.message}`);
    }
    console.log("\nÀ faire avec accès (non vérifiable hors ligne, outillé par le pack) :");
    for (const a of A_FAIRE_AVEC_ACCES) console.log(`  · ${a}`);
    console.log(`\n${verdict}`);
  }
  process.exitCode = verdict === VERDICT.PACK_READY ? 0 : verdict === VERDICT.PACK_PARTIAL ? 1 : 2;
}
