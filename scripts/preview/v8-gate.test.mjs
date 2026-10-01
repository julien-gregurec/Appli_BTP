// Tests hors réseau de la garde d'écriture Preview V8 (scripts/preview/lib/v8-gate.mjs,
// v8-upgrade-gate.mjs, backup-preview.mjs, pilot-subscription.mjs).
// Lancer : node --test scripts/preview/v8-gate.test.mjs   (npm run test:preview-v8-gate)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { REF_PREVIEW_AUTORISEE as REF, REF_PRODUCTION_CONNUE as PROD, Refus } from "./lib/preview-guard.mjs";
import * as g from "./lib/v8-gate.mjs";
import { versionsLocales } from "./db-verify.mjs";
import { attendus } from "./train-expectations.mjs";
import { exigerDossierSortie } from "./backup-preview.mjs";
import { analyserDiagnostic, validerDemande, SQL_APPLICATION, SQL_DIAGNOSTIC } from "./pilot-subscription.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const locales = versionsLocales();
const prefixe = (n) => locales.slice(0, n);

test("train V8 : le dépôt est la référence (371, 20260928000812, 37 contrôles)", () => {
  const a = attendus();
  assert.equal(a.nb, g.TRAIN_V8.nb);
  assert.equal(a.derniere, g.TRAIN_V8.derniere);
  assert.equal(a.controles, g.TRAIN_V8.controles);
  assert.deepEqual(g.exigerDepotV8(locales), { nb: 371, derniere: "20260928000812" });
});

test("garde : train inférieur à V8 refusé", () => {
  assert.throws(() => g.exigerDepotV8(prefixe(359)), /inférieur à V8/);
  assert.throws(() => g.exigerDepotV8([...prefixe(370), "20260929000000"]), /absente du dépôt/);
});

test("garde : identité du projet (Production, nom, mauvais ref)", () => {
  assert.throws(() => g.exigerIdentiteProjet({ ref: PROD }), /PRODUCTION/);
  assert.throws(() => g.exigerIdentiteProjet({ ref: "a".repeat(20) }), /mauvais project ref/);
  assert.throws(() => g.exigerIdentiteProjet({ ref: null }), Refus);
  assert.throws(() => g.exigerIdentiteProjet({ ref: REF, exigerNom: true }), /--projects-json/);
  assert.throws(() => g.exigerIdentiteProjet({ ref: REF, projets: [{ id: REF, name: "elsatia-production" }] }), /Production/);
  assert.throws(() => g.exigerIdentiteProjet({ ref: REF, projets: [{ id: REF, name: "Production" }] }), /Production/);
  assert.throws(() => g.exigerIdentiteProjet({ ref: REF, projets: [{ id: REF, name: "elsatia-staging" }] }), /elsatia-preview attendu/);
  assert.throws(() => g.exigerIdentiteProjet({ ref: REF, projets: [{ id: PROD, name: "elsatia-preview" }] }), /absent/);
  assert.deepEqual(g.exigerIdentiteProjet({ ref: REF, projets: [{ id: "x", ref: REF, name: "elsatia-preview" }] }), { ref: REF, nom: "elsatia-preview" });
});

test("ledger : chaque train publié est reconnu et mène à V8 par un upgrade monotone", () => {
  for (const t of g.TRAINS_CONNUS) {
    const a = g.analyserLedger(locales, prefixe(t.nb));
    assert.equal(a.train.train, t.train);
    assert.equal(a.statut, t.train === "V8" ? "A_JOUR" : "EN_RETARD");
    assert.equal(a.enAttente.length, 371 - t.nb);
    const chemin = g.cheminVersV8(locales, a);
    assert.equal(chemin.reduce((n, s) => n + s.nb, 0), 371 - t.nb);
    if (t.train !== "V8") assert.equal(chemin.at(-1).derniere, "20260928000812");
  }
  assert.deepEqual(g.cheminVersV8(locales, g.analyserLedger(locales, prefixe(359))).map((s) => [s.train, s.nb]), [["V8", 12]]);
});

test("ledger : mauvais ledger, trous, vierge, hors train", () => {
  assert.equal(g.analyserLedger(locales, [...prefixe(359), "20260929999999"]).statut, "MAUVAIS_LEDGER");
  const trous = prefixe(359).filter((v) => v !== locales[100]);
  const a = g.analyserLedger(locales, trous);
  assert.equal(a.statut, "LEDGER_A_TROUS");
  assert.deepEqual(a.trous, [locales[100]]);
  assert.equal(g.analyserLedger(locales, []).statut, "VIERGE");
  const hors = g.analyserLedger(locales, prefixe(321));
  assert.equal(hors.statut, "EN_RETARD");
  assert.equal(hors.train, null);
});

