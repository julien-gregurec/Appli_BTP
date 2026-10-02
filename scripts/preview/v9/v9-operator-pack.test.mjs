// Tests hors réseau du pack opérateur V9 (scripts/preview/v9/*).
// Lancer : node --test scripts/preview/v9/v9-operator-pack.test.mjs   (npm run test:preview-v9)
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { loadJson, MANIFEST_PATH } from "../../lib/env-manifest-core.mjs";
import * as C from "./lib/constantes.mjs";
import { evaluerCible, refDepuisDb } from "./lib/cible.mjs";
import { classerMigration, instructions } from "./lib/classement.mjs";
import { comparerInventaire, lireInventaire, classe } from "./lib/env-scope.mjs";
import { dependancesIdentiques, evaluerGit } from "./lib/git.mjs";
import { evaluerIban } from "./lib/iban.mjs";
import { analyserDryRun, analyserLedger, lireLedger, planMigration, ErreurLedger } from "./lib/ledger.mjs";
import { evaluerPorte, FORMAT_RAPPORT } from "./lib/rapport.mjs";
import { verifierSauvegarde } from "./lib/sauvegarde.mjs";
import { ROOT, trainLocal, verifierTrainLocal } from "./lib/train.mjs";
import { classementV9 } from "./classify-migrations-v9.mjs";
import { evaluerReponse, ATTENTES_HTTP, evaluerControlesV9 } from "./post-cutover-check.mjs";
import { verdictPack } from "./preflight-v9.mjs";
import { executer as checkLedgerCli } from "./check-ledger-v9.mjs";
import { executer as guardCli } from "./guard-preview-target.mjs";
import { executer as envCli } from "./env-scope-check.mjs";
import { executer as ibanCli } from "./iban-k1-check.mjs";

const FIX = resolve(import.meta.dirname, "fixtures");
const local = trainLocal();
const manifest = loadJson(ROOT, MANIFEST_PATH);
const fixture = (f) => readFileSync(resolve(FIX, f), "utf8");
const ledger = (f) => lireLedger(fixture(f));
const PREVIEW = C.REF_PREVIEW_AUTORISEE;
const PROD = C.REF_PRODUCTION_CONNUE;
// Valeurs factices construites à l'exécution (le scanner de secrets ne doit rien voir ici).
const motDePasse = ["MotDePasse", "Factice", "42"].join("");
const urlDb = (ref) => `postgresql://postgres:${motDePasse}@db.${ref}.supabase.co:5432/postgres`;
const capture = () => { const lignes = []; return { log: (l) => lignes.push(String(l)), texte: () => lignes.join("\n") }; };

// ── Train local ─────────────────────────────────────────────────────────────
test("train local : 389 migrations, dernière …1113, 813 ORIGINALE au rang 372", () => {
  const r = verifierTrainLocal(local);
  assert.ok(r.ok, JSON.stringify(r.constats.filter((c) => !c.ok)));
  assert.equal(local.length, 389);
  assert.equal(local[371].sha256, C.SHA256_813_ORIGINAL);
});

