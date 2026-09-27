// Tests sans base ni réseau du seed Preview (plan, gardes, script SQL généré).
// L'exécution réelle — base fraîche du train, runs 1/2/3, reprises après interruption, contrôles
// d'intégrité — est couverte par `npm run verify:seeds` (scripts/seeds/verify-seeds.mjs).
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  COMMAND_PATHS,
  DEVIS_PATHS,
  MARKER,
  buildExecutionSql,
  buildPlan,
  buildPreflightSql,
  executionModules,
  parseArgs,
  safeEnvironment,
  simulateInvoiceLifecycle,
  stableId,
  summary,
  validateCommandNumbers,
  validatePlan,
  validateSupplierExpenses,
} from "./seed-elsatia-preview-year.mjs";

const previewEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://pgvvpqyjziyapbbkydmc.supabase.co",
  SUPABASE_PROJECT_REF: "pgvvpqyjziyapbbkydmc",
  ELSATIA_SUPABASE_PROJECT_NAME: "elsatia-preview",
  FEATURE_BOUTIQUE_ENABLED: "false",
  FEATURE_AI_ENABLED: "false",
  FEATURE_CRONS_ENABLED: "false",
  NEXT_PUBLIC_APP_URL: "https://elsatia-preview.example.invalid",
};
const liaisons = { linkedRef: "pgvvpqyjziyapbbkydmc", vercelProject: "elsatia-preview" };
const source = fs.readFileSync(new URL("./seed-elsatia-preview-year.mjs", import.meta.url), "utf8");

function modulesOf(sql) {
  return [...sql.matchAll(/^-- @module (\S+)$/gm)].map((match) => match[1]);
}

test("le plan est déterministe et respecte tous les volumes validés", () => {
  const first = buildPlan();
  const second = buildPlan();
  const volumes = validatePlan(first);
  assert.deepEqual(first, second);
  assert.equal(volumes.pointages, 1500);
  assert.equal(volumes.affectations, 780);
  assert.equal(first.employees.filter((row) => row.email === "julien.gregurec@gmail.com").length, 1);
  assert.equal(first.employees.filter((row) => row.__role === "Compte dépôt").length, 0);
  assert.equal(new Set(first.pointages.map((row) => row.id)).size, 1500);
});

test("le script SQL généré est déterministe", () => {
  assert.equal(buildExecutionSql(buildPlan()), buildExecutionSql(buildPlan()));
});

