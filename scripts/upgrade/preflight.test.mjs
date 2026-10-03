// Tests du preflight Production V9.x (node --test scripts/upgrade/preflight.test.mjs).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { evaluer, lireLedger, main, DEPOT } from "./preflight.mjs";

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const SHA = "a".repeat(40);
const histo = ["20260101000001_a.sql", "20260101000002_b.sql", "20260101000005_e.sql"];
const nouvelles = ["20260101000003_hors_ordre.sql", "20260101000006_f.sql", "20260101000007_g.sql"];
const contenu = (n) => Buffer.from(`-- ${n}`);
const manifeste = { ref: "5777abb", migrations: Object.fromEntries(histo.map((f) => [f.split("_")[0], { fichier: f, sha256: sha256(contenu(f)) }])) };
const plan = { target_sha: SHA, migrations: nouvelles.map((m) => ({ migration: m, verrou: "SAFE", rollback: "FORWARD_ONLY" })) };
const ledgerTexte = "# project_ref=exhvuzegsefmoguxoiak\n" + histo.map((f) => f.split("_")[0]).join("\n") + "\n";
const NOW = "2026-10-03T08:00:00Z";

function fauxGit(surcharges = {}) {
  return {
    branche: () => "integration/elsatia-canonical-train-v9.1-final",
    head: () => SHA,
    resoudre: (s) => (s === SHA || s === "aaaa" ? SHA : null),
    publie: () => true,
    migrations: () => [...histo, ...nouvelles],
    contenu: (_s, n) => contenu(n),
    ...surcharges,
  };
}
function base(surcharges = {}) {
  return {
    argv: [], targetSha: SHA, targetMigrationCount: "6", now: NOW, sourceManifest: manifeste, targetPlan: plan,
    ledger: lireLedger(ledgerTexte), ledgerTexte,
    productionAttestation: { project_ref: "exhvuzegsefmoguxoiak", read_only: true, exported_by: "opérateur", exported_at: "2026-10-03T07:00:00Z",
      ledger_sha256: sha256(ledgerTexte), data_preconditions: { bloquant_essai_hors_fenetre: 0, info_essai_tronque: 2 } },
    backupAttestation: { project_ref: "exhvuzegsefmoguxoiak", kind: "pitr+dump", backup_id: "bk-1", taken_at: "2026-10-03T06:00:00Z",
      restore_tested: true, restore_target: "elsatia_restore_probe_local" },
    ...surcharges,
  };
}
const refus = (r) => r.filter((x) => !x.ok).map((x) => x.id);

