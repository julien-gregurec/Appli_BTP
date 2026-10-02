// Test statique du registre des seeds — `npm run test:seeds` (sans base, sans réseau).
//
// Échoue si :
//   - un script de données apparaît dans le dépôt sans être classé dans scripts/seeds/registry.mjs ;
//   - une entrée du registre pointe vers un fichier absent, ou reste BROKEN / UNKNOWN ;
//   - un script actif n'a ni exécution réelle dans le harnais, ni couverture déclarée ;
//   - un contournement de garde (désactivation de trigger, replica, capacité) n'est pas déclaré ;
//   - un script LEGACY reste exécutable par le wrapper ou n'est pas marqué comme tel ;
//   - un script SQL insère un document déjà engagé (devis accepté, facture émise, commande
//     envoyée…) : patron refusé par les verrous du train — créer en brouillon, poser les lignes,
//     puis appliquer les transitions métier.
// L'exécution réelle sur base fraîche est `npm run verify:seeds` (scripts/seeds/verify-seeds.mjs).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { REGISTRE_SCRIPTS, SCRIPTS_LEGACY } from "../garde-scripts-production.mjs";
import { CLASSES, SEEDS, seedById } from "./registry.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ACTIVE_CLASSES = new Set(["ACTIVE", "CI_ONLY", "PREVIEW", "PRODUCTION_TOOL"]);
// Couvertures déclarées hors de ce harnais (suites pgTAP, CI Studio, recette avec passerelle).
// "upgrade-harness" : exécuté par scripts/qualification/upgrade-v4-v5.sh (base V4 construite depuis V3), upgrade-v5-v6.sh (base V5)
// ou upgrade-v6-v7.sh (base V6) : le complément suppose un état antérieur au train courant, jamais une base fraîche.
// "dr-v2-drill" : exécuté par scripts/dr/v2/drill.sh (`npm run dr:verify`) sur des bases jetables
// elsatia_dr_v2_* dérivées de la base du harnais d'upgrade (docs/qualification/ELSATIA_DISASTER_RECOVERY_RESTORE_V2.md).
const EXTERNAL_COVERAGE = new Set(["infrastructure", "pgtap", "studio-ci", "non-executable-sans-passerelle", "upgrade-harness", "dr-v2-drill"]);

// Où vivent les scripts de données, et à quoi ils ressemblent.
const DISCOVERY = [
  { dir: "supabase/production/", match: /\.sql$/ },
  { dir: "supabase/tests/fixtures/", match: /\.inc$/ },
  { dir: "scripts/dr/", match: /\.sql$/ },
  { dir: "scripts/perf/", match: /\.sql$/ },
  { dir: "scripts/e2e/", match: /\.(sql|mjs|sh)$/, exclude: /\.test\.mjs$/ },
  { dir: "scripts/", match: /^scripts\/seed[^/]*\.mjs$/, exclude: /\.test\.mjs$/ },
  { dir: "scripts/local-postgres-bootstrap/", match: /seed[^/]*\.sql$/ },
  { dir: "tests/e2e/fixtures/", match: /\.sql$/ },
  { dir: "docs/qualification/witnesses/", match: /seed[^/]*\.sql$/ },
  { dir: "apps/", match: /^apps\/[^/]+\/scripts\/[^/]*(seed|fixture|benchmark|demo)[^/]*\.sql$/ },
];

function trackedFiles() {
  return execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
}

function discovered() {
  return trackedFiles().filter((file) => DISCOVERY.some((rule) =>
    file.startsWith(rule.dir) && rule.match.test(file) && !(rule.exclude?.test(file))));
}

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), "utf8");
}

// Code SQL sans commentaires ni chaînes de caractères : les mots-clés cités dans une explication
// ou un message ne comptent pas comme un contournement.
function sqlCode(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''");
}

test("tout script de données du dépôt est classé dans le registre", () => {
  const registered = new Set(SEEDS.map((seed) => seed.path));
  const missing = discovered().filter((file) => !registered.has(file) && !file.startsWith("scripts/seeds/"));
  assert.deepEqual(missing, [], `scripts non classés : ajoutez-les à scripts/seeds/registry.mjs\n${missing.join("\n")}`);
});