// ── Phase B : garde de cible ────────────────────────────────────────────────
test("garde : Preview correcte confirmée (toutes sources concordantes)", () => {
  const r = evaluerCible({ ref: PREVIEW, refLiee: `${PREVIEW}\n`, environment: "preview", branche: "claude/zen-clarke-qchnnt", env: { SUPABASE_PROJECT_REF: PREVIEW, NEXT_PUBLIC_SUPABASE_URL: `https://${PREVIEW}.supabase.co`, ELSATIA_PREVIEW_DB_URL: urlDb(PREVIEW) } });
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
test("ledger : 372 correct → PREVIEW_LEDGER_PREFIX_OK, PENDING_MIGRATIONS=17", () => {
  const a = analyserLedger(ledger("ledger-372-ok.json"), local, { exigerPreuve813: true });
  assert.equal(a.verdict, "PREVIEW_LEDGER_PREFIX_OK");
  assert.equal(a.enAttente.length, 17);
  assert.ok(a.conforme);
  const c = capture();
  assert.equal(checkLedgerCli([resolve(FIX, "ledger-372-ok.json"), "--require-813-proof"], { local, log: c.log }), 0);
  assert.match(c.texte(), /PREVIEW_LEDGER_PREFIX_OK/);
  assert.match(c.texte(), /PENDING_MIGRATIONS=17/);
});

test("ledger : divergences détectées avec leur code exact", () => {
  const cas = [
    ["ledger-372-813-non-originale.json", "LEDGER-813-NON-ORIGINALE"],
    ["ledger-373-etrangere.json", "LEDGER-ETRANGERE"],
    ["ledger-372-ordre-incorrect.json", "LEDGER-ORDRE"],
    ["ledger-371-manquante.json", "LEDGER-TROU"],
    ["ledger-372-ref-production.json", "LEDGER-REF-PRODUCTION"],
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
});

test("ledger : nom différent, doublon, checksum différent, 813 sans preuve exigée", () => {
  const base = ledger("ledger-372-ok.json");
  const nom = { ...base, entries: base.entries.map((e, i) => (i === 10 ? { ...e, name: "autre_nom" } : e)) };
  assert.ok(analyserLedger(nom, local).divergences.some((d) => d.code === "LEDGER-NOM"));
  const doublon = { ...base, entries: [...base.entries.slice(0, 5), base.entries[4], ...base.entries.slice(5)] };
  assert.ok(analyserLedger(doublon, local).divergences.some((d) => d.code === "LEDGER-DOUBLON"));
  const somme = { ...base, entries: base.entries.map((e, i) => (i === 3 ? { ...e, sha256: "0".repeat(64) } : e)) };
  assert.ok(analyserLedger(somme, local).divergences.some((d) => d.code === "LEDGER-CHECKSUM"));
  const sansPreuve = lireLedger(fixture("migration-list-372.txt"));
  assert.equal(analyserLedger(sansPreuve, local).verdict, "PREVIEW_LEDGER_PREFIX_OK");
  assert.ok(analyserLedger(sansPreuve, local, { exigerPreuve813: true }).divergences.some((d) => d.code === "LEDGER-813-NON-PROUVEE"));
  // Format psql -At.
  const psql = lireLedger(local.slice(0, 372).map((m) => `${m.version}|${m.name}`).join("\n"));
  assert.equal(analyserLedger(psql, local).verdict, "PREVIEW_LEDGER_PREFIX_OK");
});

test("ledger : train déjà 389 → ALREADY (pre, code 3) / COMPLETE (post) ; partiel 380 refusé", () => {
  assert.equal(analyserLedger(ledger("ledger-389-v9.json"), local, { attente: "post", exigerPreuve813: true }).verdict, "PREVIEW_LEDGER_V9_COMPLETE");
  const c = capture();
  assert.equal(checkLedgerCli([resolve(FIX, "ledger-389-v9.json")], { local, log: c.log }), 3);
  assert.match(c.texte(), /PREVIEW_LEDGER_ALREADY_V9/);
  assert.equal(checkLedgerCli([resolve(FIX, "ledger-389-v9.json"), "--expect", "post"], { local, log: () => {} }), 0);
  const p = analyserLedger(ledger("ledger-380-partiel.json"), local);
  assert.equal(p.verdict, "PREVIEW_LEDGER_PARTIAL_V9");
  assert.equal(p.conforme, false);
  assert.equal(analyserLedger(ledger("ledger-372-ok.json"), local, { attente: "post" }).conforme, false);
});

// ── Phase D : plan ──────────────────────────────────────────────────────────
test("plan : 17 migrations exactes, preuves vertes, échec si ledger non préfixe", () => {
  const plan = planMigration(ledger("ledger-372-ok.json"), local, { exigerPreuve813: true });
  assert.equal(plan.aAppliquer.length, 17);
  assert.equal(plan.aAppliquer[0].version, "20261002000901");
  assert.equal(plan.aAppliquer[0].rang, 373);
  assert.equal(plan.aAppliquer.at(-1).version, "20261002001113");
  assert.equal(plan.final.nb, 389);
  assert.ok(plan.aAppliquer.every((m) => m.version > C.VERSION_SOCLE));
  assert.ok(plan.preuves.every((p) => p.ok));
  assert.deepEqual(plan.aAppliquer.map((m) => m.version), local.slice(372).map((m) => m.version));
  for (const f of ["ledger-373-etrangere.json", "ledger-372-813-non-originale.json", "ledger-389-v9.json", "ledger-380-partiel.json"]) {
    assert.throws(() => planMigration(ledger(f), local), ErreurLedger, f);
  }
});

test("plan : 16 ou 18 migrations en attente → échec (train local amputé ou augmenté)", () => {
  const plus = [...local, { version: "20261002001114", name: "releve_lot_10_v1", fichier: "20261002001114_releve_lot_10_v1.sql", sha256: "x" }];
  const moins = local.slice(0, -1);
  for (const t of [plus, moins]) {
    const a = analyserLedger(ledger("ledger-372-ok.json"), t);
    assert.equal(a.conforme, false);
    assert.ok(a.divergences.some((d) => d.code === "LEDGER-PENDING"));
    assert.throws(() => planMigration(ledger("ledger-372-ok.json"), t), ErreurLedger);
  }
});

test("dry-run : exactement 17 accepté ; 16, 18, ordre, --include-all, migration repair refusés", () => {
  const plan = planMigration(ledger("ledger-372-ok.json"), local);
  assert.ok(analyserDryRun(fixture("dry-run-17.txt"), plan).ok);
  for (const f of ["dry-run-16.txt", "dry-run-18.txt", "dry-run-include-all.txt"]) assert.equal(analyserDryRun(fixture(f), plan).ok, false, f);
  assert.match(analyserDryRun(fixture("dry-run-include-all.txt"), plan).motifs.join(), /include-all/);
  const inverse = fixture("dry-run-17.txt").split("\n");
  [inverse[2], inverse[3]] = [inverse[3], inverse[2]];
  assert.equal(analyserDryRun(inverse.join("\n"), plan).ok, false);
  assert.equal(analyserDryRun(`${fixture("dry-run-17.txt")}\nTry supabase migration repair`, plan).ok, false);
});

// ── Phase F : script de cutover (refus d'usage, sans réseau) ───────────────
test("cutover : --include-all, apply sans confirmation, confirmation Production, --out dans le dépôt → refus (2)", () => {
  const out = mkdtempSync(join(tmpdir(), "v9-cut-"));
  const sh = (args) => spawnSync("bash", [resolve(import.meta.dirname, "v9-cutover.sh"), ...args], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: process.env.HOME } });
  const cas = [
    ["--out", out, "--include-all"],
    ["--out", out, "--apply-preview"],
    ["--out", out, "--apply-preview", "--confirm-ref", PROD],
    ["--out", out, "--apply-preview", "--confirm-ref", "abcdefghijklmnopqrst"],
    ["--out", resolve(ROOT, "tmp-v9-out")],
    ["--out", out, "--offline-ledger", resolve(FIX, "ledger-372-ok.json"), "--apply-preview", "--confirm-ref", PREVIEW],
    ["--out", out, "--verify-only", "--apply-preview", "--confirm-ref", PREVIEW],
  ];
  for (const a of cas) {
    const r = sh(a);
    assert.equal(r.status, 2, `${a.join(" ")}\n${r.stderr}`);
    assert.match(r.stderr, /REFUS/);
  }
  spawnSync("rm", ["-rf", resolve(ROOT, "tmp-v9-out")]);
});

// ── Git ─────────────────────────────────────────────────────────────────────
test("git : mauvais SHA, branche incorrecte, worktree sale, code hors pack → refus", () => {
  const sain = { head: "a".repeat(40), branche: "claude/zen-clarke-qchnnt", sale: 0, canoniquePresent: true, ancetre: true, arbreCanonique: "t1", arbreHead: "t1", fichiersModifies: ["scripts/preview/v9/v9-cutover.sh", "docs/runbooks/ELSATIA_V9_PREVIEW_ROLLBACK.md"], pkgCanonique: "{}", pkgHead: "{}" };
  assert.ok(evaluerGit(sain).ok);
  const cas = [
    [{ ancetre: false, fichiersModifies: null }, "GIT-SHA-ANCETRE"],
    [{ canoniquePresent: false, ancetre: false, arbreCanonique: null, fichiersModifies: null }, "GIT-SHA-CONNU"],
    [{ arbreHead: "t2" }, "GIT-MIGRATIONS-IDENTIQUES"],
    [{ branche: "main" }, "GIT-BRANCHE"],
    [{ branche: "feature/autre" }, "GIT-BRANCHE"],
    [{ branche: "HEAD" }, "GIT-BRANCHE"],
    [{ sale: 3 }, "GIT-PROPRE"],
    [{ fichiersModifies: ["src/app/page.tsx"] }, "GIT-CODE-IDENTIQUE"],
    [{ fichiersModifies: ["supabase/migrations/x.sql"] }, "GIT-CODE-IDENTIQUE"],
    [{ fichiersModifies: ["package.json"], pkgCanonique: '{"dependencies":{"a":"1"}}', pkgHead: '{"dependencies":{"a":"2"}}' }, "GIT-PACKAGE-JSON"],
  ];
  for (const [modif, code] of cas) {
    const r = evaluerGit({ ...sain, ...modif });
    assert.equal(r.ok, false, code);
    assert.ok(r.constats.some((c) => c.code === code && !c.ok), code);
  }
  assert.ok(dependancesIdentiques('{"scripts":{"a":"1"},"x":1}', '{"scripts":{"b":"2"},"x":1}'));
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
    { kind: "ledger", path: f("l.json", fixture("ledger-372-ok.json")) },
  ];
  const maintenant = new Date("2026-10-03T08:00:00Z");
  const m = { project_ref: PREVIEW, created_at: "2026-10-03T07:00:00Z", artefacts: art };
  const opts = { racineDepot: ROOT, local, maintenant };
  assert.equal(verifierSauvegarde(m, opts).verdict, "BACKUP_DECLARED_OK");
  assert.equal(verifierSauvegarde({ ...m, artefacts: art.filter((a) => a.kind !== "auth") }, opts).verdict, "BACKUP_MISSING");
  assert.equal(verifierSauvegarde({ ...m, created_at: "2026-10-01T07:00:00Z" }, opts).verdict, "BACKUP_MISSING");
  assert.equal(verifierSauvegarde({ ...m, project_ref: PROD }, opts).verdict, "BACKUP_MISSING");
  assert.equal(verifierSauvegarde({ ...m, artefacts: [...art.slice(0, 3), { kind: "ledger", path: f("l2.json", fixture("ledger-373-etrangere.json")) }] }, opts).verdict, "BACKUP_MISSING");
  assert.equal(verifierSauvegarde({ ...m, artefacts: [...art.slice(1), { kind: "schema", path: resolve(ROOT, "package.json") }] }, opts).verdict, "BACKUP_MISSING");
  assert.equal(verifierSauvegarde({ ...m, artefacts: [{ ...art[0], sha256: "0".repeat(64) }, ...art.slice(1)] }, opts).verdict, "BACKUP_MISSING");
  assert.equal(verifierSauvegarde({ ...m, artefacts: [{ kind: "auth", path: f("vide.sql", "") }, ...art.filter((a) => a.kind !== "auth")] }, opts).verdict, "BACKUP_MISSING");
});