test("cas nominal : tout est conforme", () => {
  const r = evaluer(base(), { git: fauxGit() });
  assert.deepEqual(refus(r), [], JSON.stringify(r, null, 1));
  assert.equal(r.length, 9);
});
test("P1 mauvaise branche", () => assert.deepEqual(refus(evaluer(base(), { git: fauxGit({ branche: () => "main" }) })), ["P1"]));
test("P2 SHA inconnu", () => assert.ok(refus(evaluer(base({ targetSha: "deadbeef" }), { git: fauxGit() })).includes("P2")));
test("P2 HEAD différent de la cible", () => assert.deepEqual(refus(evaluer(base(), { git: fauxGit({ head: () => "b".repeat(40) }) })), ["P2"]));
test("P2 cible non publiée", () => assert.deepEqual(refus(evaluer(base(), { git: fauxGit({ publie: () => false }) })), ["P2"]));
test("P3 nombre de migrations inattendu (cible jamais figée)", () => assert.deepEqual(refus(evaluer(base({ targetMigrationCount: "391" }), { git: fauxGit() })), ["P3"]));
test("P4 migration historique modifiée", () => {
  const g = fauxGit({ contenu: (_s, n) => (n === histo[1] ? Buffer.from("-- réécrite") : contenu(n)) });
  assert.deepEqual(refus(evaluer(base(), { git: g })), ["P4"]);
});
test("P4 migration historique renommée", () => {
  const g = fauxGit({ migrations: () => ["20260101000001_a.sql", "20260101000002_renommee.sql", "20260101000005_e.sql", ...nouvelles] });
  assert.ok(refus(evaluer(base(), { git: g })).includes("P4"));
});
test("P5 ledger avec version inconnue de la cible", () => {
  const t = ledgerTexte + "20260101000099\n";
  const r = evaluer(base({ ledger: lireLedger(t), ledgerTexte: t, productionAttestation: { ...base().productionAttestation, ledger_sha256: sha256(t) } }), { git: fauxGit() });
  assert.ok(refus(r).includes("P5"));
});
test("P5 ledger non préfixe (trou dans le plan)", () => {
  const t = ledgerTexte + "20260101000006\n"; // 000003 manquante avant 000006
  const r = evaluer(base({ ledger: lireLedger(t), ledgerTexte: t, productionAttestation: { ...base().productionAttestation, ledger_sha256: sha256(t) } }), { git: fauxGit() });
  assert.ok(refus(r).includes("P5"));
});
test("P5 reprise après interruption : ledger = source + préfixe accepté", () => {
  const t = ledgerTexte + "20260101000003\n20260101000006\n";
  const r = evaluer(base({ ledger: lireLedger(t), ledgerTexte: t, productionAttestation: { ...base().productionAttestation, ledger_sha256: sha256(t) } }), { git: fauxGit() });
  assert.deepEqual(refus(r), []);
});
test("P5 version historique absente du ledger", () => {
  const t = "20260101000001\n20260101000005\n";
  const r = evaluer(base({ ledger: lireLedger(t), ledgerTexte: t, productionAttestation: { ...base().productionAttestation, ledger_sha256: sha256(t) } }), { git: fauxGit() });
  assert.ok(refus(r).includes("P5"));
});
test("P6 migration inattendue (absente du plan qualifié)", () => {
  const p = { ...plan, migrations: plan.migrations.slice(0, 2) };
  assert.deepEqual(refus(evaluer(base({ targetPlan: p }), { git: fauxGit() })), ["P6"]);
});
test("P6 plan qualifié pour un autre SHA", () => assert.deepEqual(refus(evaluer(base({ targetPlan: { ...plan, target_sha: "c".repeat(40) } }), { git: fauxGit() })), ["P6"]));
test("P6 plan absent", () => assert.deepEqual(refus(evaluer(base({ targetPlan: undefined }), { git: fauxGit() })), ["P6"]));
test("P7 Production non attestée", () => assert.deepEqual(refus(evaluer(base({ productionAttestation: undefined }), { git: fauxGit() })), ["P7"]));
test("P7 attestation d'un autre projet (Preview)", () => {
  const a = { ...base().productionAttestation, project_ref: "pgvvpqyjziyapbbkydmc" };
  assert.ok(refus(evaluer(base({ productionAttestation: a }), { git: fauxGit() })).includes("P7"));
});
test("P7 empreinte du ledger différente", () => {
  const a = { ...base().productionAttestation, ledger_sha256: "0".repeat(64) };
  assert.deepEqual(refus(evaluer(base({ productionAttestation: a }), { git: fauxGit() })), ["P7"]);
});
test("P7 précondition de données bloquante (essai hors fenêtre 30 j)", () => {
  const a = { ...base().productionAttestation, data_preconditions: { bloquant_essai_hors_fenetre: 1 } };
  assert.deepEqual(refus(evaluer(base({ productionAttestation: a }), { git: fauxGit() })), ["P7"]);
});
test("P7 export non lecture seule", () => {
  const a = { ...base().productionAttestation, read_only: false };
  assert.deepEqual(refus(evaluer(base({ productionAttestation: a }), { git: fauxGit() })), ["P7"]);
});
test("P8 backup absent", () => assert.deepEqual(refus(evaluer(base({ backupAttestation: undefined }), { git: fauxGit() })), ["P8"]));
test("P8 backup trop ancien", () => {
  const b = { ...base().backupAttestation, taken_at: "2026-10-01T06:00:00Z" };
  assert.deepEqual(refus(evaluer(base({ backupAttestation: b }), { git: fauxGit() })), ["P8"]);
});
test("P8 restauration testée sur la Production elle-même", () => {
  const b = { ...base().backupAttestation, restore_target: "exhvuzegsefmoguxoiak" };
  assert.deepEqual(refus(evaluer(base({ backupAttestation: b }), { git: fauxGit() })), ["P8"]);
});
test("P8 restauration jamais testée", () => {
  const b = { ...base().backupAttestation, restore_tested: false };
  assert.deepEqual(refus(evaluer(base({ backupAttestation: b }), { git: fauxGit() })), ["P8"]);
});
test("P0 toute option de connexion est refusée", () => {
  assert.ok(refus(evaluer(base({ argv: ["--db-url", "postgres://x"] }), { git: fauxGit() })).includes("P0"));
});
test("ne jamais écrire : aucune API d'écriture ni de réseau dans le preflight", () => {
  const src = readFileSync(new URL("./preflight.mjs", import.meta.url), "utf8");
  for (const interdit of ["writeFileSync", "appendFile", "rmSync", "unlink", "mkdir", "fetch(", "node:net", "node:http", "createWriteStream", "from \"pg\""]) {
    assert.ok(!src.includes(interdit), `API interdite trouvée : ${interdit}`);
  }
  assert.ok(!/execFileSync\("(psql|supabase|curl)/.test(src), "aucun appel psql / supabase / curl");
});
test("intégration : dépôt réel, sans attestations → refus P7/P8 sans aucune écriture", () => {
  const lignes = [];
  const log = console.log;
  console.log = (l) => lignes.push(l);
  let code;
  try { code = main(["--target-sha", "HEAD", "--target-migration-count", "1"], DEPOT); } finally { console.log = log; }
  assert.equal(code, 1);
  assert.ok(lignes.some((l) => l.includes("P8")) && lignes.some((l) => l.includes("aucune action")));
});
test("P7 précondition déclarée bloquante par le plan (cible sans pont 298/399)", () => {
  const p = { ...plan, preconditions_bloquantes: ["lignes_factures_emises"] };
  const a = { ...base().productionAttestation, data_preconditions: { bloquant_essai_hors_fenetre: 0, lignes_factures_emises: 1040 } };
  assert.deepEqual(refus(evaluer(base({ targetPlan: p, productionAttestation: a }), { git: fauxGit() })), ["P7"]);
  const avecPont = { ...plan, preconditions_bloquantes: [] };
  assert.deepEqual(refus(evaluer(base({ targetPlan: avecPont, productionAttestation: a }), { git: fauxGit() })), []);
});
test("P7 précondition déclarée par le plan mais non mesurée", () => {
  const p = { ...plan, preconditions_bloquantes: ["lignes_factures_emises"] };
  assert.deepEqual(refus(evaluer(base({ targetPlan: p }), { git: fauxGit() })), ["P7"]);
});
test("P6 plan qualifié avec ponts absents de la cible → refus", () => {
  const p = { ...plan, ponts: [{ fichier: "20260101000004_pont.sql", sha256: "0".repeat(64) }] };
  assert.deepEqual(refus(evaluer(base({ targetPlan: p }), { git: fauxGit() })), ["P6"]);
});
test("P6 plan qualifié avec ponts présents et identiques → accepté", () => {
  const pont = "20260101000004_pont.sql";
  const g = fauxGit({ migrations: () => [...histo, ...nouvelles, pont] });
  const p = { ...plan, ponts: [{ fichier: pont, sha256: sha256(contenu(pont)) }],
              migrations: [...plan.migrations, { migration: pont, verrou: "SAFE", rollback: "REVERSIBLE" }] };
  assert.deepEqual(refus(evaluer(base({ targetPlan: p, targetMigrationCount: "7" }), { git: g })), []);
});
test("P6 pont présent mais modifié → refus", () => {
  const pont = "20260101000004_pont.sql";
  const g = fauxGit({ migrations: () => [...histo, ...nouvelles, pont] });
  const p = { ...plan, ponts: [{ fichier: pont, sha256: "f".repeat(64) }],
              migrations: [...plan.migrations, { migration: pont, verrou: "SAFE", rollback: "REVERSIBLE" }] };
  assert.deepEqual(refus(evaluer(base({ targetPlan: p, targetMigrationCount: "7" }), { git: g })), ["P6"]);
});

// ── Phase 0 : ponts d'upgrade du train (versions postérieures au train, appliqués en premier) ──
const pont0 = "20260101000009_pont_upgrade_phase0.sql";
const planP0 = { ...plan, phase0: [pont0], preconditions_phase_principale: ["bloquant_lignes_factures_emises_non_preparees"],
  migrations: [{ migration: pont0, verrou: "SAFE" }, ...plan.migrations] };
const gitP0 = () => fauxGit({ migrations: () => [...histo, ...nouvelles, pont0] });
function avecLedger(t, pre = {}, extra = {}) {
  const b = base();
  return base({ targetPlan: planP0, targetMigrationCount: "7", ledger: lireLedger(t), ledgerTexte: t,
    productionAttestation: { ...b.productionAttestation, ledger_sha256: sha256(t), data_preconditions: { ...b.productionAttestation.data_preconditions, ...pre } }, ...extra });
}
test("P9 phase 0 autorisée sur le ledger source", () => {
  const r = evaluer(avecLedger(ledgerTexte, { bloquant_lignes_factures_emises_non_preparees: 12 }, { phase: "0" }), { git: gitP0() });
  assert.deepEqual(refus(r), [], JSON.stringify(r, null, 1));
});
test("P9 phase principale refusée tant que la phase 0 n'est pas au ledger", () => {
  const r = evaluer(avecLedger(ledgerTexte, { bloquant_lignes_factures_emises_non_preparees: 0 }), { git: gitP0() });
  assert.deepEqual(refus(r), ["P9"]);
});
test("P9 phase principale autorisée après la phase 0 (ledger = source + pont, P5 préfixe)", () => {
  const t = ledgerTexte + "20260101000009\n";
  const r = evaluer(avecLedger(t, { bloquant_lignes_factures_emises_non_preparees: 0 }), { git: gitP0() });
  assert.deepEqual(refus(r), [], JSON.stringify(r, null, 1));
});
test("P7 phase principale : lignes de factures émises non préparées → refus", () => {
  const t = ledgerTexte + "20260101000009\n";
  const r = evaluer(avecLedger(t, { bloquant_lignes_factures_emises_non_preparees: 3 }), { git: gitP0() });
  assert.deepEqual(refus(r), ["P7"]);
});
test("P9 phase 0 refusée si la phase principale a commencé", () => {
  const t = ledgerTexte + "20260101000009\n20260101000003\n";
  const r = evaluer(avecLedger(t, {}, { phase: "0" }), { git: gitP0() });
  assert.ok(refus(r).includes("P9"));
});
test("P5 reprise de la phase principale : source + pont de phase 0 + préfixe lexical", () => {
  const t = ledgerTexte + "20260101000009\n20260101000003\n20260101000006\n";
  const r = evaluer(avecLedger(t, { bloquant_lignes_factures_emises_non_preparees: 0 }), { git: gitP0() });
  assert.deepEqual(refus(r), []);
});
test("P5 pont de phase 0 sauté (phase principale commencée sans lui) → refus", () => {
  const t = ledgerTexte + "20260101000003\n";
  const r = evaluer(avecLedger(t, { bloquant_lignes_factures_emises_non_preparees: 0 }), { git: gitP0() });
  assert.ok(refus(r).includes("P5") && refus(r).includes("P9"));
});