test("les identifiants stables ne changent pas et sont des UUID", () => {
  assert.equal(stableId("client", 1), stableId("client", 1));
  assert.notEqual(stableId("client", 1), stableId("client", 2));
  assert.match(stableId("client", 1), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("devis, factures et commandes sont insérés en brouillon, lignes avant transitions", () => {
  const plan = buildPlan();
  assert.ok(plan.devis.every((row) => row.statut === "brouillon" && DEVIS_PATHS[row.__targetStatus]));
  assert.ok(plan.factures.every((row) => row.statut === "brouillon"));
  assert.ok(plan.commandes.every((row) => row.statut === "brouillon" && COMMAND_PATHS[row.__targetStatus]));
  assert.ok(plan.lignesCommande.every((row) => row.quantite_recue === 0 && row.__targetRecue <= row.quantite));
  const order = executionModules(plan).map((module) => module.key);
  const before = (a, b) => assert.ok(order.indexOf(a) < order.indexOf(b), `${a} avant ${b}`);
  before("devis", "lignesDevis");
  before("lignesDevis", "devisTransitions");
  before("factures", "lignesFactures");
  before("lignesFactures", "invoiceEmission");
  before("invoiceEmission", "paiements");
  before("commandes", "lignesCommande");
  before("lignesCommande", "commandeTransitions");
  before("commandeTransitions", "supplierExpenses");
  before("employeeReentry", "affectations");
  before("affectations", "employeeExits");
  before("absences", "employeeExits");
  assert.equal(order.at(-1), "verification");
});

test("chaque module est une transaction et le script sérialise les exécutions", () => {
  const sql = buildExecutionSql(buildPlan());
  const modules = modulesOf(sql);
  assert.deepEqual(modules, executionModules(buildPlan()).map((module) => module.key));
  for (const block of sql.split(/^-- @module /m).slice(1)) {
    assert.match(block, /^\S+\nbegin;\n/);
    assert.match(block.split("-- @summary")[0], /\ncommit;\n\s*$/);
  }
  assert.match(sql, /pg_advisory_lock\(hashtext\('RECETTE_ELSATIA_PREVIEW_2025_2026'\)\)/);
  assert.ok(sql.indexOf("-- @preflight") < sql.indexOf("-- @module"));
});

test("aucun garde métier n'est contourné par le script ni par le module", () => {
  const sql = buildExecutionSql(buildPlan());
  for (const forbidden of [/disable\s+trigger/i, /session_replication_role/i, /capacite_personnes_bypass/i, /service_role/i]) {
    assert.doesNotMatch(sql, forbidden);
  }
  // Le module n'utilise plus supabase-js ni la clé service_role (ACL canonique 20260902000255).
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|@supabase\/supabase-js|createClient/);
  // Transitions de commandes par les fonctions métier, réception par le moteur canonique.
  assert.match(sql, /changer_statut_commande_interne/);
  assert.match(sql, /enregistrer_reception_commande_interne/);
});

test("toutes les références de contexte sont résolues par le préflight", () => {
  const plan = buildPlan();
  const refs = new Set(JSON.stringify(plan).match(/\{\{[^}]+\}\}/g));
  const allowed = new Set(["{{gerant}}", ...["Ouvrier", "Chef d’équipe", "Chef de chantier", "Conducteur de travaux", "Directeur travaux",
    "Administration", "RH", "Comptable", "Gérant"].map((role) => `{{poste:${role}}}`)]);
  for (const ref of refs) assert.ok(allowed.has(ref), `référence inconnue ${ref}`);
  const sql = buildExecutionSql(plan);
  assert.match(sql, /insert into pg_temp\.seed_contexte values \('gerant', v_uid::text\)/);
  assert.match(sql, /'poste:' \|\| nom/);
});

test("le préflight vérifie le catalogue de permissions de la base et la capacité avant toute écriture", () => {
  const sql = buildExecutionSql(buildPlan());
  const preflight = sql.slice(sql.indexOf("-- @preflight"), sql.indexOf("-- @module"));
  assert.match(preflight, /count\(\*\) into v_catalogue from public\.permissions_disponibles/);
  assert.match(preflight, /capacite_personnes_totale/);
  assert.match(preflight, /collision avec un numéro de commande manuel/);
  assert.match(preflight, /collision avec une dépense fournisseur manuelle/);
  assert.doesNotMatch(preflight, /\binsert into public\.|\bupdate public\.|\bdelete from public\./);
});

test("le préflight en lecture seule ne peut rien écrire", () => {
  const sql = buildPreflightSql(buildPlan());
  assert.match(sql, /begin read only;/);
  assert.match(sql, /rollback;/);
  assert.doesNotMatch(sql, /-- @module/);
});

test("un salarié sorti reçoit son historique sous contrat puis sort par transition", () => {
  const plan = buildPlan();
  const departed = plan.employees.filter((row) => row.__targetStatus === "sorti");
  assert.equal(departed.length, 1);
  assert.equal(departed[0].statut, "actif");
  assert.equal(departed[0].date_sortie, null);
  const exit = departed[0].__targetExit;
  const history = [...plan.affectations, ...plan.pointages].filter((row) => row.employe_id === departed[0].id);
  assert.ok(history.length > 0);
  assert.ok(history.every((row) => row.date <= exit));
  for (const row of plan.affectations) {
    const employee = plan.employees.find((item) => item.id === row.employe_id);
    assert.ok(row.date >= employee.date_entree);
  }
  const broken = structuredClone(plan);
  broken.affectations[0].date = "2025-08-01";
  broken.affectations[0].employe_id = plan.employees.find((row) => row.date_entree > "2025-08-01").id;
  assert.throws(() => validatePlan(broken), /hors du contrat/);
});

test("les taux et coûts horaires vivent dans leurs tables dédiées", () => {
  const plan = buildPlan();
  assert.ok(plan.employees.every((row) => !("taux_horaire" in row) && !("cout_horaire" in row)));
  assert.equal(plan.employeeRates.length, 12);
  assert.equal(plan.employeeCosts.length, 12);
  const modules = executionModules(plan);
  assert.equal(modules.find((module) => module.key === "employeeRates").table, "employes_taux_facture");
  assert.equal(modules.find((module) => module.key === "employeeCosts").table, "employes_cout_horaire");
});

test("la séquence des factures reproduit les statuts métier après les règlements", () => {
  const lifecycle = simulateInvoiceLifecycle(buildPlan());
  assert.equal(lifecycle.length, 25);
  assert.ok(lifecycle.every((invoice) => invoice.initiallyValid && invoice.insertionStatus === "brouillon"));
  assert.deepEqual(Object.fromEntries(Object.entries(Object.groupBy(lifecycle, (invoice) => invoice.finalStatus)).map(([status, rows]) => [status, rows.length])), {
    payee: 14, payee_partiel: 6, en_retard: 3, avoir_emis: 2,
  });
  assert.equal(lifecycle.reduce((sum, invoice) => sum + invoice.paymentCount, 0), 20);
});

test("les commandes 2025 et 2026 utilisent des numéros canoniques stables hors de la plage du compteur", () => {
  const first = buildPlan().commandes;
  assert.deepEqual(first.map((row) => row.numero), buildPlan().commandes.map((row) => row.numero));
  assert.equal(new Set(first.map((row) => row.numero)).size, 18);
  assert.deepEqual(validateCommandNumbers(first), { count: 18, reservedAbove: 2_147_483_647 });
  assert.throws(() => validateCommandNumbers(first, [{ id: "commande-manuelle", numero: first[0].numero }]), /collision/);
});

test("les 18 dépenses liées reprennent le chantier et le fournisseur de leur commande", () => {
  const plan = buildPlan();
  assert.deepEqual(validateSupplierExpenses(plan), { count: 30, linkedToCommands: 18, withoutCommand: 12, existingDeterministicExpenses: 0 });
  const broken = structuredClone(plan);
  broken.supplierExpenses[16].chantier_id = broken.chantiers[16].id;
  assert.throws(() => validateSupplierExpenses(broken), /chantier de sa commande/);
});

test("le mode d'exécution exige la confirmation exacte", () => {
  assert.deepEqual(parseArgs(["node", "script", "--dry-run"]), { dryRun: true, liveReadonly: false, execute: false, json: false, emitSql: null });
  assert.deepEqual(parseArgs(["node", "script", "--dry-run", "--live-readonly"]), { dryRun: true, liveReadonly: true, execute: false, json: false, emitSql: null });
  assert.deepEqual(parseArgs(["node", "script", "--emit-sql=/tmp/x.sql"]), { dryRun: false, liveReadonly: false, execute: false, json: false, emitSql: "/tmp/x.sql" });
  assert.throws(() => parseArgs(["node", "script", "--emit-sql=/tmp/x.sql", "--execute"]), /seul/);
  assert.throws(() => parseArgs(["node", "script", "--execute"]), /confirmation/);
  assert.throws(() => parseArgs(["node", "script", "--dry-run", "--confirm=x"]), /interdit/);
  assert.throws(() => parseArgs(["node", "script", "--dry-run", "--force"]), /option interdite/);
});

test("les garde-fous refusent une autre cible, un projet lié différent ou un mode Production", () => {
  assert.doesNotThrow(() => safeEnvironment(previewEnv, liaisons));
  assert.throws(() => safeEnvironment(previewEnv, { ...liaisons, linkedRef: "autre-projet" }), /projet lié/);
  assert.throws(() => safeEnvironment(previewEnv, { ...liaisons, linkedRef: null }), /projet lié/);
  assert.throws(() => safeEnvironment(previewEnv, { ...liaisons, vercelProject: null }), /Vercel/);
  assert.throws(() => safeEnvironment({ ...previewEnv, SUPABASE_PROJECT_REF: "autre" }, liaisons), /incorrect/);
  assert.throws(() => safeEnvironment({ ...previewEnv, NEXT_PUBLIC_SUPABASE_URL: "https://autre.supabase.co" }, liaisons), /hors cible/);
  assert.throws(() => safeEnvironment({ ...previewEnv, FEATURE_AI_ENABLED: "true" }, liaisons), /garde-fou/);
  assert.throws(() => safeEnvironment({ ...previewEnv, VERCEL_ENV: "production" }, liaisons), /Production/);
  assert.throws(() => safeEnvironment({ ...previewEnv, STRIPE_SECRET_KEY: ["sk", "live", "interdit"].join("_") }, liaisons), /Stripe Live/);
});

test("le dry-run annoncé ne contient aucun effet externe et n'exécute rien", () => {
  const plan = buildPlan();
  const report = summary(plan, validatePlan(plan));
  assert.deepEqual(report.externalEffects, { emails: 0, push: 0, stripe: 0, powens: 0, ai: 0, crons: 0 });
  assert.equal(report.documents.uploaded, 0);
  assert.equal(report.execution.moduleLevelAtomicity, true);
  const dryRunBranch = source.slice(source.indexOf("if (options.dryRun)"), source.indexOf("safeEnvironment(process.env);\n  runLinkedSql(buildExecutionSql"));
  assert.doesNotMatch(dryRunBranch, /buildExecutionSql/);
  assert.match(dryRunBranch, /buildPreflightSql/);
  assert.ok(MARKER.startsWith("RECETTE_ELSATIA_PREVIEW"));
});
