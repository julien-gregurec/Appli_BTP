// ELSATIA — Chiffrement bancaire : intégration PostgreSQL réelle de l'outil opérateur bank-keys.
// Rapport : docs/qualification/ELSATIA_BANKING_ENCRYPTION_KEY_ROTATION_V1.md (§11).
//
//   BANK_KEYS_IT_BASE=<base V8 migrée SANS 20260930000813> npm run test:bank-keys
//
// Chaque scénario clone la base modèle (createdb -T), y écrit des données HISTORIQUES (format v1,
// exactement comme le code d'avant la V1), APPLIQUE la migration (upgrade réel), puis pilote la
// CLI comme un opérateur. Données de test uniquement (IBAN fictifs banque 99999, clés générées).
// Sans BANK_KEYS_IT_BASE, seuls les tests hors base s'exécutent.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = path.join(RACINE, "scripts/bank-keys/bank-keys.mjs");
const MIGRATION = path.join(RACINE, "supabase/migrations/20260930000813_banking_encryption_key_rotation_v1.sql");
const BASE = process.env.BANK_KEYS_IT_BASE;

const K1 = randomBytes(32).toString("base64");
const K2 = randomBytes(32).toString("base64");
const K3 = randomBytes(32).toString("hex");
const KFAUX = randomBytes(32).toString("base64");
const BIC = "TESTFRPPXXX";
const ENT = "b0c00000-0000-4000-8000-000000000001";

function ibanTest(n) {
  const bban = `9999900001${String(n).padStart(11, "0")}00`;
  let reste = 0;
  for (const c of `${bban}152700`) reste = (reste * 10 + Number(c)) % 97;
  return `FR${String(98 - reste).padStart(2, "0")}${bban}`;
}
// Code d'AVANT la V1 (src/lib/banking.ts @ 53b4bc7).
function chiffrerAncien(clair) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(K1, "base64"), iv);
  const ct = Buffer.concat([c.update(clair, "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(":");
}
function dechiffrerAncien(valeur) {
  const [version, iv, tag, contenu] = valeur.split(":");
  if (version !== "v1") throw new Error("format");
  const d = createDecipheriv("aes-256-gcm", Buffer.from(K1, "base64"), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(contenu, "base64url")), d.final()]).toString("utf8");
}

const SORTIES = [];
const BASES = [];
const DOSSIER = mkdtempSync(path.join(tmpdir(), "bank-keys-it-"));

function psql(db, sql, { replica = false } = {}) {
  const r = spawnSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", db], { input: `${replica ? "set session_replication_role = replica;\n" : ""}${sql}\n`, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`psql: ${r.stderr.split("\n").find((l) => l.includes("ERROR")) ?? r.stderr}`);
  return r.stdout.trim();
}