test("chaque entrée du registre désigne un fichier suivi, avec un identifiant unique", () => {
  const tracked = new Set(trackedFiles());
  const ids = new Set();
  for (const seed of SEEDS) {
    assert.ok(tracked.has(seed.path), `${seed.id}: ${seed.path} absent du dépôt`);
    assert.ok(!ids.has(seed.id), `identifiant dupliqué ${seed.id}`);
    ids.add(seed.id);
    assert.ok(CLASSES.includes(seed.classification), `${seed.id}: classe inconnue ${seed.classification}`);
    assert.ok(seed.target, `${seed.id}: cible non documentée`);
  }
});

test("aucun seed ne reste BROKEN ou UNKNOWN", () => {
  const open = SEEDS.filter((seed) => seed.classification === "BROKEN" || seed.classification === "UNKNOWN");
  assert.deepEqual(open.map((seed) => `${seed.id} (${seed.classification})`), []);
});

test("chaque script actif est exécuté par le harnais ou couvert explicitement", () => {
  for (const seed of SEEDS.filter((item) => ACTIVE_CLASSES.has(item.classification))) {
    if (seed.harness) {
      assert.ok(seed.harness.run?.length, `${seed.id}: harnais sans étape run`);
      assert.ok(Number.isInteger(seed.harness.runs) && seed.harness.runs >= 1, `${seed.id}: runs invalide`);
      if (seed.idempotent) assert.ok(seed.harness.runs >= 2, `${seed.id}: rejouable annoncé mais exécuté une seule fois`);
      for (const step of [...(seed.harness.setup ?? []), ...seed.harness.run]) {
        if (step.seed) assert.ok(seedById(step.seed)?.harness, `${seed.id}: prérequis ${step.seed} non exécutable`);
      }
      continue;
    }
    assert.ok(seed.coveredBy, `${seed.id}: ni harnais ni couverture déclarée`);
    assert.ok(EXTERNAL_COVERAGE.has(seed.coveredBy) || seedById(seed.coveredBy)?.harness,
      `${seed.id}: couverture ${seed.coveredBy} inconnue ou non exécutée`);
  }
});

test("le seed Preview de l'année de recette est exécuté, rejoué 3 fois et testé en reprise", () => {
  const seed = seedById("preview-year");
  assert.equal(seed.path, "scripts/seed-elsatia-preview-year.mjs");
  assert.equal(seed.harness.runs, 3);
  assert.equal(seed.harness.flow, "interruption");
  assert.equal(seedById("dr-synthetic").harness.flow, "dr");
  assert.equal(seedById("pilote-btp").harness.flow, "pilote-cycle");
});

test("tout contournement de garde est déclaré et borné aux fixtures", () => {
  const patterns = {
    "disable trigger": /\bdisable\s+trigger\b/i,
    session_replication_role: /\bsession_replication_role\b/i,
    capacite_personnes_bypass: /capacite_personnes_bypass/i,
  };
  for (const seed of SEEDS.filter((item) => item.classification !== "LEGACY")) {
    if (!/\.(sql|inc)$/.test(seed.path)) continue;
    const code = sqlCode(read(seed.path));
    for (const [kind, pattern] of Object.entries(patterns)) {
      if (!pattern.test(code)) continue;
      assert.ok(seed.bypass?.[kind], `${seed.id}: contournement « ${kind} » non déclaré dans le registre`);
    }
    for (const kind of Object.keys(seed.bypass ?? {})) {
      assert.ok(patterns[kind]?.test(code), `${seed.id}: contournement « ${kind} » déclaré mais absent du script`);
    }
  }
});

