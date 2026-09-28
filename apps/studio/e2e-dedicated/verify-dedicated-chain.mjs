#!/usr/bin/env node
// Contrôle BLOQUANT de la base du projet Supabase DÉDIÉ Studio, après application de la chaîne
// (stack.sh) ou sur toute base locale où elle a été rejouée. Ne se connecte qu'à --db (loopback).
//
//   C1  invariants statiques de ciblage (scripts/verify-migration-targets.mjs, T1–T8) ;
//   C2  registre supabase_migrations = fichiers de apps/studio/supabase/migrations : même NOMBRE,
//       même ORDRE, rien d'oublié, rien en plus ;
//   C3  aucune migration GP : chaque fichier est `…_studio_…` et classé (copie gelée ou dédiée) ;
//   C4  aucune table GP : public ne contient que `studio_*`, aucun schéma applicatif inconnu, aucune
//       table GP connue (entreprises, chantiers, …) dans quelque schéma que ce soit ;
//   C5  toute fonction exécutable par anon/authenticated/service_role dans public est CLASSÉE dans
//       apps/studio/supabase/rpc-classification.json (et toute fonction classée existe).
//
// Usage : node verify-dedicated-chain.mjs --db postgres://postgres@127.0.0.1:56433/postgres [--json]
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { checkMigrationTargets } from "../../../scripts/verify-migration-targets.mjs";

const ROOT = resolve(import.meta.dirname, "../../..");
const argv = process.argv.slice(2);
const db = argv[argv.indexOf("--db") + 1];
if (!db || !/^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost)[:/]/.test(db)) {
  console.error("--db postgres://…@127.0.0.1… requis (base locale uniquement)");
  process.exit(2);
}
const q = (sql) => execFileSync("psql", ["-X", "-q", "-At", "-F", "\t", db, "-c", sql], { encoding: "utf8" }).trim();
const rows = (sql) => (q(sql) ? q(sql).split("\n").map((l) => l.split("\t")) : []);

const errors = [];
const facts = {};

// C1
const static_ = checkMigrationTargets(ROOT);
for (const e of static_.errors ?? static_) errors.push(`C1 ${e}`);

// C2 / C3
const dir = join(ROOT, "apps/studio/supabase/migrations");
const files = readdirSync(dir).filter((n) => n.endsWith(".sql")).sort();
const targets = JSON.parse(readFileSync(join(ROOT, "apps/studio/supabase/migration-targets.json"), "utf8"));
const classified = new Set([...targets.frozen_shared_copies.files, ...targets.dedicated_only.files]);
const applied = rows("select version || '_' || name from supabase_migrations.schema_migrations order by applied_at, version").map((r) => `${r[0]}.sql`);
facts.migration_files = files.length;
facts.migrations_applied = applied.length;
if (applied.length !== files.length) errors.push(`C2 ${applied.length} migration(s) appliquée(s) pour ${files.length} fichier(s)`);
files.forEach((name, i) => {
  if (applied[i] !== name) errors.push(`C2 position ${i + 1} : attendu ${name}, appliqué ${applied[i] ?? "rien"}`);
});
for (const name of applied) if (!files.includes(name)) errors.push(`C2 ${name} appliquée mais absente du dépôt`);
const versions = files.map((n) => n.slice(0, 14));
versions.forEach((v, i) => {
  if (i && v <= versions[i - 1]) errors.push(`C2 ordre : ${files[i]} n'est pas strictement après ${files[i - 1]}`);
});
for (const name of files) {
  if (!/^\d{14}_studio_[a-z0-9_]+\.sql$/.test(name)) errors.push(`C3 ${name} : migration non Studio dans la chaîne dédiée`);
  if (!classified.has(name)) errors.push(`C3 ${name} : migration Studio non classée (migration-targets.json)`);
}

