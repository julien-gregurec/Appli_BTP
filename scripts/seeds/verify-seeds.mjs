#!/usr/bin/env node
// Harnais de compatibilité des seeds — `npm run verify:seeds`.
//
// Pour chaque script du registre (scripts/seeds/registry.mjs) qui porte une spécification
// `harness`, sur une base FRAÎCHE reconstruite depuis tout le train de migrations :
//   1. base de référence : scripts/local-postgres-bootstrap/rebuild_db.sh (amorce Supabase
//      minimale + toutes les migrations), search_path hébergé (« $user », public, extensions) ;
//   2. une base clonée par seed, prérequis (setup) joués, puis le seed exécuté `runs` fois,
//      séparément, stderr affiché tel quel ;
//   3. après chaque exécution : assertions du seed (check), empreinte d'état ; runs 2..n doivent
//      laisser la même empreinte que le run 1 (idempotence) ;
//   4. après la dernière exécution : clés étrangères, contraintes et invariants métier
//      (seed_harness.controles), comparés à la base de référence ;
//   5. scénarios complémentaires : reprise après interruption (seed Preview), cycle
//      nettoyage/reseed (pilote), reset (démo), sauvegarde/restauration/rejeu (DR).
//
// Bases locales jetables uniquement (préfixe `seeds_` et `elsatia_dr_drill_seeds`) : aucune
// connexion à Preview ni Production n'est possible depuis ce harnais.
//
// Usage : node scripts/seeds/verify-seeds.mjs [--only=id,id] [--skip-rebuild] [--keep]
//                                             [--report=fichier.json] [--base=seeds_base]
// Exige PostgreSQL 16 local ; lancé en root (runuser postgres) ou avec PGUSER=postgres.
import { execFileSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { applyHostedSearchPath, cloneDatabase, dropDatabase, psql, psqlJson, psqlValue, tempSqlFile } from "./lib/pg.mjs";
import { PREVIEW_COMPANY_ID, SEEDS, seedById } from "./registry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HARNESS_SQL = path.join(ROOT, "scripts/seeds/fixtures/harnais.sql");

function parseArgs(argv) {
  const options = { only: null, skipRebuild: false, keep: false, report: null, base: "seeds_base" };
  for (const arg of argv.slice(2)) {
    const [key, value] = arg.replace(/^--/, "").split("=");
    if (key === "only") options.only = new Set(value.split(","));
    else if (key === "skip-rebuild") options.skipRebuild = true;
    else if (key === "keep") options.keep = true;
    else if (key === "report") options.report = value;
    else if (key === "base") options.base = value;
    else throw new Error(`option inconnue: ${arg}`);
  }
  if (!/^seeds_[a-z0-9_]+$/.test(options.base)) throw new Error("la base de référence doit commencer par seeds_");
  return options;
}

function log(message) {
  process.stdout.write(`${message}\n`);
}

function showStderr(label, stderr) {
  const text = stderr.trim();
  if (text) process.stderr.write(`── stderr ${label} ──\n${text}\n`);
}

// ── Étapes ──────────────────────────────────────────────────────────────
function stepToSql(step) {
  if (step.sql) return { file: path.join(ROOT, step.sql) };
  if (step.include) {
    const body = `\\i ${path.join(ROOT, step.include)}\n`;
    return { file: tempSqlFile("include.sql", step.transaction ? `begin;\n${body}commit;\n` : body) };
  }
  if (step.inline) {
    const body = step.inline.replaceAll("\\ir ", `\\i ${ROOT}/`);
    return { file: tempSqlFile("inline.sql", step.transaction ? `begin;\n${body}\ncommit;\n` : `${body}\n`) };
  }
  if (step.emitSql) {
    const file = tempSqlFile("emit.sql", "");
    execFileSync(process.execPath, [path.join(ROOT, step.emitSql), `--emit-sql=${file}`], { cwd: ROOT, stdio: "pipe" });
    fs.chmodSync(file, 0o644);
    return { file };
  }
  throw new Error(`étape inconnue: ${JSON.stringify(step)}`);
}

function runSteps(db, steps, label, seen = new Set()) {
  let env = {};
  for (const step of steps) {
    if (step.env) { env = { ...env, ...step.env }; continue; }
    if (step.seed) {
      const other = seedById(step.seed);
      if (!other?.harness) throw new Error(`seed prérequis inconnu: ${step.seed}`);
      if (seen.has(step.seed)) continue;
      runSteps(db, [...(other.harness.setup ?? []), ...other.harness.run], `${label} ← ${step.seed}`, new Set([...seen, step.seed]));
      continue;
    }
    const { file } = stepToSql(step);
    const started = Date.now();
    const result = psql(db, { file, env });
    showStderr(`${label} ${step.sql ?? step.include ?? step.emitSql ?? "inline"}`, result.stderr);
    if (!result.ok) {
      const error = new Error(`${label}: échec de ${step.sql ?? step.include ?? step.emitSql ?? "étape inline"}`);
      error.stderr = result.stderr.trim();
      throw error;
    }
    log(`   ✓ ${label} ${step.sql ?? step.include ?? step.emitSql ?? "inline"} (${Date.now() - started} ms)`);
  }
}

// ── Empreintes et contrôles ─────────────────────────────────────────────
function installHarness(db) {
  const result = psql(db, { file: HARNESS_SQL, args: ["-c", "set client_min_messages = warning"] });
  if (!result.ok) throw new Error(`installation du harnais: ${result.stderr}`);
}

function fingerprint(db) {
  const rows = psqlJson(db, "select * from seed_harness.empreinte()");
  return Object.fromEntries(rows.map((row) => [row.table_nom, row]));
}

function columnFingerprint(db, table) {
  return Object.fromEntries(psqlJson(db, `select * from seed_harness.empreinte_colonnes('${table}')`).map((row) => [row.colonne, row.empreinte]));
}

// Écarts entre deux empreintes. Chaque table divergente porte le nom des colonnes qui diffèrent
// (colonnes uuid ignorées en comparaison métier), relevées dans les bases indiquées.
function diffFingerprints(a, b, field, { dbA = null, dbB = null } = {}) {
  const tables = new Set([...Object.keys(a), ...Object.keys(b)]);
  const diffs = [];
  for (const table of tables) {
    const left = a[table];
    const right = b[table];
    if (!left || !right || left.lignes !== right.lignes || left[field] !== right[field]) {
      const diff = { table, avant: left?.lignes ?? null, apres: right?.lignes ?? null };
      if (dbA && dbB && left && right) {
        const columnsA = columnFingerprint(dbA, table);
        const columnsB = columnFingerprint(dbB, table);
        diff.colonnes = Object.keys(columnsB).filter((column) => columnsA[column] !== columnsB[column]);
      }
      diffs.push(diff);
    }
  }
  return diffs;
}

function controls(db) {
  return psqlJson(db, "select * from seed_harness.controles()");
}

function maxControls(rows) {
  const max = new Map();
  for (const row of rows) max.set(row.controle, Math.max(max.get(row.controle) ?? 0, Number(row.anomalies)));
  return [...max].map(([controle, anomalies]) => ({ controle, anomalies }));
}

function controlRegressions(baseline, after) {
  const base = new Map(baseline.map((row) => [row.controle, Number(row.anomalies)]));
  return after.filter((row) => Number(row.anomalies) > (base.get(row.controle) ?? 0))
    .map((row) => ({ controle: row.controle, anomalies: Number(row.anomalies), reference: base.get(row.controle) ?? 0 }));
}

// ── Scénarios ───────────────────────────────────────────────────────────
function splitModules(sql) {
  const parts = sql.split(/(?=^-- @module )/m);
  const preamble = parts.shift();
  const summaryIndex = parts.length ? parts.at(-1).indexOf("-- @summary") : -1;
  const summary = summaryIndex >= 0 ? parts.at(-1).slice(summaryIndex) : "";
  if (summaryIndex >= 0) parts[parts.length - 1] = parts.at(-1).slice(0, summaryIndex);
  return { preamble, modules: parts, summary };
}

async function flowInterruption(context, seed, reference) {
  const results = [];
  const { file } = stepToSql(seed.harness.run[0]);
  const { preamble, modules } = splitModules(fs.readFileSync(file, "utf8"));
  const moduleKey = (module) => /^-- @module (\S+)/.exec(module)[1];
  // Arrêts simulés : juste après le commit d'un module, puis au milieu du module suivant
  // (transaction ouverte, connexion perdue → annulation par la base).
  for (const stopAt of ["lignesDevis", "commandes", "pointages", "employeeExits"]) {
    const db = `${context.prefix}_int_${stopAt.toLowerCase()}`;
    cloneDatabase(context.base, db);
    const index = modules.findIndex((module) => moduleKey(module) === stopAt);
    const partial = modules[index].replace(/commit;\s*$/, "-- connexion perdue avant commit\n");
    const crashed = tempSqlFile("crash.sql", preamble + modules.slice(0, index).join("") + partial);
    const crash = psql(db, { file: crashed });
    showStderr(`${seed.id} arrêt au milieu de ${stopAt}`, crash.stderr);
    if (!crash.ok) throw new Error(`arrêt simulé ${stopAt}: ${crash.stderr}`);
    const partialState = fingerprint(db);
    const resumes = [];
    for (let run = 1; run <= 2; run += 1) {
      const resume = psql(db, { file });
      showStderr(`${seed.id} reprise ${run} après ${stopAt}`, resume.stderr);
      if (!resume.ok) throw new Error(`reprise ${run} après ${stopAt}: ${resume.stderr}`);
      resumes.push(diffFingerprints(reference, fingerprint(db), "metier", { dbA: context.referenceDb, dbB: db }));
    }
    results.push({
      arret: `milieu du module ${stopAt} (modules précédents validés)`,
      tablesDejaPeupleesAvantReprise: Object.values(partialState).filter((row) => Number(row.lignes) > 0 && row.table_nom.startsWith("public.")).length,
      ecartsApresReprise1: resumes[0],
      ecartsApresReprise2: resumes[1],
      ok: resumes.every((diff) => diff.length === 0),
    });
    if (!context.keep) dropDatabase(db);
  }

  // Coupure réelle : psql tué (SIGKILL) pendant l'exécution, dès que les lignes de factures apparaissent.
  const db = `${context.prefix}_int_kill`;
  cloneDatabase(context.base, db);
  const killed = await new Promise((resolve) => {
    const child = spawn(process.getuid?.() === 0 ? "runuser" : "psql",
      [...(process.getuid?.() === 0 ? ["-u", "postgres", "--", "psql"] : []), "-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", db, "-f", file],
      { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const timer = setInterval(() => {
      const count = spawnSync(process.getuid?.() === 0 ? "runuser" : "psql",
        [...(process.getuid?.() === 0 ? ["-u", "postgres", "--", "psql"] : []), "-X", "-At", "-d", db, "-c",
          `select count(*) from public.lignes_factures f join public.factures x on x.id = f.facture_id where x.entreprise_id = '${PREVIEW_COMPANY_ID}'`], { encoding: "utf8" });
      if (Number(count.stdout.trim()) > 0) { child.kill("SIGKILL"); clearInterval(timer); }
    }, 20);
    child.on("exit", (code, signal) => { clearInterval(timer); resolve({ code, signal, stderr }); });
  });
  const killedState = fingerprint(db);
  const resume = psql(db, { file });
  showStderr(`${seed.id} reprise après SIGKILL`, resume.stderr);
  const diff = resume.ok ? diffFingerprints(reference, fingerprint(db), "metier", { dbA: context.referenceDb, dbB: db }) : null;
  results.push({
    arret: `SIGKILL du client psql (${killed.signal ?? `code ${killed.code}`})`,
    pointagesAvantReprise: Number(killedState["public.pointages"]?.lignes ?? 0),
    affectationsAvantReprise: Number(killedState["public.affectations"]?.lignes ?? 0),
    ecartsApresReprise1: diff,
    ok: resume.ok && diff.length === 0,
  });
  if (!context.keep) dropDatabase(db);
  return results;
}

function flowPiloteCycle(context, seed, db, reference) {
  const count = () => Number(psqlValue(db, "select count(*) from public.entreprises where reference_interne = 'PILOTE-BTP-V1'"));
  runSteps(db, [{ sql: "supabase/production/cleanup_entreprise_pilote_btp.sql" }], `${seed.id} nettoyage`);
  const afterCleanup = count();
  const cleanupControls = controlRegressions(context.baselineControls, controls(db));
  const leftovers = diffFingerprints(context.setupFingerprint, fingerprint(db), "metier", { dbA: context.setupDb, dbB: db });
  runSteps(db, seed.harness.run, `${seed.id} reseed`);
  runSteps(db, seed.harness.check ?? [], `${seed.id} assertions après reseed`);
  const diff = diffFingerprints(reference, fingerprint(db), "metier", { dbA: context.referenceDb, dbB: db });
  return [{
    scenario: "nettoyage → reseed",
    entreprisesPiloteApresNettoyage: afterCleanup,
    controlesApresNettoyage: cleanupControls,
    residusApresNettoyage: leftovers,
    ecartsMetierApresReseed: diff,
    ok: afterCleanup === 0 && cleanupControls.length === 0 && leftovers.length === 0 && diff.length === 0,
  }];
}

function flowDemoReset(context, seed, db, reference) {
  runSteps(db, [{ sql: "supabase/production/reset_entreprise_demo_18_mois.sql" }], `${seed.id} reset`);
  const afterReset = Number(psqlValue(db, "select count(*) from public.chantiers c join public.entreprises e on e.id = c.entreprise_id where e.reference_interne = 'DEMO-18M'"));
  runSteps(db, seed.harness.run, `${seed.id} recréation`);
  const diff = diffFingerprints(reference, fingerprint(db), "metier", { dbA: context.referenceDb, dbB: db });
  return [{ scenario: "reset → recréation", chantiersDemoApresReset: afterReset, ecartsMetierApresRecreation: diff, ok: afterReset === 0 && diff.length === 0 }];
}

function flowDr(context) {
  const password = process.env.SEEDS_DR_PGPASSWORD ?? process.env.DR_PGPASSWORD;
  if (!password) {
    return [{ scenario: "outillage DR", ok: false, detail: "SEEDS_DR_PGPASSWORD (ou DR_PGPASSWORD) absent : sauvegarde/restauration non exécutées" }];
  }
  const dr = path.join(ROOT, "scripts/dr");
  const outDir = fs.mkdtempSync(path.join("/tmp", "elsatia-seeds-dr-"));
  const envFor = (database) => ({ ...process.env, DR_PGPASSWORD: password, PGPASSWORD: password, DR_PGUSER: "postgres", DR_PGHOST: "127.0.0.1", DR_PGDATABASE: database });
  const run = (label, command, args, database) => {
    const result = spawnSync(command, args, { cwd: dr, env: envFor(database), encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
    showStderr(`DR ${label}`, result.stderr ?? "");
    if (result.status !== 0) throw new Error(`DR ${label}: code ${result.status}\n${result.stdout}`);
    log(`   ✓ DR ${label}`);
    return result.stdout.trim();
  };
  const replay = "elsatia_dr_drill_seeds";
  const restore = "elsatia_dr_drill_seeds_restore";
  const pgsodium = spawnSync("bash", [path.join(dr, "00b_install_pgsodium_stub.sh")], { encoding: "utf8" });
  showStderr("DR stub pgsodium", pgsodium.stderr ?? "");
  // Rejeu : pipeline DR complet (stubs DR + migrations), puis le seed.
  run("rejeu des migrations (01_replay_migrations.sh --fresh)", "bash", ["01_replay_migrations.sh", "--fresh"], replay);
  run("seed synthétique", "psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-h", "127.0.0.1", "-U", "postgres", "-d", replay, "-f", "03_seed_synthetic_dataset.sql"], replay);
  run("manifeste avant sauvegarde", "bash", ["04_manifest.sh", path.join(outDir, "avant.json")], replay);
  const backupDir = run("sauvegarde (05_backup.sh)", "bash", ["05_backup.sh", "--out-dir", outDir], replay).split("\n").at(-1);
  run("restauration (06_restore.sh)", "bash", ["06_restore.sh", backupDir, "--target-db", restore, "--force"], restore);
  run("manifeste après restauration", "bash", ["04_manifest.sh", path.join(outDir, "apres.json")], restore);
  run("comparaison stricte des manifestes (07_verify.sh)", "bash", ["07_verify.sh", path.join(outDir, "avant.json"), path.join(outDir, "apres.json")], restore);
  run("isolation RLS fonctionnelle après restauration (08)", "bash", ["08_verify_rls_functional.sh"], restore);
  // Le seed sur la base restaurée doit rester cohérent (contrôles d'intégrité identiques).
  installHarness(restore);
  const restoredControls = controlRegressions(context.baselineControls, controls(restore));
  if (!context.keep) { dropDatabase(replay); dropDatabase(restore); fs.rmSync(outDir, { recursive: true, force: true }); }
  return [{ scenario: "rejeu → seed → sauvegarde → restauration → 07/08", controlesApresRestauration: restoredControls, ok: restoredControls.length === 0 }];
}

// ── Exécution d'un seed ─────────────────────────────────────────────────
async function verifySeed(context, seed) {
  const db = `${context.prefix}_${seed.id.replaceAll("-", "_")}`;
  const report = { id: seed.id, path: seed.path, classification: seed.classification, runs: [], ok: false };
  const started = Date.now();
  // Base « prérequis » clonée pour chaque scénario : mêmes UUID et codes aléatoires partout,
  // l'empreinte stricte reste comparable d'une base à l'autre.
  const setupDb = `${db}_prerequis`;
  const referenceDb = `${db}_run1`;
  const flowContext = { ...context, referenceDb, setupDb };
  try {
    cloneDatabase(context.base, setupDb);
    runSteps(setupDb, seed.harness.setup ?? [], `${seed.id} prérequis`);
    installHarness(setupDb);
    flowContext.setupFingerprint = fingerprint(setupDb);
    // Un seed ne doit ajouter aucune anomalie à celles de ses prérequis (ex. squelette RLS pgTAP) :
    // la référence des contrôles est le pire de la base neuve et de la base prérequis.
    const setupControls = controls(setupDb);
    report.anomaliesHeriteesDesPrerequis = controlRegressions(context.baselineControls, setupControls);
    const referenceControls = [...context.baselineControls, ...setupControls];
    cloneDatabase(setupDb, db);
    let reference = null;
    for (let run = 1; run <= seed.harness.runs; run += 1) {
      runSteps(db, seed.harness.run, `${seed.id} run ${run}`);
      runSteps(db, seed.harness.check ?? [], `${seed.id} assertions run ${run}`);
      const state = fingerprint(db);
      if (!reference) {
        reference = state;
        cloneDatabase(db, referenceDb);
        report.runs.push({ run, tablesPeuplees: Object.values(state).filter((row) => Number(row.lignes) > 0).length });
      } else {
        const strict = diffFingerprints(reference, state, "stricte", { dbA: referenceDb, dbB: db });
        const business = diffFingerprints(reference, state, "metier", { dbA: referenceDb, dbB: db });
        report.runs.push({ run, ecartsStricts: strict, ecartsMetier: business });
      }
    }
    report.controles = controlRegressions(maxControls(referenceControls), controls(db));
    report.idempotent = report.runs.slice(1).every((run) => run.ecartsMetier.length === 0);
    report.memeEtatStrict = report.runs.slice(1).every((run) => run.ecartsStricts.length === 0);
    if (seed.harness.flow === "interruption") report.scenarios = await flowInterruption({ ...flowContext, base: setupDb }, seed, reference);
    if (seed.harness.flow === "pilote-cycle") report.scenarios = flowPiloteCycle(flowContext, seed, db, reference);
    if (seed.harness.flow === "demo-reset") report.scenarios = flowDemoReset(flowContext, seed, db, reference);
    if (seed.harness.flow === "dr") report.scenarios = flowDr(context);
    const idempotenceOk = !seed.idempotent || (seed.harness.runs > 1 && report.idempotent);
    report.ok = report.controles.length === 0 && idempotenceOk && (report.scenarios ?? []).every((scenario) => scenario.ok);
  } catch (error) {
    report.error = error.message;
    report.stderr = error.stderr;
  } finally {
    report.dureeMs = Date.now() - started;
    if (!context.keep) { for (const name of [db, setupDb, referenceDb]) { try { dropDatabase(name); } catch { /* base déjà absente */ } } }
  }
  return report;
}

async function main() {
  const options = parseArgs(process.argv);
  const context = { base: options.base, prefix: options.base.replace(/_base$/, ""), keep: options.keep };
  if (!options.skipRebuild) {
    log(`== base de référence ${options.base} : amorce + toutes les migrations ==`);
    const rebuild = spawnSync("bash", [path.join(ROOT, "scripts/local-postgres-bootstrap/rebuild_db.sh"), options.base], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    process.stdout.write(rebuild.stdout);
    showStderr("rebuild_db.sh", rebuild.stderr);
    if (rebuild.status !== 0) {
      log("ÉCHEC : le train de migrations ne se rejoue pas sur une base fraîche.");
      process.exit(1);
    }
  }
  applyHostedSearchPath(options.base);
  const migrations = fs.readdirSync(path.join(ROOT, "supabase/migrations")).filter((name) => name.endsWith(".sql")).sort();
  installHarness(options.base);
  context.baselineControls = controls(options.base);
  psql(options.base, { sql: "drop schema seed_harness cascade;" });

  const selected = SEEDS.filter((seed) => seed.harness && (!options.only || options.only.has(seed.id)));
  const reports = [];
  for (const seed of selected) {
    log(`\n== ${seed.id} (${seed.classification}) — ${seed.path} ==`);
    const report = await verifySeed(context, seed);
    reports.push(report);
    log(`${report.ok ? "QUALIFIED" : "FAILED"} ${seed.id} (${report.dureeMs} ms)${report.error ? ` — ${report.error}` : ""}`);
  }

  const summary = {
    genereLe: new Date().toISOString(),
    derniereMigration: migrations.at(-1),
    migrations: migrations.length,
    seeds: reports,
    nonExecutes: SEEDS.filter((seed) => !seed.harness).map((seed) => ({ id: seed.id, path: seed.path, classification: seed.classification, raison: seed.reason ?? `couvert par ${seed.coveredBy}` })),
    verdict: reports.every((report) => report.ok) ? "ALL ACTIVE SEEDS QUALIFIED" : "SEED BLOCKERS REMAIN",
  };
  if (options.report) fs.writeFileSync(options.report, `${JSON.stringify(summary, null, 2)}\n`);
  log(`\n== ${summary.verdict} — ${reports.filter((report) => report.ok).length}/${reports.length} seeds qualifiés sur ${summary.migrations} migrations (${summary.derniereMigration}) ==`);
  for (const report of reports.filter((item) => !item.ok)) {
    log(`  ✗ ${report.id}: ${report.error ?? JSON.stringify({ controles: report.controles, runs: report.runs.slice(1), scenarios: report.scenarios })}`);
  }
  process.exit(summary.verdict === "ALL ACTIVE SEEDS QUALIFIED" ? 0 : 1);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exit(1);
});