const sauvegarde = (analyse, extra = {}) => ({
  ref: REF,
  cree_le: new Date().toISOString(),
  ledger: { empreinte: analyse.empreinte },
  fichiers: Object.fromEntries(Object.keys(g.FICHIERS_SAUVEGARDE).map((k) => [k, { nom: `${k}.bin`, octets: 10, sha256: "a".repeat(64) }])),
  ...extra,
});

test("sauvegarde : complète, récente, même ledger, même projet, fichiers intacts", () => {
  const a = g.analyserLedger(locales, prefixe(359));
  assert.deepEqual(g.evaluerSauvegarde(sauvegarde(a), { ref: REF, empreinte: a.empreinte }), []);
  assert.match(g.evaluerSauvegarde(null, { ref: REF, empreinte: a.empreinte })[0], /absent/);
  assert.ok(g.evaluerSauvegarde(sauvegarde(a, { ref: PROD }), { ref: REF, empreinte: a.empreinte }).some((p) => /autre projet/.test(p)));
  assert.ok(g.evaluerSauvegarde(sauvegarde(a, { cree_le: new Date(Date.now() - 7 * 3600e3).toISOString() }), { ref: REF, empreinte: a.empreinte }).some((p) => /trop ancienne/.test(p)));
  assert.ok(g.evaluerSauvegarde(sauvegarde(a), { ref: REF, empreinte: g.empreinteLedger(prefixe(360)) }).some((p) => /ledger a changé/.test(p)));
  const s = sauvegarde(a);
  delete s.fichiers.auth_snapshot;
  s.fichiers.storage_inventory.octets = 0;
  const p = g.evaluerSauvegarde(s, { ref: REF, empreinte: a.empreinte });
  assert.ok(p.some((x) => /Auth/.test(x)) && p.some((x) => /Storage.*vide/.test(x)));
  const empreintes = Object.fromEntries(Object.keys(g.FICHIERS_SAUVEGARDE).map((k) => [k, "a".repeat(64)]));
  empreintes.db_dump = "b".repeat(64);
  assert.ok(g.evaluerSauvegarde(sauvegarde(a), { ref: REF, empreinte: a.empreinte, empreintesFichiers: empreintes }).some((x) => /modifié/.test(x)));
  assert.ok(g.evaluerSauvegarde(sauvegarde(a, { simulation: true }), { ref: REF, empreinte: a.empreinte }).some((x) => /simulation/.test(x)));
  assert.deepEqual(g.evaluerSauvegarde(sauvegarde(a, { simulation: true }), { ref: REF, empreinte: a.empreinte, simulation: true }), []);
});

test("push : GO seulement avec ledger compatible, CLI liée à la Preview et sauvegarde valide", () => {
  const v7 = g.analyserLedger(locales, prefixe(359));
  assert.equal(g.deciderPush({ analyse: v7, problemesSauvegarde: [], refLieeCli: REF, ref: REF }).decision, "GO");
  assert.equal(g.deciderPush({ analyse: v7, problemesSauvegarde: ["x"], refLieeCli: REF, ref: REF }).decision, "NO_GO");
  assert.equal(g.deciderPush({ analyse: v7, problemesSauvegarde: [], refLieeCli: PROD, ref: REF }).decision, "NO_GO");
  assert.equal(g.deciderPush({ analyse: v7, problemesSauvegarde: [], refLieeCli: null, ref: REF }).decision, "NO_GO");
  const etrangere = g.analyserLedger(locales, [...prefixe(359), "20260929999999"]);
  assert.equal(g.deciderPush({ analyse: etrangere, problemesSauvegarde: [], refLieeCli: REF, ref: REF, accepterHorsTrain: true }).decision, "NO_GO");
  const trous = g.analyserLedger(locales, prefixe(359).filter((v) => v !== locales[5]));
  assert.equal(g.deciderPush({ analyse: trous, problemesSauvegarde: [], refLieeCli: REF, ref: REF, accepterHorsTrain: true }).decision, "NO_GO");
  for (const n of [0, 321]) {
    const a = g.analyserLedger(locales, prefixe(n));
    assert.equal(g.deciderPush({ analyse: a, problemesSauvegarde: [], refLieeCli: REF, ref: REF }).decision, "NO_GO");
    assert.equal(g.deciderPush({ analyse: a, problemesSauvegarde: [], refLieeCli: REF, ref: REF, accepterHorsTrain: true }).decision, "GO");
  }
  assert.equal(g.deciderPush({ analyse: g.analyserLedger(locales, locales), problemesSauvegarde: ["x"], refLieeCli: REF, ref: REF }).decision, "A_JOUR");
});

test("post-push : ledger exactement V8", () => {
  assert.equal(g.exigerLedgerV8(g.analyserLedger(locales, locales)), true);
  assert.throws(() => g.exigerLedgerV8(g.analyserLedger(locales, prefixe(359))), /inférieur à V8/);
  assert.throws(() => g.exigerLedgerV8(g.analyserLedger(locales, [...locales, "20260929999999"])), Refus);
});