const ENV_K1 = { BANK_DATA_ENCRYPTION_KEY: K1 };
const ENV_K12 = { BANK_DATA_ENCRYPTION_KEY: K1, BANK_DATA_ENCRYPTION_KEYS: `k2:${K2}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k2" };

function cli(db, env, ...args) {
  const r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", CLI, ...args, "--psql-db", db], {
    cwd: RACINE,
    env: { PATH: process.env.PATH, ...env },
    encoding: "utf8",
  });
  SORTIES.push(r.stdout, r.stderr);
  const lignes = r.stdout.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { code: r.status, lignes, fin: lignes.at(-1) ?? {}, stderr: r.stderr };
}

/** Base V8 + données historiques v1 + migration (upgrade). 40 RIB (20 BIC) + 20 ordres (10 BIC) = 90 valeurs. */
function preparerBase(nom) {
  const db = `bk_it_${nom}_${process.pid}`;
  spawnSync("dropdb", ["--if-exists", db]);
  const r = spawnSync("createdb", ["-T", BASE, db], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  BASES.push(db);
  const sql = [
    `insert into public.entreprises (id, nom, code_adhesion) values ('${ENT}', 'IT Banque', 'ITBK0001');`,
    `update public.entreprises set abonnement_offre = 'pro', capacite_personnes_supplementaire = 1000 where id = '${ENT}';`,
  ];
  for (let i = 1; i <= 40; i += 1) {
    const emp = `b0c10000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    const rib = `b0c20000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    const iban = ibanTest(i);
    sql.push(`insert into public.employes (id, entreprise_id, prenom, nom) values ('${emp}', '${ENT}', 'Test', 'N${i}');`);
    sql.push(`insert into public.coordonnees_bancaires (id, entreprise_id, type_beneficiaire, employe_id, titulaire, iban_chiffre, iban_hash, iban_quatre_derniers, bic_chiffre, verification_statut)
      values ('${rib}', '${ENT}', 'employe', '${emp}', 'Test N${i}', '${chiffrerAncien(iban)}', '${createHash("sha256").update(iban).digest("hex")}', '${iban.slice(-4)}', ${i % 2 ? `'${chiffrerAncien(BIC)}'` : "null"}, 'verifie');`);
  }
  psql(db, sql.join("\n"));
  // Ordres de virement historiques et leurs parents réels (lot, notes de frais). Seuls les
  // déclencheurs métier sont contournés à l'insertion (session_replication_role) : les
  // contraintes de clé étrangère restent satisfaites, comme sur une base réelle.
  const ordres = [`insert into public.lots_virements (id, entreprise_id, numero, type_lot, statut, date_execution) values ('b0c40000-0000-4000-8000-000000000001', '${ENT}', 'VIR-IT-000001', 'notes_frais', 'execute', current_date);`];
  for (let i = 1; i <= 20; i += 1) {
    const iban = ibanTest(i);
    const n = String(i).padStart(12, "0");
    ordres.push(`insert into public.notes_frais (id, entreprise_id, employe_id, montant_ttc, reference, statut, lieu_hors_chantier) values ('b0c50000-0000-4000-8000-${n}', '${ENT}', 'b0c10000-0000-4000-8000-${n}', 10, 'NF-IT-${i}', 'valide', 'bureau');`);
    ordres.push(`insert into public.ordres_virements (id, entreprise_id, lot_id, type_beneficiaire, employe_id, note_frais_id, titulaire, iban_chiffre, iban_quatre_derniers, bic_chiffre, montant, libelle, statut)
      values ('b0c30000-0000-4000-8000-${n}', '${ENT}', 'b0c40000-0000-4000-8000-000000000001', 'employe', 'b0c10000-0000-4000-8000-${n}', 'b0c50000-0000-4000-8000-${n}', 'Test N${i}', '${chiffrerAncien(iban)}', '${iban.slice(-4)}', ${i % 2 ? `'${chiffrerAncien(BIC)}'` : "null"}, 10, 'Test', 'execute');`);
  }
  psql(db, ordres.join("\n"), { replica: true });
  assert.equal(psql(db, `select count(*) from public.ordres_virements o join public.notes_frais n on n.id = o.note_frais_id join public.lots_virements l on l.id = o.lot_id where o.entreprise_id = '${ENT}'`), "20");
  // Upgrade : la migration s'applique sur des données existantes.
  const m = spawnSync("psql", ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", db, "-f", MIGRATION], { encoding: "utf8" });
  assert.equal(m.status, 0, m.stderr);
  return db;
}

const inventaire = (db) => Object.fromEntries(psql(db, "select coalesce(cle_id,'illisible') || '/' || format, sum(nombre) from public.cles_bancaires_inventaire() group by 1 order by 1").split("\n").filter(Boolean).map((l) => l.split("|")).map(([k, n]) => [k, Number(n)]));

function toutLisible(db, lire) {
  const lignes = psql(db, "select id || '|' || colonne || '|' || chiffre from public.chiffres_bancaires_sources()").split("\n");
  for (const l of lignes) {
    const [id, colonne, chiffre] = l.split("|");
    const n = Number(id.slice(-12));
    assert.equal(lire(chiffre), colonne === "bic_chiffre" ? BIC : ibanTest(n), `${id}/${colonne}`);
  }
  return lignes.length;
}

/** Procédure K1 → K2 jusqu'à l'activation (sans rechiffrement). */
function activerK2(db) {
  assert.equal(cli(db, ENV_K1, "register", "--key-id", "k1").fin.resultat, "attestee");
  assert.equal(cli(db, ENV_K12, "register", "--key-id", "k2").fin.resultat, "enregistree");
  assert.equal(cli(db, ENV_K12, "activate", "--key-id", "k2", "--yes").fin.resultat, "activee");
}

after(() => {
  for (const db of BASES) spawnSync("dropdb", ["--if-exists", db]);
  rmSync(DOSSIER, { recursive: true, force: true });
});

describe("bank-keys sans base", () => {
  test("usage et refus de configuration (aucune clé affichée)", () => {
    let r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", CLI, "inconnue"], { cwd: RACINE, env: { PATH: process.env.PATH }, encoding: "utf8" });
    assert.equal(r.status, 2);
    r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", CLI, "status"], { cwd: RACINE, env: { PATH: process.env.PATH, BANK_DATA_ENCRYPTION_KEYS: `k1:${K1},k2:${K2}` }, encoding: "utf8" });
    assert.equal(r.status, 3);
    assert.match(r.stdout, /ACTIVE_KEY_ID est obligatoire/);
    assert.ok(!r.stdout.includes(K1) && !r.stdout.includes(K2));
    r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", CLI, "fingerprint", "--key-id", "k2"], { cwd: RACINE, env: { PATH: process.env.PATH, ...ENV_K12 }, encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match(JSON.parse(r.stdout).empreinte_controle, /^[0-9a-f]{64}$/);
    r = spawnSync(process.execPath, ["--experimental-strip-types", "--no-warnings", CLI, "activate", "--key-id", "k2", "--psql-db", "x"], { cwd: RACINE, env: { PATH: process.env.PATH, ...ENV_K12 }, encoding: "utf8" });
    assert.equal(r.status, 2, "activation sans --yes refusée");
  });
});

describe("bank-keys × PostgreSQL réel", { skip: !BASE && "BANK_KEYS_IT_BASE absent" }, () => {
  test("upgrade V8 → migration : données historiques intactes et inventoriées", () => {
    const db = preparerBase("upgrade");
    assert.deepEqual(inventaire(db), { "k1/v1": 90 });
    assert.equal(psql(db, "select count(*) from public.coordonnees_bancaires where iban_hash_cle is not null"), "0");
    assert.equal(toutLisible(db, dechiffrerAncien), 90);
    const s = cli(db, ENV_K1, "status");
    assert.equal(s.code, 0);
    assert.match(JSON.stringify(s.fin.controle.avertissements), /NON_ATTESTEE : k1/);
    assert.equal(cli(db, ENV_K1, "status", "--strict").code, 3, "--strict exige l'attestation de k1");
  });

  test("procédure complète K1 → K2 : écritures K2, lecture K1, rechiffrement, compromission, retrait", () => {
    const db = preparerBase("complet");
    activerK2(db);
    assert.equal(cli(db, ENV_K12, "status").code, 0);
    assert.equal(cli(db, ENV_K1, "status").code, 3, "un pod resté sur l'ancien environnement est détecté (ACTIVE_DIVERGENTE)");
    // Avant rechiffrement : tout reste lisible avec le trousseau (K1 en déchiffrement).
    assert.equal(cli(db, ENV_K12, "verify").fin.verdict, "RESTAURATION_DECHIFFRABLE");
    const r = cli(db, ENV_K12, "rotate", "--batch", "9");
    assert.equal(r.code, 0, JSON.stringify(r.fin));
    assert.deepEqual({ statut: r.fin.rapport.statut, rechiffres: r.fin.rapport.rechiffres, lots: r.fin.rapport.lots }, { statut: "termine", rechiffres: 90, lots: 10 });
    assert.deepEqual(inventaire(db), { "k2/v2": 90 });
    assert.equal(psql(db, "select count(*) from public.coordonnees_bancaires where iban_hash_cle = 'k2'"), "40");
    assert.equal(Number(psql(db, "select count(*) from public.journal_cles_chiffrement_bancaire where action = 'rechiffrement_lot'")), 10);
    // Compromission (exercice) puis retrait de K1 ; plus aucune écriture v1 acceptée.
    assert.equal(cli(db, ENV_K12, "compromise", "--key-id", "k1", "--reason", "exercice IT", "--yes").fin.resultat, "compromise");
    assert.throws(() => psql(db, `update public.ordres_virements set bic_chiffre = '${chiffrerAncien(BIC)}' where id = 'b0c30000-0000-4000-8000-000000000002'`), /inconnue, retirée ou compromise/);
    assert.equal(cli(db, ENV_K12, "retire", "--key-id", "k1", "--yes").fin.resultat, "retiree");
    const sansK1 = { BANK_DATA_ENCRYPTION_KEYS: `k2:${K2}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k2" };
    assert.equal(cli(db, sansK1, "verify", "--strict").fin.verdict, "RESTAURATION_DECHIFFRABLE");
    assert.equal(cli(db, sansK1, "status").code, 0);
  });

  for (const [lots, pourcent] of [[1, 10], [5, 50], [9, 90]]) {
    test(`interruption à ${pourcent} % : lisible, vérifiable, reprenable`, () => {
      const db = preparerBase(`int${pourcent}`);
      activerK2(db);
      const r = cli(db, ENV_K12, "rotate", "--batch", "9", "--max-batches", String(lots));
      assert.equal(r.code, 1);
      assert.equal(r.fin.rapport.statut, "interrompu");
      assert.equal(r.fin.rapport.restants, 90 - lots * 9);
      assert.deepEqual(inventaire(db), { "k1/v1": 90 - lots * 9, "k2/v2": lots * 9 });
      const v = cli(db, ENV_K12, "verify");
      assert.equal(v.code, 0);
      assert.deepEqual(v.fin.verification.parCle, { k1: 90 - lots * 9, k2: lots * 9 });
      // Retrait de K1 impossible tant que la rotation n'est pas finie.
      cli(db, ENV_K12, "compromise", "--key-id", "k1", "--reason", "exercice", "--yes");
      assert.equal(cli(db, ENV_K12, "retire", "--key-id", "k1", "--yes").code, 1);
      const reprise = cli(db, ENV_K12, "rotate", "--batch", "9");
      assert.equal(reprise.code, 0);
      assert.equal(reprise.fin.rapport.rechiffres, 90 - lots * 9);
      assert.deepEqual(inventaire(db), { "k2/v2": 90 });
    });
  }

  test("processus tué (SIGKILL) en plein rechiffrement : aucune valeur perdue, reprise complète", async () => {
    const db = preparerBase("kill");
    activerK2(db);
    const enfant = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", CLI, "rotate", "--batch", "1", "--psql-db", db], { cwd: RACINE, env: { PATH: process.env.PATH, ...ENV_K12 } });
    let sortie = "";
    await new Promise((resolve) => {
      enfant.stdout.on("data", (d) => {
        sortie += d;
        if ((sortie.match(/progression/g) ?? []).length >= 30) enfant.kill("SIGKILL");
      });
      enfant.on("exit", resolve);
    });
    SORTIES.push(sortie);
    const inv = inventaire(db);
    assert.equal((inv["k1/v1"] ?? 0) + (inv["k2/v2"] ?? 0), 90);
    assert.ok((inv["k2/v2"] ?? 0) >= 30 && (inv["k1/v1"] ?? 0) > 0, JSON.stringify(inv));
    assert.equal(cli(db, ENV_K12, "verify").code, 0);
    assert.equal(cli(db, ENV_K12, "rotate").code, 0);
    assert.deepEqual(inventaire(db), { "k2/v2": 90 });
  });

  test("deux rechiffrements simultanés : convergence sans corruption (compare-and-swap)", async () => {
    const db = preparerBase("concurrence");
    activerK2(db);
    const lancer = (lot) => new Promise((resolve) => {
      const e = spawn(process.execPath, ["--experimental-strip-types", "--no-warnings", CLI, "rotate", "--batch", lot, "--psql-db", db], { cwd: RACINE, env: { PATH: process.env.PATH, ...ENV_K12 } });
      let out = "";
      e.stdout.on("data", (d) => { out += d; });
      e.on("exit", (code) => { SORTIES.push(out); resolve({ code, fin: JSON.parse(out.trim().split("\n").at(-1)) }); });
    });
    const [a, b] = await Promise.all([lancer("3"), lancer("5")]);
    assert.equal(a.fin.rapport.rechiffres + b.fin.rapport.rechiffres, 90);
    assert.deepEqual(inventaire(db), { "k2/v2": 90 });
    assert.equal(cli(db, ENV_K12, "verify").code, 0);
  });

  test("mauvaise clé : refus fermé à toutes les étapes, aucune donnée réécrite", () => {
    const db = preparerBase("mauvaise");
    activerK2(db);
    const avant = psql(db, "select md5(string_agg(chiffre, ',' order by id, colonne)) from public.chiffres_bancaires_sources()");
    const faux = { ...ENV_K12, BANK_DATA_ENCRYPTION_KEYS: `k2:${KFAUX}` };
    const s = cli(db, faux, "status");
    assert.equal(s.code, 3);
    assert.match(JSON.stringify(s.fin.controle.erreurs), /EMPREINTE_DIFFERENTE : la clé k2/);
    assert.equal(cli(db, faux, "rotate").code, 3);
    assert.equal(cli(db, faux, "register", "--key-id", "k2").code, 1, "le registre refuse une autre clé sous k2");
    assert.equal(psql(db, "select md5(string_agg(chiffre, ',' order by id, colonne)) from public.chiffres_bancaires_sources()"), avant);
    // Mauvaise k1 (attestée) : détectée avant tout déchiffrement.
    const fauxK1 = { BANK_DATA_ENCRYPTION_KEY: KFAUX, BANK_DATA_ENCRYPTION_KEYS: `k2:${K2}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k2" };
    const v = cli(db, fauxK1, "verify");
    assert.equal(v.code, 3);
    assert.equal(v.fin.verdict, "RESTAURATION_NON_DECHIFFRABLE");
    assert.equal(v.fin.verification.echecs.length, 90);
    assert.ok(v.fin.verification.echecs.every((e) => e.motif === "AUTHENTIFICATION_ECHOUEE"));
  });

  test("retour arrière : K2 → K1 (v2) puis format v1 relu par le code d'avant la V1", () => {
    const db = preparerBase("rollback");
    activerK2(db);
    assert.equal(cli(db, ENV_K12, "rotate").code, 0);
    const envK1v2 = { ...ENV_K12, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k1" };
    assert.equal(cli(db, envK1v2, "activate", "--key-id", "k1", "--yes").fin.resultat, "activee");
    assert.equal(cli(db, envK1v2, "rotate").code, 0);
    assert.deepEqual(inventaire(db), { "k1/v2": 90 });
    const envK1v1 = { ...envK1v2, BANK_DATA_ENCRYPTION_WRITE_FORMAT: "v1" };
    assert.equal(cli(db, envK1v1, "rotate").code, 0);
    assert.deepEqual(inventaire(db), { "k1/v1": 90 });
    assert.equal(toutLisible(db, dechiffrerAncien), 90);
    assert.equal(psql(db, "select count(*) from public.coordonnees_bancaires where iban_hash_cle is null"), "40");
    assert.equal(psql(db, `select iban_hash from public.coordonnees_bancaires where id = 'b0c20000-0000-4000-8000-000000000007'`), createHash("sha256").update(ibanTest(7)).digest("hex"));
  });

  test("sauvegarde / restauration : un backup sans les bonnes clés est détecté", () => {
    const db = preparerBase("dr");
    activerK2(db);
    cli(db, ENV_K12, "rotate", "--batch", "9", "--max-batches", "5"); // backup pris à mi-rotation
    const dump = path.join(DOSSIER, "dr.dump");
    let r = spawnSync("pg_dump", ["-Fc", "-f", dump, db], { encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    cli(db, ENV_K12, "rotate");
    const restauree = `bk_it_dr_restore_${process.pid}`;
    spawnSync("dropdb", ["--if-exists", restauree]);
    BASES.push(restauree);
    assert.equal(spawnSync("createdb", ["-T", "template0", restauree]).status, 0);
    r = spawnSync("pg_restore", ["--no-owner", "-d", restauree, dump], { encoding: "utf8" });
    assert.deepEqual(inventaire(restauree), { "k1/v1": 45, "k2/v2": 45 });
    // (a) bon trousseau : restauration exploitable.
    assert.equal(cli(restauree, ENV_K12, "verify").fin.verdict, "RESTAURATION_DECHIFFRABLE");
    // (b) K1 détruite après rotation (trousseau courant sans k1) : backup NON exploitable, détecté.
    const sansK1 = { BANK_DATA_ENCRYPTION_KEYS: `k2:${K2}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k2" };
    const b = cli(restauree, sansK1, "verify");
    assert.equal(b.code, 3);
    assert.match(JSON.stringify(b.fin.controle.erreurs), /CLE_MANQUANTE : k1/);
    // (c) mauvaise K2 : détectée par l'empreinte du registre restauré.
    assert.match(JSON.stringify(cli(restauree, { ...ENV_K12, BANK_DATA_ENCRYPTION_KEYS: `k2:${KFAUX}` }, "verify").fin.controle.erreurs), /EMPREINTE_DIFFERENTE/);
    // (d) clé d'un autre environnement (k3 inconnue du registre restauré) en active : refus.
    assert.equal(cli(restauree, { BANK_DATA_ENCRYPTION_KEYS: `k3:${K3}`, BANK_DATA_ENCRYPTION_ACTIVE_KEY_ID: "k3" }, "verify").code, 3);
    // La reprise de rotation fonctionne sur la base restaurée.
    assert.equal(cli(restauree, ENV_K12, "rotate").code, 0);
    assert.deepEqual(inventaire(restauree), { "k2/v2": 90 });
  });

  test("journaux : aucune clé, aucun IBAN complet, aucun clair, aucun chiffré dans les sorties", () => {
    const tout = SORTIES.join("\n");
    assert.ok(tout.length > 1000, "des sorties ont bien été collectées");
    for (const secret of [K1, K2, K3, KFAUX, Buffer.from(K1, "base64").toString("hex")]) assert.ok(!tout.includes(secret), "clé dans les journaux");
    for (let i = 1; i <= 40; i += 1) assert.ok(!tout.includes(ibanTest(i)), "IBAN dans les journaux");
    assert.ok(!tout.includes(BIC), "BIC en clair dans les journaux");
    assert.ok(!/v1:[A-Za-z0-9_-]{16}:|v2:k\d+:A256GCM:/.test(tout), "chiffré dans les journaux");
  });
});
