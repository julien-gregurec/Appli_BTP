// Accès PostgreSQL local du harnais de seeds : psql en tant que `postgres`.
//
// - lancé en root (poste de mission, CI via sudo) : `runuser -u postgres -- psql`, authentification
//   par pair, comme scripts/local-postgres-bootstrap/rebuild_db.sh ;
// - sinon : `psql` avec les variables PG* de l'environnement (PGHOST, PGUSER=postgres…).
//
// stderr n'est jamais masqué : il est renvoyé tel quel à l'appelant, qui l'affiche.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const asRoot = typeof process.getuid === "function" && process.getuid() === 0;

export function psql(db, { file = null, sql = null, args = [], env = {}, timeoutMs = 20 * 60_000 } = {}) {
  const base = ["-X", "-q", "-v", "ON_ERROR_STOP=1", "-d", db, ...args];
  const psqlArgs = file ? [...base, "-f", file] : base;
  const [command, commandArgs] = asRoot ? ["runuser", ["-u", "postgres", "--", "psql", ...psqlArgs]] : ["psql", psqlArgs];
  const result = spawnSync(command, commandArgs, {
    input: sql ?? undefined,
    env: { ...process.env, ...env },
    encoding: "utf8",
    maxBuffer: 256 * 1024 * 1024,
    timeout: timeoutMs,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout ?? "",
    stderr: (result.stderr ?? "") + (result.error ? `\n${result.error.message}` : ""),
  };
}

export function psqlValue(db, sql) {
  const result = psql(db, { sql, args: ["-At"] });
  if (!result.ok) throw new Error(`psql ${db}: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

export function psqlJson(db, sql) {
  const value = psqlValue(db, `select coalesce(json_agg(x), '[]'::json) from (${sql}) x`);
  return JSON.parse(value || "[]");
}

export function dropDatabase(db) {
  psql("postgres", { sql: `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${db}' and pid <> pg_backend_pid();` });
  const result = psql("postgres", { sql: `drop database if exists "${db}";` });
  if (!result.ok) throw new Error(`drop ${db}: ${result.stderr.trim()}`);
}

// search_path hébergé (Supabase : « $user », public, extensions). Réglage par base : il n'est
// PAS copié par CREATE DATABASE … TEMPLATE, d'où son application à chaque clone.
export function applyHostedSearchPath(db) {
  const result = psql("postgres", { sql: `alter database "${db}" set search_path = "$user", public, extensions;` });
  if (!result.ok) throw new Error(`search_path ${db}: ${result.stderr.trim()}`);
}

export function cloneDatabase(template, db) {
  dropDatabase(db);
  const result = psql("postgres", { sql: `create database "${db}" template "${template}";` });
  if (!result.ok) throw new Error(`clone ${template} → ${db}: ${result.stderr.trim()}`);
  applyHostedSearchPath(db);
}

// Fichier temporaire lisible par l'utilisateur système postgres.
export function tempSqlFile(name, content) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "elsatia-seeds-"));
  fs.chmodSync(directory, 0o755);
  const file = path.join(directory, name);
  fs.writeFileSync(file, content, { mode: 0o644 });
  return file;
}
