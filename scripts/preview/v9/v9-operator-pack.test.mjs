// Tests hors réseau du pack opérateur V9 GÉNÉRIQUE (scripts/preview/v9/*).
// Lancer : node --test scripts/preview/v9/v9-operator-pack.test.mjs   (npm run test:preview-v9)
//
// Aucun nombre de migrations n'est attendu « en dur » : chaque attente est dérivée du train
// local (supabase/migrations) et de versions identifiées (socle V8 = 813 ORIGINALE, V9.1).
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { loadJson, MANIFEST_PATH } from "../../lib/env-manifest-core.mjs";
import * as C from "./lib/constantes.mjs";
import { evaluerCible, refDepuisDb } from "./lib/cible.mjs";
import { classerMigration, instructions } from "./lib/classement.mjs";
import { comparerInventaire, lireInventaire, classe } from "./lib/env-scope.mjs";
import { brancheAutorisee, evaluerGit } from "./lib/git.mjs";
import { evaluerIban } from "./lib/iban.mjs";
import { analyserDryRun, analyserLedger, lignesTrain, lireLedger, planMigration, ErreurLedger } from "./lib/ledger.mjs";
import { evaluerPorte, FORMAT_RAPPORT } from "./lib/rapport.mjs";
import { verifierSauvegarde } from "./lib/sauvegarde.mjs";
import { cibleTrain, estPhase0, rangDe, ROOT, trainLocal, verifierTrainLocal } from "./lib/train.mjs";
import { classementV9 } from "./classify-migrations-v9.mjs";
import { evaluerReponse, ATTENTES_HTTP, evaluerControlesV9, NB_CONTROLES_V9 } from "./post-cutover-check.mjs";
import { verdictPack } from "./preflight-v9.mjs";
import { executer as checkLedgerCli } from "./check-ledger-v9.mjs";
import { executer as planCli } from "./migration-plan-v9.mjs";
import { executer as gateCli } from "./code-deploy-gate.mjs";
import { executer as guardCli } from "./guard-preview-target.mjs";
import { executer as envCli } from "./env-scope-check.mjs";
import { executer as ibanCli } from "./iban-k1-check.mjs";
import { dryRuns, fixtures, ledgersDerives } from "./fixtures/generate-fixtures.mjs";

const FIX = resolve(import.meta.dirname, "fixtures");
const local = trainLocal();
const cible = cibleTrain(local);
const RANG_SOCLE = rangDe(local, C.VERSION_SOCLE);
const RANG_V91 = rangDe(local, C.VERSION_V9_1);
const manifest = loadJson(ROOT, MANIFEST_PATH);
const fixture = (f) => readFileSync(resolve(FIX, f), "utf8");
const ledger = (f) => lireLedger(fixture(f));
const PREVIEW = C.REF_PREVIEW_AUTORISEE;
const PROD = C.REF_PRODUCTION_CONNUE;
// Valeurs factices construites à l'exécution (le scanner de secrets ne doit rien voir ici).
const motDePasse = ["MotDePasse", "Factice", "42"].join("");
const urlDb = (ref) => `postgresql://postgres:${motDePasse}@db.${ref}.supabase.co:5432/postgres`;
const capture = () => { const lignes = []; return { log: (l) => lignes.push(String(l)), texte: () => lignes.join("\n") }; };
const SHA_HEAD = "b".repeat(40);

// ── Train local ─────────────────────────────────────────────────────────────
test("train local : invariants historiques (813 ORIGINALE, V9.1, phase 0) ; TARGET_LEDGER calculé", () => {
  const r = verifierTrainLocal(local);
  assert.ok(r.ok, JSON.stringify(r.constats.filter((c) => !c.ok)));
  assert.deepEqual(r.cible, { nb: local.length, derniere: local.at(-1).version });
  assert.ok(RANG_SOCLE > 0 && RANG_V91 > RANG_SOCLE && cible.nb > RANG_V91);
  assert.equal(local[RANG_SOCLE - 1].sha256, C.SHA256_813_ORIGINAL);
  // Un train sans la 813 originale (ou sans le plancher) est refusé.
  const altere = local.map((m) => (m.version === C.VERSION_SOCLE ? { ...m, sha256: C.SHA256_813_NON_ORIGINAL } : m));
  assert.ok(verifierTrainLocal(altere).constats.some((c) => c.code === "TRAIN-813-ORIGINAL" && !c.ok));
  assert.ok(verifierTrainLocal(local.filter((m) => m.version !== C.VERSION_SOCLE)).constats.some((c) => c.code === "TRAIN-SOCLE" && !c.ok));
});

test("pack générique : aucune constante de nombre de migrations dans lib/*.mjs ni dans les outils", () => {
  const lib = resolve(import.meta.dirname, "lib");
  const fichiers = readdirSync(lib).filter((f) => f.endsWith(".mjs")).map((f) => [`lib/${f}`, readFileSync(resolve(lib, f), "utf8")]);
  for (const f of ["preflight-v9.mjs", "migration-plan-v9.mjs", "check-ledger-v9.mjs", "classify-migrations-v9.mjs", "post-cutover-check.mjs", "code-deploy-gate.mjs", "cutover-step.mjs", "v9-cutover.sh", "harness/build-socle.sh", "fixtures/generate-fixtures.mjs"]) {
    fichiers.push([f, readFileSync(resolve(import.meta.dirname, f), "utf8")]);
  }
  for (const [nom, src] of fichiers) {
    assert.doesNotMatch(src, /\b(17|372|389)\b/, `${nom} : nombre de migrations codé en dur`);
    assert.doesNotMatch(src, /\b(NB_SOCLE|NB_FINAL|NB_A_APPLIQUER|DERNIERE_FINALE|SHA_CANONIQUE)\b/, `${nom} : constante historique`);
    assert.doesNotMatch(src, /6392131a/, `${nom} : SHA canonique historique figé`);
  }
  assert.equal(Object.keys(C).filter((k) => /^NB_/.test(k)).length, 0);
});

