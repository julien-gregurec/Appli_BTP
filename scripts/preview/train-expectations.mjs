#!/usr/bin/env node
/**
 * ELSATIA — Attendus du train de migrations : une seule source, supabase/migrations.
 *
 * Aucun nombre de migrations, aucune « dernière version » ni aucun nombre de contrôles DB
 * n'est maintenu à la main dans l'outillage Preview. Ce script les calcule et les écrit :
 *   - docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql et
 *     docs/runbooks/sql/ELSATIA_V9_POST_CUTOVER_CHECKS.sql (pack opérateur V9, contrôle 1) :
 *     CTE `attendu_train(nb, derniere)` entre les marqueurs `[train-expectations]` ;
 *   - tout fichier Markdown de docs/ qui porte des marqueurs en ligne :
 *       <!--train:nb-->N<!--/train:nb-->                 nombre de migrations
 *       <!--train:derniere-->V<!--/train:derniere-->     dernière version
 *       <!--train:controles-->C<!--/train:controles-->   nombre de contrôles du DB verify
 *
 * Usage :
 *   node scripts/preview/train-expectations.mjs            # affiche les attendus
 *   node scripts/preview/train-expectations.mjs --write    # met à jour les fichiers
 *   node scripts/preview/train-expectations.mjs --check    # CI : 1 si un fichier dérive
 * Sans réseau, sans dépendance.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { compterControles, versionsLocales } from "./db-verify.mjs";

export { compterControles };

const ROOT = resolve(import.meta.dirname, "../..");
export const VERIFY_SQL = resolve(ROOT, "docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql");
/** SQL post-cutover du pack opérateur V9 : même bloc `attendu_train`, synchronisé ici. */
export const V9_CHECKS_SQL = resolve(ROOT, "docs/runbooks/sql/ELSATIA_V9_POST_CUTOVER_CHECKS.sql");
/** Fichiers SQL qui portent le bloc `[train-expectations]`. */
export const SQL_SYNCHRONISES = Object.freeze([VERIFY_SQL, V9_CHECKS_SQL]);
const DOCS = resolve(ROOT, "docs");

export function attendus(dir = resolve(ROOT, "supabase/migrations"), sql = readFileSync(VERIFY_SQL, "utf8")) {
  const v = versionsLocales(dir);
  return { nb: v.length, derniere: v.at(-1) ?? null, controles: compterControles(sql) };
}

const BLOC_SQL = /(-- \[train-expectations\][^\n]*\n)attendu_train\(nb, derniere\) as \(values \(\d+, '\d{14}'\)\),\n(-- \[\/train-expectations\])/;

export function appliquerSql(sql, a) {
  if (!BLOC_SQL.test(sql)) throw new Error("marqueurs [train-expectations] absents du SQL de vérification");
  return sql.replace(BLOC_SQL, `$1attendu_train(nb, derniere) as (values (${a.nb}, '${a.derniere}')),\n$2`);
}

export function appliquerMarkdown(md, a) {
  return md
    .replace(/<!--train:nb-->[^<]*<!--\/train:nb-->/g, `<!--train:nb-->${a.nb}<!--/train:nb-->`)
    .replace(/<!--train:derniere-->[^<]*<!--\/train:derniere-->/g, `<!--train:derniere-->${a.derniere}<!--/train:derniere-->`)
    .replace(/<!--train:controles-->[^<]*<!--\/train:controles-->/g, `<!--train:controles-->${a.controles}<!--/train:controles-->`);
}

/**
 * Rapports de train canonique (V3, V4, V5…) : chiffres HISTORIQUES de leur train, jamais
 * réécrits par ce générateur, même s'ils portaient un jour un marqueur (train V5).
 */
export const RAPPORTS_HISTORIQUES = /(^|\/)ELSATIA_CANONICAL_TRAIN_[^/]*\.md$/;

function fichiersMarkdown(dir) {
  const out = [];
  for (const nom of readdirSync(dir)) {
    const p = join(dir, nom);
    if (statSync(p).isDirectory()) out.push(...fichiersMarkdown(p));
    else if (nom.endsWith(".md")) out.push(p);
  }
  return out;
}

/** Retourne la liste des fichiers qui changent (et les écrit si `ecrire`). */
export function synchroniser({ ecrire = false } = {}) {
  const sql = readFileSync(VERIFY_SQL, "utf8");
  const a = attendus(undefined, sql);
  const changes = [];
  for (const fichier of SQL_SYNCHRONISES) {
    const actuel = fichier === VERIFY_SQL ? sql : readFileSync(fichier, "utf8");
    const sqlNeuf = appliquerSql(actuel, a);
    if (sqlNeuf !== actuel) {
      changes.push(relative(ROOT, fichier));
      if (ecrire) writeFileSync(fichier, sqlNeuf);
    }
  }
  for (const f of fichiersMarkdown(DOCS)) {
    const md = readFileSync(f, "utf8");
    if (!md.includes("<!--train:") || RAPPORTS_HISTORIQUES.test(relative(ROOT, f))) continue;
    const neuf = appliquerMarkdown(md, a);
    if (neuf !== md) {
      changes.push(relative(ROOT, f));
      if (ecrire) writeFileSync(f, neuf);
    }
  }
  return { attendus: a, changes };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) {
  const ecrire = process.argv.includes("--write");
  const verifier = process.argv.includes("--check");
  const { attendus: a, changes } = synchroniser({ ecrire });
  console.log(`train : ${a.nb} migrations, dernière ${a.derniere} ; DB verify : ${a.controles} contrôles`);
  if (ecrire) {
    console.log(changes.length ? `mis à jour : ${changes.join(", ")}` : "déjà à jour");
  } else if (changes.length) {
    console.log(`DÉRIVE : ${changes.join(", ")} — lancer npm run sync:train-expectations`);
    if (verifier) process.exit(1);
  } else {
    console.log("OK : attendus à jour");
  }
}