// ── Phase G : porte base → code ─────────────────────────────────────────────
test("porte code : false tant que ledger 389 + DB verify + contrôles V9 ne sont pas confirmés", () => {
  const maintenant = new Date("2026-10-03T09:00:00Z");
  const complet = { format: FORMAT_RAPPORT, ref: PREVIEW, sha_canonique: C.SHA_CANONIQUE, mode: "apply", maj_le: "2026-10-03T08:30:00Z", etapes: { ledger_apres: { verdict: "PREVIEW_LEDGER_V9_COMPLETE" }, db_verify: { code: 0 }, controles_v9: { ok: true } } };
  assert.equal(evaluerPorte(complet, { maintenant }).autorise, true);
  const cas = [
    null,
    { ...complet, mode: "dry-run" },
    { ...complet, ref: PROD },
    { ...complet, sha_canonique: C.SHA_V8_PREVIEW },
    { ...complet, maj_le: "2026-10-01T08:30:00Z" },
    { ...complet, etapes: { ...complet.etapes, ledger_apres: { verdict: "PREVIEW_LEDGER_PARTIAL_V9" } } },
    { ...complet, etapes: { ...complet.etapes, db_verify: { code: 1 } } },
    { ...complet, etapes: { ...complet.etapes, controles_v9: { ok: false } } },
    { ...complet, etapes: { ledger_apres: complet.etapes.ledger_apres } },
  ];
  for (const r of cas) assert.equal(evaluerPorte(r, { maintenant }).autorise, false, JSON.stringify(r));
  assert.equal(evaluerPorte(complet, { maintenant, ledgerPost: { verdict: "PREVIEW_LEDGER_DIVERGENCE" } }).autorise, false);
});