// ── Phase 0 ─────────────────────────────────────────────────────────────────
test("phase 0 : marqueur détecté ; no-op reconnue si 300 au ledger ; refus sans 300", () => {
  assert.ok(estPhase0("-- elsatia:upgrade-phase0\n-- PONT\nselect 1;"));
  assert.ok(!estPhase0("-- pas de marqueur\n-- elsatia:upgrade-phase0 (cité en commentaire)\n"));
  const p0 = local.filter((m) => m.phase0);
  assert.ok(p0.some((m) => m.version === "20261003000201"), "pont phase 0 du train V9.2");
  assert.ok(p0.every((m) => m.version > C.VERSION_PREREQUIS_PHASE0 && m.version > C.VERSION_SOCLE));
  // Preview (300 au ledger) : no-op dans l'ordre lexical normal, signalé par le plan.
  const plan = planMigration(ledger("ledger-socle-v8-ok.json"), local, { exigerPreuve813: true });
  assert.deepEqual(plan.phase0, p0.map((m) => m.version));
  assert.ok(plan.preuves.find((p) => p.code === "PLAN-PHASE0").ok);
  const md = planCli([resolve(FIX, "ledger-socle-v8-ok.json")], { local, log: capture().log });
  assert.equal(md, 0);
  const c = capture();
  planCli([resolve(FIX, "ledger-socle-v8-ok.json")], { local, log: c.log });
  assert.match(c.texte(), /phase 0 : no-op en Preview, 300 déjà au ledger/);
  // Ordre lexical : le pont reste à sa place, entre ses voisins.
  const i = plan.aAppliquer.findIndex((m) => m.phase0);
  assert.ok(plan.aAppliquer[i - 1].version < plan.aAppliquer[i].version && plan.aAppliquer[i].version < plan.aAppliquer[i + 1].version);
  // Production (pas de 300 au ledger) : refus explicite, renvoi vers l'outil d'upgrade.
  const a = analyserLedger(ledger("ledger-sans-300-production.json"), local);
  assert.equal(a.verdict, "PREVIEW_LEDGER_DIVERGENCE");
  const d = a.divergences.find((x) => x.code === "LEDGER-PHASE0-PRODUCTION");
  assert.ok(d);
  assert.match(d.detail, /scripts\/upgrade\/preflight\.mjs --phase 0/);
  assert.throws(() => planMigration(ledger("ledger-sans-300-production.json"), local), ErreurLedger);
  // Ledger qui contient déjà les ponts : plus rien à signaler.
  assert.equal(analyserLedger(ledger("ledger-complet.json"), local, { attente: "post" }).phase0EnAttente.length, 0);
});

// ── Phase B : garde de cible ────────────────────────────────────────────────
test("garde : Preview correcte confirmée (toutes sources concordantes)", () => {
  const r = evaluerCible({ ref: PREVIEW, refLiee: `${PREVIEW}\n`, environment: "preview", branche: C.BRANCHE_TRAIN, env: { SUPABASE_PROJECT_REF: PREVIEW, NEXT_PUBLIC_SUPABASE_URL: `https://${PREVIEW}.supabase.co`, ELSATIA_PREVIEW_DB_URL: urlDb(PREVIEW) } });
  assert.equal(r.verdict, "TARGET_PREVIEW_CONFIRMED");
  assert.equal(r.ref, PREVIEW);
  assert.equal(refDepuisDb(`postgresql://postgres.${PREVIEW}:x@aws-0-eu-west-3.pooler.supabase.com:6543/postgres`), PREVIEW);
});

test("garde : Production refusée par toutes les voies", () => {
  const cas = [
    { ref: PROD },
    { refLiee: PROD },
    { env: { SUPABASE_PROJECT_REF: PROD } },
    { ref: PREVIEW, env: { NEXT_PUBLIC_SUPABASE_URL: `https://${PROD}.supabase.co` } },
    { ref: PREVIEW, env: { ELSATIA_PREVIEW_DB_URL: urlDb(PROD) } },
    { ref: PREVIEW, env: { ELSATIA_PREVIEW_DB_URL: `postgresql://postgres.${PROD}:x@aws-0-eu-west-3.pooler.supabase.com:6543/postgres` } },
    { ref: PREVIEW, environment: "production" },
    { ref: PREVIEW, env: { VERCEL_ENV: "production" } },
    { ref: PREVIEW, env: { ELSATIA_APPLICATION_ENV: "production" } },
    { ref: PREVIEW, urlsApp: ["https://app.elsatia.fr"] },
    { ref: PREVIEW, branche: "main" },
    { ref: PREVIEW, branche: "release/commercialisation-v1" },
  ];
  for (const c of cas) {
    const r = evaluerCible({ env: {}, ...c });
    assert.equal(r.verdict, "TARGET_REJECTED", JSON.stringify(c).replace(motDePasse, "***"));
    assert.equal(r.ok, false);
  }
  assert.ok(evaluerCible({ ref: PROD }).motifs.some((m) => m.includes("PRODUCTION")));
});