// C4
const GP_TABLES = [
  "entreprises", "utilisateurs_entreprises", "chantiers", "clients", "devis", "factures", "salaries",
  "employes", "abonnements", "applications_elsatia", "elsatia_identity_subjects", "elsatia_identity_outbox",
  "reserves", "interventions", "fournisseurs", "bulletins_paie",
];
const publicTables = rows("select tablename from pg_tables where schemaname = 'public' order by 1").map((r) => r[0]);
facts.public_tables = publicTables.length;
const foreign = publicTables.filter((t) => !t.startsWith("studio_"));
if (foreign.length) errors.push(`C4 table(s) non Studio dans public : ${foreign.join(", ")}`);
const gpAnywhere = rows(
  `select schemaname || '.' || tablename from pg_tables where tablename in (${GP_TABLES.map((t) => `'${t}'`).join(",")})`,
).map((r) => r[0]);
if (gpAnywhere.length) errors.push(`C4 table(s) GP présentes : ${gpAnywhere.join(", ")}`);
const PLATFORM_SCHEMAS = new Set(["public", "auth", "storage", "extensions", "supabase_migrations", "information_schema", "pg_catalog", "pg_toast"]);
const schemas = rows("select nspname from pg_namespace where nspname not like 'pg\\_temp%' and nspname not like 'pg\\_toast\\_temp%' order by 1").map((r) => r[0]);
const unknownSchemas = schemas.filter((s) => !PLATFORM_SCHEMAS.has(s) && !s.startsWith("studio_"));
if (unknownSchemas.length) errors.push(`C4 schéma(s) applicatif(s) non Studio : ${unknownSchemas.join(", ")}`);
facts.studio_schemas = schemas.filter((s) => s.startsWith("studio_"));

// C5
const manifest = JSON.parse(readFileSync(join(ROOT, "apps/studio/supabase/rpc-classification.json"), "utf8"));
const classes = Object.fromEntries(
  Object.entries(manifest.classes).flatMap(([cls, v]) => v.functions.map((f) => [f, cls])),
);
const exposed = rows(`
  select distinct p.proname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prokind = 'f'
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and (has_function_privilege('anon', p.oid, 'execute')
       or has_function_privilege('authenticated', p.oid, 'execute')
       or has_function_privilege('service_role', p.oid, 'execute'))
   order by 1`).map((r) => r[0]);
facts.exposed_functions = exposed.length;
const unclassified = exposed.filter((f) => !classes[f]);
if (unclassified.length) errors.push(`C5 RPC non classée(s) : ${unclassified.join(", ")}`);
const stale = Object.keys(classes).filter((f) => !exposed.includes(f));
if (stale.length) errors.push(`C5 RPC classée(s) mais absente(s)/non exposée(s) : ${stale.join(", ")}`);
// Rôle appelant conforme à la classe : une fonction « service_role » n'est jamais exécutable par
// authenticated ; une fonction utilisateur l'est.
const authExec = new Set(
  rows(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('authenticated', p.oid, 'execute')`).map((r) => r[0]),
);
for (const [cls, v] of Object.entries(manifest.classes))
  for (const f of v.functions) {
    if (v.caller === "service_role" && authExec.has(f)) errors.push(`C5 ${f} (${cls}) exécutable par authenticated`);
    if (v.caller === "authenticated" && exposed.includes(f) && !authExec.has(f)) errors.push(`C5 ${f} (${cls}) non exécutable par authenticated`);
  }
// anon ne doit exécuter que ce que la classification lui ouvre explicitement.
const anonExec = rows(`
  select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'execute')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')`).map((r) => r[0]);
const anonAllowed = new Set(manifest.anon_allowed ?? []);
const anonLeak = anonExec.filter((f) => !anonAllowed.has(f));
facts.anon_executable = anonExec.length;
if (anonLeak.length) errors.push(`C5 exécutable(s) par anon hors liste anon_allowed : ${anonLeak.join(", ")}`);

if (argv.includes("--json")) console.log(JSON.stringify({ ok: errors.length === 0, errors, facts }, null, 2));
else {
  for (const e of errors) console.error(`✖ ${e}`);
  console.log(
    `${errors.length ? "ÉCHEC" : "OK"} chaîne dédiée : ${facts.migrations_applied}/${facts.migration_files} migrations dans l'ordre, ` +
      `${facts.public_tables} tables public (toutes studio_*), ${facts.exposed_functions} fonctions exposées classées, anon ${facts.anon_executable}`,
  );
}
process.exit(errors.length ? 1 : 0);