test("sauvegarde : dossier de sortie hors dépôt et neuf", () => {
  assert.throws(() => exigerDossierSortie(join(ROOT, "backup")), /HORS du dépôt/);
  const d = mkdtempSync(join(tmpdir(), "v8-backup-"));
  assert.equal(exigerDossierSortie(d), d);
  writeFileSync(join(d, "x"), "1");
  assert.throws(() => exigerDossierSortie(d), /pas vide/);
});

test("pilote : aucune option par défaut, décision explicite, règle des 30 jours conservée", () => {
  const jour = "2026-10-01";
  assert.throws(() => validerDemande({ option: true, jusquAu: "2026-10-20", decision: "x", aujourdhui: jour }), /aucune option par défaut/);
  assert.throws(() => validerDemande({ option: "A", jusquAu: "2026-10-20", decision: undefined, aujourdhui: jour }), /--decision/);
  assert.throws(() => validerDemande({ option: "A", jusquAu: "2026-10-20", decision: "DECISION_REQUIRED_PILOT_SUBSCRIPTION=B:owner", aujourdhui: jour }), /--decision/);
  assert.throws(() => validerDemande({ option: "A", jusquAu: "2026-11-15", decision: "DECISION_REQUIRED_PILOT_SUBSCRIPTION=A:owner", aujourdhui: jour }), /30 jours/);
  assert.throws(() => validerDemande({ option: "B", jusquAu: "2026-10-01", decision: "DECISION_REQUIRED_PILOT_SUBSCRIPTION=B:owner", aujourdhui: jour }), /hors fenêtre/);
  assert.equal(validerDemande({ option: "A", jusquAu: "2026-10-31", decision: "DECISION_REQUIRED_PILOT_SUBSCRIPTION=A:owner-2026-10-01", aujourdhui: jour }).jours, 30);
  assert.equal(validerDemande({ option: "B", jusquAu: "2027-04-01", decision: "DECISION_REQUIRED_PILOT_SUBSCRIPTION=B:owner-2026-10-01", aujourdhui: jour }).option, "B");
  const d = analyserDiagnostic("PILOTE-BTP-V1|essai|2026-07-30|2026-08-29|true||suspended|false|28|gestion_pro=suspended\n");
  assert.equal(d.essaiEchu, true);
  assert.equal(d.membresActifs, 28);
  assert.equal(analyserDiagnostic(""), null);
});

test("pilote : SQL — données seulement, garde ledger V8, pas de règle Billing modifiée", () => {
  const sql = readFileSync(SQL_APPLICATION, "utf8").replace(/^--.*$/gm, "");
  assert.doesNotMatch(sql, /create\s+(or\s+replace\s+)?(function|policy|trigger)|alter\s+table|drop\s+|grant\s+|revoke\s+|disable\s+trigger/i);
  assert.match(sql, /count\(\*\) from supabase_migrations\.schema_migrations\) <> 371/);
  assert.match(sql, /'20260928000812'/);
  assert.match(sql, /v_aujourd \+ 30/);
  assert.match(sql, /stripe_subscription_id is not null/);
  assert.match(sql, /^begin;$/m);
  const diag = readFileSync(SQL_DIAGNOSTIC, "utf8").replace(/^--.*$/gm, "");
  assert.doesNotMatch(diag, /\b(update|insert|delete|truncate|alter|create)\b/i);
});

test("CLI : refus Production et dry-run jamais accepté pour un push", () => {
  const gate = resolve(import.meta.dirname, "v8-upgrade-gate.mjs");
  const lancer = (args, env = {}) => spawnSync(process.execPath, [gate, ...args], { encoding: "utf8", env: { PATH: process.env.PATH, ...env } });
  let r = lancer(["--plan"], { ELSATIA_PREVIEW_DB_URL: `postgresql://postgres:x@db.${PROD}.supabase.co:5432/postgres` });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /PRODUCTION/);
  r = lancer(["--plan"], { VERCEL_ENV: "production", ELSATIA_PREVIEW_DB_URL: "postgresql://x@127.0.0.1/x" });
  assert.equal(r.status, 2);
  const f = join(mkdtempSync(join(tmpdir(), "v8-ledger-")), "ledger.txt");
  writeFileSync(f, prefixe(359).join("\n"));
  r = lancer(["--authorize-push", "--ledger-file", f, "--dry-run-ref", REF]);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /dry-run/);
  r = lancer(["--plan", "--ledger-file", f, "--dry-run-ref", REF]);
  assert.equal(r.status, 0);
  assert.match(r.stdout, /train V7/);
  assert.match(r.stdout, /\[V8-CHEMIN\] V8 — \+12/);
  r = lancer(["--plan", "--local-harness"], { ELSATIA_PREVIEW_DB_URL: `postgresql://postgres:x@db.${REF}.supabase.co:5432/postgres` });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /base locale/);
});