test("garde : ref inconnue, vide, absente, contradictoire, HEAD détaché → refus", () => {
  for (const c of [{ ref: "abcdefghijklmnopqrst" }, { ref: "" }, { ref: "  " }, {}, { ref: PREVIEW, env: { SUPABASE_PROJECT_REF: "abcdefghijklmnopqrst" } }, { ref: PREVIEW.toUpperCase() }, { ref: PREVIEW, branche: "HEAD" }, { ref: PREVIEW, env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.com" } }]) {
    assert.equal(evaluerCible({ env: {}, ...c }).verdict, "TARGET_REJECTED", JSON.stringify(c));
  }
});

test("garde (CLI) : verdict imprimé, aucun mot de passe dans la sortie", () => {
  const ok = capture();
  assert.equal(guardCli(["--ref", PREVIEW, "--no-linked", "--no-git"], { ELSATIA_PREVIEW_DB_URL: urlDb(PREVIEW) }, ok.log), 0);
  assert.match(ok.texte(), /TARGET_PREVIEW_CONFIRMED/);
  const ko = capture();
  assert.equal(guardCli(["--ref", PREVIEW, "--no-linked", "--no-git"], { ELSATIA_PREVIEW_DB_URL: urlDb(PROD) }, ko.log), 2);
  assert.match(ko.texte(), /TARGET_REJECTED/);
  for (const t of [ok.texte(), ko.texte()]) { assert.ok(!t.includes(motDePasse)); assert.ok(!t.includes("postgresql://")); }
});


// ── Phase C : ledger ────────────────────────────────────────────────────────
test("ledger : PENDING_MIGRATIONS = train − ledger, calculé pour le socle V8 ET pour V9.1", () => {
  for (const [f, version] of [["ledger-socle-v8-ok.json", C.VERSION_SOCLE], ["ledger-v9-1-ok.json", C.VERSION_V9_1]]) {
    const a = analyserLedger(ledger(f), local, { exigerPreuve813: true });
    const rang = rangDe(local, version);
    assert.equal(a.verdict, "PREVIEW_LEDGER_PREFIX_OK", f);
    assert.ok(a.conforme, f);
    assert.deepEqual(a.courant, { nb: rang, derniere: version });
    assert.deepEqual(a.cible, cible);
    assert.deepEqual(a.enAttente.map((m) => m.version), local.slice(rang).map((m) => m.version));
    assert.equal(a.enAttente.length, cible.nb - rang);
    const c = capture();
    assert.equal(checkLedgerCli([resolve(FIX, f), "--require-813-proof"], { local, log: c.log }), 0, f);
    assert.match(c.texte(), /PREVIEW_LEDGER_PREFIX_OK/);
    assert.match(c.texte(), new RegExp(`^CURRENT_LEDGER=${rang} \\(dernière ${version}\\)$`, "m"));
    assert.match(c.texte(), new RegExp(`^TARGET_LEDGER=${cible.nb} \\(dernière ${cible.derniere}\\)$`, "m"));
    assert.match(c.texte(), new RegExp(`^PENDING_MIGRATIONS=${cible.nb - rang} `, "m"));
  }
  // Les deux départs donnent deux PENDING différents, tous deux suffixes du train.
  const a = analyserLedger(ledger("ledger-socle-v8-ok.json"), local).enAttente.length;
  const b = analyserLedger(ledger("ledger-v9-1-ok.json"), local).enAttente.length;
  assert.equal(a - b, RANG_V91 - RANG_SOCLE);
  // Train local augmenté d'une migration : PENDING suit (aucune constante à mettre à jour).
  const plus = [...local, { version: (BigInt(cible.derniere) + 1n).toString(), name: "suivante_v1", fichier: "x.sql", sha256: "x" }];
  assert.equal(analyserLedger(ledger("ledger-v9-1-ok.json"), plus).enAttente.length, b + 1);
  assert.equal(analyserLedger(ledger("ledger-v9-1-ok.json"), plus).conforme, true);
});

test("ledger : --attendu-courant exige une valeur précise de CURRENT_LEDGER", () => {
  assert.equal(checkLedgerCli([resolve(FIX, "ledger-v9-1-ok.json"), "--attendu-courant", String(RANG_V91)], { local, log: () => {} }), 0);
  const c = capture();
  assert.equal(checkLedgerCli([resolve(FIX, "ledger-v9-1-ok.json"), "--attendu-courant", String(RANG_SOCLE)], { local, log: c.log }), 1);
  assert.match(c.texte(), /LEDGER-COURANT-ATTENDU/);
  assert.equal(checkLedgerCli([resolve(FIX, "ledger-v9-1-ok.json"), "--attendu-courant", "abc"], { local, log: () => {} }), 2);
  assert.throws(() => planMigration(ledger("ledger-v9-1-ok.json"), local, { attenduCourant: RANG_SOCLE }), ErreurLedger);
});

test("ledger : divergences détectées avec leur code exact", () => {
  const cas = [
    ["ledger-813-non-originale.json", "LEDGER-813-NON-ORIGINALE"],
    ["ledger-etrangere.json", "LEDGER-ETRANGERE"],
    ["ledger-ordre-incorrect.json", "LEDGER-ORDRE"],
    ["ledger-version-manquante.json", "LEDGER-TROU"],
    ["ledger-ref-production.json", "LEDGER-REF-PRODUCTION"],
    ["ledger-sans-300-production.json", "LEDGER-PHASE0-PRODUCTION"],
  ];
  for (const [f, code] of cas) {
    const a = analyserLedger(ledger(f), local);
    assert.equal(a.verdict, "PREVIEW_LEDGER_DIVERGENCE", f);
    assert.ok(a.divergences.some((d) => d.code === code), `${f} : ${JSON.stringify(a.divergences)}`);
    assert.equal(a.conforme, false);
    const c = capture();
    assert.equal(checkLedgerCli([resolve(FIX, f)], { local, log: c.log }), 1, f);
    assert.match(c.texte(), /PREVIEW_LEDGER_DIVERGENCE/);
  }
  // Ledger sous le plancher historique (813 absente) : refusé même s'il est un préfixe exact.
  const sous = { format: "json", projectRef: PREVIEW, fonction813: null, entries: local.slice(0, RANG_SOCLE - 1).map((m) => ({ version: m.version, name: m.name, sha256: null, marqueur813: null })) };
  assert.ok(analyserLedger(sous, local).divergences.some((d) => d.code === "LEDGER-813-ABSENTE"));
});

test("ledger : nom différent, doublon, checksum différent, 813 sans preuve exigée", () => {
  const base = ledger("ledger-socle-v8-ok.json");
  const nom = { ...base, entries: base.entries.map((e, i) => (i === 10 ? { ...e, name: "autre_nom" } : e)) };
  assert.ok(analyserLedger(nom, local).divergences.some((d) => d.code === "LEDGER-NOM"));
  const doublon = { ...base, entries: [...base.entries.slice(0, 5), base.entries[4], ...base.entries.slice(5)] };
  assert.ok(analyserLedger(doublon, local).divergences.some((d) => d.code === "LEDGER-DOUBLON"));
  const somme = { ...base, entries: base.entries.map((e, i) => (i === 3 ? { ...e, sha256: "0".repeat(64) } : e)) };
  assert.ok(analyserLedger(somme, local).divergences.some((d) => d.code === "LEDGER-CHECKSUM"));
  const shaOk = { ...base, entries: base.entries.map((e, i) => ({ ...e, sha256: local[i].sha256 })) };
  assert.equal(analyserLedger(shaOk, local).verdict, "PREVIEW_LEDGER_PREFIX_OK");
  const sansPreuve = lireLedger(fixture("migration-list-socle-v8.txt"));
  assert.equal(analyserLedger(sansPreuve, local).verdict, "PREVIEW_LEDGER_PREFIX_OK");
  assert.ok(analyserLedger(sansPreuve, local, { exigerPreuve813: true }).divergences.some((d) => d.code === "LEDGER-813-NON-PROUVEE"));
  // Format psql -At.
  const psql = lireLedger(local.slice(0, RANG_SOCLE).map((m) => `${m.version}|${m.name}`).join("\n"));
  assert.equal(analyserLedger(psql, local).verdict, "PREVIEW_LEDGER_PREFIX_OK");
});

test("ledger : train complet → ALREADY (pre, code 3) / COMPLETE (post) ; partiel = préfixe exact (pre et reprise)", () => {
  const post = analyserLedger(ledger("ledger-complet.json"), local, { attente: "post", exigerPreuve813: true });
  assert.equal(post.verdict, "PREVIEW_LEDGER_V9_COMPLETE");
  assert.equal(post.enAttente.length, 0);
  assert.deepEqual(post.courant, cible);
  const c = capture();
  assert.equal(checkLedgerCli([resolve(FIX, "ledger-complet.json")], { local, log: c.log }), 3);
  assert.match(c.texte(), /PREVIEW_LEDGER_ALREADY_V9/);
  assert.match(c.texte(), /^PENDING_MIGRATIONS=0$/m);
  assert.equal(checkLedgerCli([resolve(FIX, "ledger-complet.json"), "--expect", "post"], { local, log: () => {} }), 0);
  for (const attente of ["pre", "reprise"]) {
    const p = analyserLedger(ledger("ledger-partiel.json"), local, { attente });
    assert.equal(p.verdict, "PREVIEW_LEDGER_PREFIX_OK");
    assert.equal(p.conforme, true, attente);
  }
  assert.equal(analyserLedger(ledger("ledger-partiel.json"), local, { attente: "post" }).conforme, false);
  assert.equal(analyserLedger(ledger("ledger-socle-v8-ok.json"), local, { attente: "post" }).conforme, false);
});

// ── Phase D : plan ──────────────────────────────────────────────────────────
test("plan : PENDING exactes, toutes postérieures au ledger, preuves vertes ; échec si ledger non préfixe", () => {
  for (const [f, version] of [["ledger-socle-v8-ok.json", C.VERSION_SOCLE], ["ledger-v9-1-ok.json", C.VERSION_V9_1]]) {
    const plan = planMigration(ledger(f), local, { exigerPreuve813: true });
    const rang = rangDe(local, version);
    assert.deepEqual(plan.courant, { nb: rang, derniere: version });
    assert.deepEqual(plan.cible, cible);
    assert.equal(plan.aAppliquer[0].rang, rang + 1);
    assert.equal(plan.aAppliquer[0].version, local[rang].version);
    assert.equal(plan.aAppliquer.at(-1).version, cible.derniere);
    assert.ok(plan.aAppliquer.every((m) => m.version > version));
    assert.ok(plan.preuves.every((p) => p.ok), JSON.stringify(plan.preuves.filter((p) => !p.ok)));
    assert.deepEqual(plan.aAppliquer.map((m) => m.version), local.slice(rang).map((m) => m.version));
    assert.deepEqual(lignesTrain(plan).map((l) => l.split("=")[0]), ["CURRENT_LEDGER", "TARGET_LEDGER", "PENDING_MIGRATIONS"]);
  }
  for (const f of ["ledger-etrangere.json", "ledger-813-non-originale.json", "ledger-complet.json", "ledger-sans-300-production.json", "ledger-ref-production.json"]) {
    assert.throws(() => planMigration(ledger(f), local), ErreurLedger, f);
  }
  const c = capture();
  assert.equal(planCli([resolve(FIX, "ledger-complet.json")], { local, log: c.log }), 1);
  assert.match(c.texte(), /PLAN_REFUSED/);
});

test("dry-run : exactement les PENDING accepté ; une de moins, une de plus, ordre, --include-all, migration repair refusés", () => {
  const plan = planMigration(ledger("ledger-socle-v8-ok.json"), local);
  assert.ok(analyserDryRun(fixture("dry-run-exact.txt"), plan).ok);
  for (const f of ["dry-run-une-de-moins.txt", "dry-run-une-de-plus.txt", "dry-run-include-all.txt"]) assert.equal(analyserDryRun(fixture(f), plan).ok, false, f);
  assert.match(analyserDryRun(fixture("dry-run-include-all.txt"), plan).motifs.join(), /include-all/);
  const inverse = fixture("dry-run-exact.txt").split("\n");
  [inverse[2], inverse[3]] = [inverse[3], inverse[2]];
  assert.equal(analyserDryRun(inverse.join("\n"), plan).ok, false);
  assert.equal(analyserDryRun(`${fixture("dry-run-exact.txt")}\nTry supabase migration repair`, plan).ok, false);
  // Fixtures générées pour un autre ledger courant (V9.1) : exact accepté, ±1 et include-all refusés.
  const planV91 = planMigration(ledger("ledger-v9-1-ok.json"), local);
  const jeu = dryRuns(local, C.VERSION_V9_1);
  assert.ok(analyserDryRun(jeu["dry-run-exact.txt"], planV91).ok);
  for (const f of ["dry-run-une-de-moins.txt", "dry-run-une-de-plus.txt", "dry-run-include-all.txt"]) assert.equal(analyserDryRun(jeu[f], planV91).ok, false, f);
  // Le dry-run du socle V8 ne correspond pas au plan depuis V9.1 (et inversement).
  assert.equal(analyserDryRun(fixture("dry-run-exact.txt"), planV91).ok, false);
  // CLI.
  const c = capture();
  assert.equal(planCli([resolve(FIX, "ledger-socle-v8-ok.json"), "--dry-run", resolve(FIX, "dry-run-exact.txt")], { local, log: c.log }), 0);
  assert.match(c.texte(), /DRY_RUN_MATCHES_PLAN/);
  assert.equal(planCli([resolve(FIX, "ledger-socle-v8-ok.json"), "--dry-run", resolve(FIX, "dry-run-include-all.txt")], { local, log: () => {} }), 1);
});

test("fixtures : générées depuis le train, à jour, sans orpheline ; jeu « courant » paramétrable", () => {
  for (const [nom, contenu] of Object.entries(fixtures(local))) assert.equal(fixture(nom), contenu, nom);
  const r = spawnSync(process.execPath, [resolve(FIX, "generate-fixtures.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stdout);
  const v91 = ledgersDerives(local, C.VERSION_V9_1);
  assert.equal(analyserLedger(lireLedger(v91["ledger-partiel.json"]), local).verdict, "PREVIEW_LEDGER_PREFIX_OK");
  assert.ok(analyserLedger(lireLedger(v91["ledger-partiel.json"]), local).courant.nb > RANG_V91);
  assert.equal(analyserLedger(lireLedger(v91["ledger-version-manquante.json"]), local).verdict, "PREVIEW_LEDGER_DIVERGENCE");
  // Seuls « 813 » et « 300 » (identités de migrations) peuvent figurer dans un nom ; aucun compteur.
  for (const n of Object.keys(fixtures(local))) assert.doesNotMatch(n.replace(/813|300/g, ""), /\d{2,}/, `${n} : nombre codé dans le nom`);
});

// ── Phase F : script de cutover (refus d'usage, sans réseau) ───────────────
test("cutover : --include-all, apply sans confirmation, confirmation Production, --out dans le dépôt → refus (2)", () => {
  const out = mkdtempSync(join(tmpdir(), "v9-cut-"));
  const sh = (args) => spawnSync("bash", [resolve(import.meta.dirname, "v9-cutover.sh"), ...args], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME } });
  const cas = [
    ["--out", out, "--include-all"],
    ["--out", out, "--include-all=true"],
    ["--out", out, "--apply-preview"],
    ["--out", out, "--apply-preview", "--confirm-ref", PROD],
    ["--out", out, "--apply-preview", "--confirm-ref", "abcdefghijklmnopqrst"],
    ["--out", resolve(ROOT, "tmp-v9-out")],
    ["--out", out, "--offline-ledger", resolve(FIX, "ledger-socle-v8-ok.json"), "--apply-preview", "--confirm-ref", PREVIEW],
    ["--out", out, "--verify-only", "--apply-preview", "--confirm-ref", PREVIEW],
    ["--out", out, "--attendu-courant", "abc"],
  ];
  for (const a of cas) {
    const r = sh(a);
    assert.equal(r.status, 2, `${a.join(" ")}\n${r.stderr}`);
    assert.match(r.stderr, /REFUS/);
  }
  spawnSync("rm", ["-rf", resolve(ROOT, "tmp-v9-out")]);
  // Aucune ligne exécutable de db push n'ajoute --include-all.
  const src = readFileSync(resolve(import.meta.dirname, "v9-cutover.sh"), "utf8");
  for (const l of src.split("\n").filter((x) => /db push/.test(x) && !/^\s*#/.test(x))) assert.doesNotMatch(l, /--include-all/);
});

// ── Git ─────────────────────────────────────────────────────────────────────
test("git : base V9.1 non ancêtre, branche incorrecte ou interdite, worktree sale → refus ; SHA déployé = HEAD", () => {
  const sain = { head: SHA_HEAD, branche: C.BRANCHE_TRAIN, sale: 0, basePresente: true, ancetre: true };
  const r = evaluerGit(sain);
  assert.ok(r.ok, JSON.stringify(r.constats));
  assert.equal(r.head, SHA_HEAD);
  for (const b of ["integration/elsatia-canonical-train-v9.2", "integration/elsatia-canonical-train-v10", "integration/elsatia-canonical-train-v9.3", "claude/focused-ptolemy-kwdju8"]) assert.ok(brancheAutorisee(b), b);
  for (const b of ["main", "master", "production", "release/commercialisation-v1", "feature/autre", "HEAD", "", "integration/elsatia-canonical-train-v9-final-x", "claude/zen-clarke-qchnnt"]) assert.ok(!brancheAutorisee(b), b);
  const cas = [
    [{ ancetre: false }, "GIT-BASE-ANCETRE"],
    [{ basePresente: false, ancetre: false }, "GIT-BASE-CONNUE"],
    [{ branche: "main" }, "GIT-BRANCHE"],
    [{ branche: "release/x" }, "GIT-BRANCHE"],
    [{ branche: "feature/autre" }, "GIT-BRANCHE"],
    [{ branche: "HEAD" }, "GIT-BRANCHE"],
    [{ sale: 3 }, "GIT-PROPRE"],
    [{ head: "" }, "GIT-HEAD"],
  ];
  for (const [modif, code] of cas) {
    const e = evaluerGit({ ...sain, ...modif });
    assert.equal(e.ok, false, code);
    assert.ok(e.constats.some((c) => c.code === code && !c.ok), code);
  }
});

// ── Phase H : IBAN k1 ───────────────────────────────────────────────────────
test("IBAN : k1 absente → IBAN_K1_MISSING + BLOCKER_IBAN_KEY ; présente → READY ; registre sans k1 → BLOCKER", () => {
  const sans = evaluerIban(lireInventaire(fixture("vercel-env-preview-k1-absente.json"), manifest));
  assert.equal(sans.verdict, "IBAN_K1_MISSING");
  assert.equal(sans.blocker, "BLOCKER_IBAN_KEY");
  assert.ok(sans.fluxIndisponibles.length >= 2);
  const inv = lireInventaire(fixture("vercel-env-preview-ok.json"), manifest);
  assert.equal(evaluerIban(inv).verdict, "IBAN_K1_READY");
  assert.equal(evaluerIban(inv, JSON.parse(fixture("bank-keys-status-k1-attestee.json"))).attestation, "ATTESTEE");
  const nonAttestee = evaluerIban(inv, JSON.parse(fixture("bank-keys-status-k1-non-attestee.json")));
  assert.equal(nonAttestee.attestation, "NON_ATTESTEE");
  assert.ok(nonAttestee.constats.some((c) => c.code === "IBAN-K1-ATTESTEE" && !c.ok));
  const sansK1 = evaluerIban(inv, { environnement: { cles: ["k2"] }, registre: [{ cle_id: "k2", statut: "active", attestee: true }], controle: { ok: true } });
  assert.equal(sansK1.blocker, "BLOCKER_IBAN_KEY");
  const vide = evaluerIban(lireInventaire("BANK_DATA_ENCRYPTION_KEY=\n", manifest));
  assert.equal(vide.verdict, "IBAN_K1_MISSING");
  const incoherent = evaluerIban(lireInventaire("BANK_DATA_ENCRYPTION_KEY=x\nBANK_DATA_ENCRYPTION_KEYS=y\n", manifest));
  assert.ok(incoherent.constats.some((c) => c.code === "IBAN-ACTIVE-ID" && !c.ok));
});

// ── Phase I : environnement ─────────────────────────────────────────────────
test("env : inventaire conforme OK ; classes LIVE_ONLY / TEST_ONLY / DEPRECATED", () => {
  const r = comparerInventaire(manifest, lireInventaire(fixture("vercel-env-preview-ok.json"), manifest));
  assert.equal(r.verdict, "ENV_SCOPE_OK", JSON.stringify(r.erreurs));
  const par = (n) => manifest.variables.find((v) => v.name === n);
  assert.equal(classe(par("CRON_SECRET")), "LIVE_ONLY");
  assert.equal(classe(par("PW_CHROME_PATH")), "TEST_ONLY");
  assert.equal(classe(par("ELSATIA_ENV")), "DEPRECATED");
  assert.equal(classe(par("BANK_DATA_ENCRYPTION_KEY")), "REQUIRED");
  assert.equal(r.lignes.find((l) => l.name === "CRON_SECRET").statut, "PRESENT");
});

test("env : Stripe Live actif en Preview → refus ; MISSING / EMPTY / WRONG_SCOPE", () => {
  const live = comparerInventaire(manifest, lireInventaire(fixture("vercel-env-preview-stripe-live.env"), manifest));
  assert.equal(live.verdict, "ENV_SCOPE_BLOCKED");
  assert.ok(live.erreurs.some((e) => e.code === "ENV-STRIPE-LIVE" && e.name === "STRIPE_SECRET_KEY"));
  assert.ok(live.erreurs.some((e) => e.code === "ENV-STRIPE-LIVE" && e.name === "STRIPE_WEBHOOK_EXPECTED_MODE"));
  assert.ok(live.erreurs.some((e) => e.code === "ENV-FLAG" && e.name === "ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE"));
  const ls = [
    "> Environment Variables found for elsatia/elsatia-preview",
    " name                         value               environments        created",
    " SUPABASE_SERVICE_ROLE_KEY    Encrypted           Production          2d ago",
    " CRON_SECRET                  Encrypted           Preview             2d ago",
  ].join("\n");
  const r = comparerInventaire(manifest, lireInventaire(ls, manifest));
  const statut = (n) => r.lignes.find((l) => l.name === n).statut;
  assert.equal(statut("SUPABASE_SERVICE_ROLE_KEY"), "WRONG_SCOPE");
  assert.equal(statut("CRON_SECRET"), "WRONG_SCOPE");
  assert.equal(statut("BANK_DATA_ENCRYPTION_KEY"), "MISSING");
  const vide = comparerInventaire(manifest, lireInventaire("RATE_LIMIT_HMAC_KEY=\n", manifest));
  assert.equal(vide.lignes.find((l) => l.name === "RATE_LIMIT_HMAC_KEY").statut, "EMPTY");
  const prodUrl = comparerInventaire(manifest, lireInventaire(`NEXT_PUBLIC_SUPABASE_URL=https://${PROD}.supabase.co\n`, manifest));
  assert.ok(prodUrl.erreurs.some((e) => e.code === "ENV-SUPABASE-REF"));
});

test("sorties : aucun secret affiché (env, IBAN, garde, ledger)", () => {
  const dir = mkdtempSync(join(tmpdir(), "v9-sec-"));
  const secrets = [["sk", "live", "Z".repeat(6)].join("_"), `Cle${"Q".repeat(12)}Secrete`, motDePasse];
  writeFileSync(join(dir, "pull.env"), [`STRIPE_SECRET_KEY=${secrets[0]}`, `BANK_DATA_ENCRYPTION_KEY=${secrets[1]}`, `SUPABASE_SERVICE_ROLE_KEY=${secrets[2]}`, "STRIPE_WEBHOOK_EXPECTED_MODE=test", `NEXT_PUBLIC_SUPABASE_URL=https://${PREVIEW}.supabase.co`].join("\n"));
  const sorties = [];
  for (const run of [
    (log) => envCli([join(dir, "pull.env"), "--all"], { manifest, log }),
    (log) => envCli([join(dir, "pull.env"), "--json"], { manifest, log }),
    (log) => ibanCli([join(dir, "pull.env")], { manifest, log }),
    (log) => guardCli(["--ref", PREVIEW, "--no-linked", "--no-git"], { ELSATIA_PREVIEW_DB_URL: urlDb(PREVIEW), STRIPE_SECRET_KEY: secrets[0] }, log),
  ]) { const c = capture(); run(c.log); sorties.push(c.texte()); }
  const tout = sorties.join("\n");
  assert.match(tout, /ENV-STRIPE-LIVE/);
  for (const s of secrets) assert.ok(!tout.includes(s), "valeur secrète affichée");
});

// ── Phase E : sauvegarde déclarée ───────────────────────────────────────────
test("sauvegarde : conforme ; Auth absente, fichier dans le dépôt, trop ancienne, autre projet → BACKUP_MISSING", () => {
  const dir = mkdtempSync(join(tmpdir(), "v9-bak-"));
  const f = (n, t) => { writeFileSync(join(dir, n), t); return join(dir, n); };
  const art = [
    { kind: "schema", path: f("s.sql", "-- PostgreSQL database dump\nCREATE TABLE public.x (id int);\n") },
    { kind: "data", path: f("d.sql", 'COPY "public"."x" (id) FROM stdin;\n1\n\\.\n') },
    { kind: "auth", path: f("a.sql", 'COPY "auth"."users" (id) FROM stdin;\n\\.\n') },
    { kind: "migrations_data", path: f("m.sql", "COPY supabase_migrations.schema_migrations (version, name) FROM stdin;\n\\.\n") },
    { kind: "ledger", path: f("l.json", fixture("ledger-socle-v8-ok.json")) },
  ];
  const maintenant = new Date("2026-10-03T08:00:00Z");
  const m = { project_ref: PREVIEW, created_at: "2026-10-03T07:00:00Z", artefacts: art };
  const opts = { racineDepot: ROOT, local, maintenant };
  assert.equal(verifierSauvegarde(m, opts).verdict, "BACKUP_DECLARED_OK");
  assert.equal(verifierSauvegarde({ ...m, artefacts: art.filter((a) => a.kind !== "auth") }, opts).verdict, "BACKUP_MISSING");
  assert.equal(verifierSauvegarde({ ...m, created_at: "2026-10-01T07:00:00Z" }, opts).verdict, "BACKUP_MISSING");
  assert.equal(verifierSauvegarde({ ...m, project_ref: PROD }, opts).verdict, "BACKUP_MISSING");
  assert.equal(verifierSauvegarde({ ...m, artefacts: [...art.slice(0, 4), { kind: "ledger", path: f("l2.json", fixture("ledger-etrangere.json")) }] }, opts).verdict, "BACKUP_MISSING");
  assert.equal(verifierSauvegarde({ ...m, artefacts: art.filter((a) => a.kind !== "migrations_data") }, opts).verdict, "BACKUP_MISSING");
  assert.equal(verifierSauvegarde({ ...m, artefacts: [...art.slice(1), { kind: "schema", path: resolve(ROOT, "package.json") }] }, opts).verdict, "BACKUP_MISSING");
  assert.equal(verifierSauvegarde({ ...m, artefacts: [{ ...art[0], sha256: "0".repeat(64) }, ...art.slice(1)] }, opts).verdict, "BACKUP_MISSING");
  assert.equal(verifierSauvegarde({ ...m, artefacts: [{ kind: "auth", path: f("vide.sql", "") }, ...art.filter((a) => a.kind !== "auth")] }, opts).verdict, "BACKUP_MISSING");
});


// ── Phase G : porte base → code ─────────────────────────────────────────────
test("porte code : false tant que ledger complet + DB verify + contrôles V9 + SHA de HEAD ne sont pas confirmés", () => {
  const maintenant = new Date("2026-10-03T09:00:00Z");
  const complet = { format: FORMAT_RAPPORT, ref: PREVIEW, sha_deploye: SHA_HEAD, mode: "apply", maj_le: "2026-10-03T08:30:00Z", etapes: { ledger_apres: { verdict: "PREVIEW_LEDGER_V9_COMPLETE" }, db_verify: { code: 0 }, controles_v9: { ok: true } } };
  assert.equal(evaluerPorte(complet, { maintenant, shaHead: SHA_HEAD }).autorise, true);
  assert.equal(evaluerPorte(complet, { maintenant }).autorise, false, "SHA de HEAD inconnu");
  const cas = [
    null,
    { ...complet, mode: "dry-run" },
    { ...complet, ref: PROD },
    { ...complet, sha_deploye: C.SHA_V8_PREVIEW },
    { ...complet, sha_deploye: undefined },
    { ...complet, maj_le: "2026-10-01T08:30:00Z" },
    { ...complet, etapes: { ...complet.etapes, ledger_apres: { verdict: "PREVIEW_LEDGER_PREFIX_OK" } } },
    { ...complet, etapes: { ...complet.etapes, db_verify: { code: 1 } } },
    { ...complet, etapes: { ...complet.etapes, controles_v9: { ok: false } } },
    { ...complet, etapes: { ledger_apres: complet.etapes.ledger_apres } },
  ];
  for (const r of cas) assert.equal(evaluerPorte(r, { maintenant, shaHead: SHA_HEAD }).autorise, false, JSON.stringify(r));
  assert.equal(evaluerPorte(complet, { maintenant, shaHead: SHA_HEAD, ledgerPost: { verdict: "PREVIEW_LEDGER_DIVERGENCE" } }).autorise, false);
  // CLI : le rapport doit porter le SHA de HEAD.
  const dir = mkdtempSync(join(tmpdir(), "v9-gate-"));
  writeFileSync(join(dir, "r.json"), JSON.stringify({ ...complet, maj_le: new Date().toISOString() }));
  const ok = capture();
  assert.equal(gateCli(["--report", join(dir, "r.json"), "--ledger", resolve(FIX, "ledger-complet.json")], { log: ok.log, shaHead: SHA_HEAD, local }), 0, ok.texte());
  assert.match(ok.texte(), /CODE_DEPLOY_ALLOWED=true/);
  const ko = capture();
  assert.equal(gateCli(["--report", join(dir, "r.json")], { log: ko.log, shaHead: "c".repeat(40), local }), 1);
  assert.match(ko.texte(), /CODE_DEPLOY_ALLOWED=false/);
  assert.equal(gateCli(["--report", join(dir, "r.json"), "--ledger", resolve(FIX, "ledger-v9-1-ok.json")], { log: () => {}, shaHead: SHA_HEAD, local }), 1);
});

// ── Phase K : classement ────────────────────────────────────────────────────
test("classement : PENDING depuis le socle V8 (défaut) ou depuis un ledger fourni ; notes de retour", () => {
  const depuisSocle = classementV9({ local });
  assert.deepEqual(depuisSocle.map((m) => m.version), local.slice(RANG_SOCLE).map((m) => m.version));
  const depuisV91 = classementV9({ local, ledger: ledger("ledger-v9-1-ok.json") });
  assert.deepEqual(depuisV91.map((m) => m.version), local.slice(RANG_V91).map((m) => m.version));
  assert.throws(() => classementV9({ local, ledger: ledger("ledger-etrangere.json") }), ErreurLedger);
  const par = new Map(depuisSocle.map((m) => [m.version, m]));
  // Attendus figés des migrations historiques (classement depuis le SQL).
  assert.equal(par.get("20261002000901").classe, "FORWARD_ONLY");
  assert.equal(par.get("20261002001112").classe, "FORWARD_ONLY");
  assert.equal(par.get("20261002001113").classe, "REVERSIBLE");
  assert.match(par.get("20261002001001").note, /SÉCURITÉ/);
  // Notes des migrations sensibles du train V9.2.
  assert.match(par.get("20261003001503").note, /lock_timeout 10 s/);
  assert.match(par.get("20261003001503").note, /rollback_20261003001503\.sql/);
  assert.match(par.get("20261003001501").note, /rollback_20261003001501\.sql/);
  assert.match(par.get("20261003001407").note, /ne JAMAIS rouvrir la colonne/);
  for (const v of ["20261003000201", "20261003000202"]) assert.match(par.get(v).note, /no-op en Preview/);
  assert.equal(par.get("20261003000201").phase0, true);
  // Plan généré : chaque migration en attente depuis le socle V8 y a sa classe.
  const doc = readFileSync(resolve(ROOT, "docs/qualification/preview-pack/V9_MIGRATION_PLAN.generated.md"), "utf8");
  for (const m of depuisSocle) assert.match(doc, new RegExp(`\\| \`${m.version}\` \\|[^\\n]*\\| ${m.classe} \\|`), m.version);
  assert.equal(planCli(["--check"], { local, log: () => {} }), 0);
  assert.match(readFileSync(resolve(ROOT, "docs/runbooks/ELSATIA_V9_PREVIEW_ROLLBACK.md"), "utf8"), /V9_MIGRATION_PLAN\.generated\.md/);
});

test("classement : règles (corps de fonction ignorés, premier niveau analysé, inconnu = pire cas)", () => {
  const fn = "create or replace function public.f() returns void language plpgsql as $$ begin update public.t set a = 1; delete from public.t; end $$;";
  assert.equal(classerMigration(fn).classe, "REVERSIBLE");
  assert.equal(classerMigration("update public.t set a = 1;").classe, "RESTORE_REQUIRED");
  assert.equal(classerMigration("alter table public.t drop column a;").classe, "RESTORE_REQUIRED");
  assert.equal(classerMigration("alter table public.t add column a int;").classe, "FORWARD_ONLY");
  assert.equal(classerMigration("insert into public.t values (1);").classe, "FORWARD_ONLY");
  assert.equal(classerMigration("create policy p on public.t for select using (true); grant select on public.t to authenticated;").classe, "REVERSIBLE");
  assert.equal(classerMigration("vacuum public.t;").classe, "RESTORE_REQUIRED");
  assert.equal(classerMigration("do $$ begin execute format('drop table %s', 'public.t'); end $$;").classe, "RESTORE_REQUIRED");
  assert.equal(classerMigration("do $$ begin execute format('revoke all on function %s from anon', 'f'); end $$;").classe, "REVERSIBLE");
  assert.equal(classerMigration("-- update public.t set a = 1;\nselect 1;").classe, "FORWARD_ONLY");
  assert.ok(instructions("comment on table t is 'update; delete';").every((i) => i.type === "META"));
});


// ── Phase L : recette post-cutover ──────────────────────────────────────────
test("post-cutover : SQL V9 = fonctions du train ; attendu du ledger généré ; contrôles comptés ; HTTP protégé 200 = fuite", async () => {
  const sql = readFileSync(resolve(ROOT, "docs/runbooks/sql/ELSATIA_V9_POST_CUTOVER_CHECKS.sql"), "utf8");
  const listeSql = [...sql.slice(sql.indexOf("fonctions_v9(nom)"), sql.indexOf("])),")).matchAll(/'([a-z_]+\.[a-z_0-9]+)'/g)].map((m) => m[1]);
  const definies = new Set();
  for (const m of local) for (const x of readFileSync(resolve(ROOT, "supabase/migrations", m.fichier), "utf8").matchAll(/create\s+or\s+replace\s+function\s+([a-z_]+\.[a-z_0-9]+)/gi)) definies.add(x[1].toLowerCase());
  const absentes = listeSql.filter((f) => !definies.has(f));
  assert.deepEqual(absentes, [], "fonction vérifiée par le SQL post-cutover mais définie par aucune migration");
  for (const f of ["public.push_reserver_lot_service", "public.pointages_couts_appliques", "public.plateforme_definir_url_preview_application"]) assert.ok(listeSql.includes(f), f);
  // Contrôle 1 : attendu du ledger lu depuis le bloc généré, égal au train local.
  assert.match(sql, new RegExp(`-- \\[train-expectations\\][^\\n]*\\nattendu_train\\(nb, derniere\\) as \\(values \\(${cible.nb}, '${cible.derniere}'\\)\\),\\n-- \\[/train-expectations\\]`));
  assert.doesNotMatch(sql.slice(sql.indexOf("controles(n,")), /= \d{3}\b|'\d{14}'/, "contrôle avec un nombre ou une version figés");
  const te = await import("../train-expectations.mjs");
  assert.ok(te.SQL_SYNCHRONISES.includes(te.V9_CHECKS_SQL));
  assert.deepEqual(te.synchroniser({ ecrire: false }).changes, []);
  // Nombre de contrôles compté dans le SQL.
  assert.equal(NB_CONTROLES_V9, [...sql.matchAll(/^\s+select (\d+), '/gm)].length);
  assert.ok(NB_CONTROLES_V9 >= 14);
  const verts = Array.from({ length: NB_CONTROLES_V9 }, (_, i) => `${i + 1}|c${i + 1}|a|o|t|t`).join("\n");
  assert.ok(evaluerControlesV9(verts).ok);
  assert.equal(evaluerControlesV9(verts.replace("2|c2|a|o|t|t", "2|c2|a|o|f|t")).ok, false);
  assert.equal(evaluerControlesV9(verts.split("\n").slice(0, -1).join("\n")).ok, false);
  const dash = ATTENTES_HTTP.find((a) => a.path === "/dashboard");
  assert.equal(evaluerReponse(dash, { status: 200 }).etat, "ko");
  assert.equal(evaluerReponse(dash, { status: 307, location: "/login?next=/dashboard" }).etat, "ok");
  assert.equal(evaluerReponse(ATTENTES_HTTP.find((a) => a.path === "/api/health"), { status: 503, contentType: "application/json" }).etat, "ko");
  assert.equal(evaluerReponse(ATTENTES_HTTP.find((a) => a.path === "/api/elsatia-identity/jwks"), { status: 503 }).etat, "warn");
});


// ── Phase M : verdict ───────────────────────────────────────────────────────
test("préflight : verdict READY / PARTIAL / BLOCKED", () => {
  const v = (ok) => ({ ok });
  assert.equal(verdictPack([v(true)], []), "PREVIEW_V9_OPERATOR_PACK_READY");
  assert.equal(verdictPack([v(true)], [v(false)]), "PREVIEW_V9_OPERATOR_PACK_PARTIAL");
  assert.equal(verdictPack([v(false)], [v(true)]), "PREVIEW_V9_OPERATOR_PACK_BLOCKED");
});

test("fixtures : aucune valeur qui ressemble à un vrai secret", () => {
  const motifs = [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/, /\bwhsec_[A-Za-z0-9]{20,}\b/, /\beyJ[A-Za-z0-9_-]{20,}\./, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
  mkdirSync(FIX, { recursive: true });
  for (const f of spawnSync("ls", [FIX], { encoding: "utf8" }).stdout.split("\n").filter(Boolean)) {
    const t = readFileSync(resolve(FIX, f), "utf8");
    for (const m of motifs) assert.ok(!m.test(t), `${f} : ${m}`);
  }
});

test("reprise (cas A) : préfixe exact partiel accepté (pre et reprise), plan = migrations restantes", () => {
  const partiel = ledger("ledger-partiel.json");
  const a = analyserLedger(partiel, local, { attente: "reprise" });
  assert.equal(a.conforme, true);
  assert.ok(a.courant.nb > RANG_SOCLE && a.courant.nb < cible.nb);
  assert.equal(analyserLedger(ledger("ledger-complet.json"), local, { attente: "reprise" }).conforme, false);
  const plan = planMigration(partiel, local, { reprise: true, exigerPreuve813: true });
  assert.equal(plan.aAppliquer.length, cible.nb - a.courant.nb);
  assert.equal(plan.aAppliquer[0].version, local[a.courant.nb].version);
  assert.equal(plan.aAppliquer.at(-1).version, cible.derniere);
  assert.deepEqual(planMigration(partiel, local).aAppliquer, plan.aAppliquer, "reprise = même contrôle que pre");
  const dry = ["Would push these migrations:", ...local.slice(a.courant.nb).map((m) => ` • ${m.fichier}`)].join("\n");
  assert.ok(analyserDryRun(dry, plan).ok);
  assert.equal(analyserDryRun(fixture("dry-run-exact.txt"), plan).ok, false);
  const c = capture();
  assert.equal(checkLedgerCli([resolve(FIX, "ledger-partiel.json"), "--expect", "reprise"], { local, log: c.log }), 0);
  assert.match(c.texte(), new RegExp(`^PENDING_MIGRATIONS=${cible.nb - a.courant.nb} `, "m"));
});