test("un script qui désactive un trigger le fait nommément, dans une transaction, et le réactive", () => {
  for (const seed of SEEDS.filter((item) => item.bypass?.["disable trigger"])) {
    const code = sqlCode(read(seed.path));
    assert.doesNotMatch(code, /disable\s+trigger\s+(all|user)\b/i, `${seed.id}: désactivation globale`);
    const disabled = [...code.matchAll(/alter\s+table\s+(\S+)\s+disable\s+trigger\s+(\w+)/gi)].map((match) => `${match[1]} ${match[2]}`);
    const enabled = [...code.matchAll(/alter\s+table\s+(\S+)\s+enable\s+trigger\s+(\w+)/gi)].map((match) => `${match[1]} ${match[2]}`);
    assert.ok(disabled.length > 0);
    assert.deepEqual([...enabled].sort(), [...disabled].sort(), `${seed.id}: triggers non réactivés`);
    const begin = code.search(/\bbegin\s*;/i);
    const commit = code.search(/\bcommit\s*;/i);
    assert.ok(begin >= 0 && begin < code.search(/disable\s+trigger/i), `${seed.id}: désactivation hors transaction`);
    assert.ok(commit > code.lastIndexOf("enable trigger"), `${seed.id}: réactivation après le commit`);
  }
});

test("les scripts LEGACY sont marqués et refusés par le wrapper Preview", () => {
  for (const seed of SEEDS.filter((item) => item.classification === "LEGACY")) {
    assert.ok(seed.reason, `${seed.id}: motif LEGACY absent`);
    const name = path.basename(seed.path);
    assert.equal(Object.hasOwn(REGISTRE_SCRIPTS, name), false, `${seed.id}: encore exécutable par le wrapper`);
    if (seed.path.startsWith("supabase/production/") && !seed.path.includes("/archive/")) {
      assert.ok(Object.hasOwn(SCRIPTS_LEGACY, name), `${seed.id}: refus LEGACY non motivé dans le wrapper`);
    }
    if (!seed.path.startsWith("docs/")) {
      assert.match(read(seed.path).slice(0, 2000), /LEGACY|NE_PAS_EXECUTER|NE PAS EXÉCUTER|NE JAMAIS EXÉCUTER/, `${seed.id}: en-tête LEGACY absent`);
    }
  }
});

test("le registre du wrapper Preview ne contient que des scripts actifs du registre des seeds", () => {
  for (const name of Object.keys(REGISTRE_SCRIPTS)) {
    const seed = SEEDS.find((item) => item.path === `supabase/production/${name}`);
    assert.ok(seed, `${name}: absent du registre des seeds`);
    assert.ok(["PREVIEW", "PRODUCTION_TOOL"].includes(seed.classification), `${name}: classé ${seed.classification}`);
  }
});

test("aucun script SQL actif n'insère un document déjà engagé avant ses lignes", () => {
  // Tables à verrou d'engagement et statuts qui interdisent d'ajouter des lignes ensuite.
  const engaged = {
    devis: /'(accepte)'/,
    factures: /'(envoyee|payee|payee_partiel|en_retard|avoir_emis)'/,
    commandes_fournisseurs: /'(envoyee|confirmee|recue|recue_partiel)'/,
  };
  // Squelettes pgTAP d'isolation : documents engagés sans aucune ligne, jamais complétés ensuite.
  // Train V9 : même cas pour le jeu de charge « rentabilité » (en-têtes de devis / factures
  // porteurs de montants pour les agrégats, aucune ligne ajoutée, purgés à chaque cycle).
  const exempt = new Set(["pgtap-isolation", "perf-rentabilite"]);
  const offenders = [];
  for (const seed of SEEDS.filter((item) => ACTIVE_CLASSES.has(item.classification) && !exempt.has(item.id))) {
    if (!/\.(sql|inc)$/.test(seed.path)) continue;
    const raw = read(seed.path).replace(/--[^\n]*/g, " ");
    for (const [table, status] of Object.entries(engaged)) {
      for (const match of raw.matchAll(new RegExp(`insert\\s+into\\s+public\\.${table}\\s*\\(([^)]*)\\)([\\s\\S]*?);`, "gi"))) {
        const [statement, columns, rest] = match;
        if (!/\bstatut\b/.test(columns)) continue;
        // Valeurs littérales seulement (une sous-requête « where statut = 'accepte' » n'est pas une insertion engagée).
        const values = rest.split(/\bwhere\b|\bon\s+conflict\b/i)[0];
        if (status.test(values)) offenders.push(`${seed.id}: ${statement.slice(0, 80).replace(/\s+/g, " ")}…`);
      }
    }
  }
  assert.deepEqual(offenders, []);
});