// ── Phase K : classement ────────────────────────────────────────────────────
test("classement : 17 migrations V9 classées depuis le SQL (attendu figé)", () => {
  const attendu = { "20261002000901": "FORWARD_ONLY", "20261002001112": "FORWARD_ONLY" };
  for (const m of classementV9()) assert.equal(m.classe, attendu[m.version] ?? "REVERSIBLE", m.version);
  assert.match(classementV9().find((m) => m.version === "20261002001001").note, /SÉCURITÉ/);
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
test("post-cutover : SQL V9 = fonctions des 17 migrations ; 11 contrôles ; HTTP protégé 200 = fuite", () => {
  const sql = readFileSync(resolve(ROOT, "docs/runbooks/sql/ELSATIA_V9_POST_CUTOVER_CHECKS.sql"), "utf8");
  const listeSql = [...sql.slice(sql.indexOf("fonctions_v9(nom)"), sql.indexOf("])),")).matchAll(/'([a-z_]+\.[a-z_0-9]+)'/g)].map((m) => m[1]).sort();
  const attendues = [...new Set(classementV9().flatMap((m) => m.fonctions))].sort();
  assert.deepEqual(listeSql, attendues);
  assert.equal([...sql.matchAll(/^\s+select (\d+), '/gm)].length, 11);
  const verts = Array.from({ length: 11 }, (_, i) => `${i + 1}|c${i + 1}|a|o|t|t`).join("\n");
  assert.ok(evaluerControlesV9(verts).ok);
  assert.equal(evaluerControlesV9(verts.replace("2|c2|a|o|t|t", "2|c2|a|o|f|t")).ok, false);
  assert.equal(evaluerControlesV9(verts.split("\n").slice(0, 10).join("\n")).ok, false);
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
