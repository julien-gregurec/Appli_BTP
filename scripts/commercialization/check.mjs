#!/usr/bin/env node
/**
 * ELSATIA — Commercialization Readiness Gate V1 (npm run commercialization:check).
 *
 * Lit le registre de preuves (registry.mjs), sonde le dépôt et les références git LOCALES,
 * écrit :
 *   artifacts/commercialization-readiness.json      résultat machine-readable, sans secret
 *   artifacts/commercialization-readiness.md        résumé lisible
 * et imprime le résumé.
 *
 * Options :
 *   --run-code      exécute aussi les portes locales du code (typecheck, lint, tests, build,
 *                   migrations, seeds, secrets, manifeste…) ; leur code de sortie l'emporte sur
 *                   les rapports (un échec rétrograde le point en NO-GO)
 *   --run-db        (avec PostgreSQL 16 local) rejoue la base neuve (rebuild_db.sh) et le DB
 *                   verify local sur une base jetable `elsatia_gate_*` en 127.0.0.1 uniquement
 *   --db-url <url>  avec --run-db : URL de cette base (défaut
 *                   postgresql://postgres:postgres@127.0.0.1/elsatia_gate_fresh)
 *   --only <a,b>    avec --run-code : limite aux portes nommées
 *   --out <dir>     dossier de sortie (défaut : artifacts)
 *   --quiet         n'imprime que le verdict
 *
 * Code de sortie : 0 GATE PASS · 1 GATE NOT YET PASSED · 2 registre invalide / usage.
 *
 * Garanties : aucun appel réseau (aucun fetch, aucun `git fetch`, aucune CLI distante), aucune
 * lecture de secret, aucune écriture hors du dossier de sortie (et, avec --run-db, de la base
 * locale jetable).
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { contexteDepot, evaluerRegistre, RegistreInvalide, resumeMarkdown } from "./gate.mjs";
import { BASE, EXECUTIONS, EXECUTIONS_DB, REFERENCE_DATES, REGISTRE } from "./registry.mjs";

const ROOT = resolve(import.meta.dirname, "../..");

export function lireArgs(argv) {
  const a = { runCode: false, runDb: false, dbUrl: "postgresql://postgres:postgres@127.0.0.1/elsatia_gate_fresh", only: null, out: "artifacts", quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === "--run-code") a.runCode = true;
    else if (x === "--run-db") a.runDb = true;
    else if (x === "--quiet") a.quiet = true;
    else if (x === "--only") a.only = String(argv[++i] ?? "").split(",").filter(Boolean);
    else if (x === "--out") a.out = argv[++i];
    else if (x === "--db-url") a.dbUrl = argv[++i];
    else throw new Error(`option inconnue : ${x}`);
  }
  return a;
}

/** Base locale jetable uniquement : nom `elsatia_gate_*`, hôte de boucle locale. */
export function exigerBaseLocale(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    throw new Error("--db-url invalide");
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) throw new Error(`--db-url refusée : hôte non local (${u.hostname})`);
  const db = u.pathname.replace(/^\//, "");
  if (!/^elsatia_gate_[a-z0-9_]+$/.test(db)) throw new Error(`--db-url refusée : base « ${db} » hors préfixe elsatia_gate_`);
  return db;
}

function executer(nom, cmd, args, env = {}) {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 256 * 1024 * 1024,
  });
  const duree_s = Math.round((Date.now() - t0) / 100) / 10;
  // stderr d'abord : la dernière ligne utile est celle du résultat (stdout).
  const sortie = `${r.stderr ?? ""}\n${r.stdout ?? ""}`;
  // Dernières lignes utiles seulement (jamais le contenu complet ; aucun secret n'y est lu).
  const fin = sortie
    .split("\n")
    .map((x) => x.replace(/\x1b\[[0-9;]*m/g, "").trimEnd())
    .filter(Boolean)
    .slice(-3)
    .map((x) => x.slice(0, 200));
  return { name: nom, command: [cmd, ...args].join(" "), code: r.status ?? 1, duree_s, tail: fin };
}

function git(args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

export function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = lireArgs(argv);
  } catch (e) {
    console.error(e.message);
    return 2;
  }
  const executions = {};
  if (args.runCode) {
    for (const [nom, def] of Object.entries(EXECUTIONS)) {
      if (args.only && !args.only.includes(nom)) continue;
      if (!args.quiet) console.error(`… ${nom}`);
      executions[nom] = executer(nom, def.cmd, def.args, def.env);
    }
  }
  if (args.runDb) {
    const url = args.dbUrl;
    let db;
    try {
      db = exigerBaseLocale(url);
    } catch (e) {
      console.error(e.message);
      return 2;
    }
    for (const [nom, def] of Object.entries(EXECUTIONS_DB)) {
      if (!args.quiet) console.error(`… ${nom}`);
      executions[nom] = executer(nom, def.cmd, def.args(db), def.env?.(url));
    }
  }

  const ctx = contexteDepot(ROOT, { executions });
  let r;
  try {
    r = evaluerRegistre(REGISTRE, ctx, {
      generated_at: new Date().toISOString(),
      head: git(["rev-parse", "--short=8", "HEAD"]),
      branch: git(["rev-parse", "--abbrev-ref", "HEAD"]),
      base: BASE,
      reference_dates: REFERENCE_DATES,
      run_code: args.runCode,
      run_db: args.runDb,
      executions: Object.values(executions),
    });
  } catch (e) {
    if (e instanceof RegistreInvalide) {
      console.error(`REGISTRE INVALIDE :\n${e.message}`);
      return 2;
    }
    throw e;
  }

  const out = resolve(ROOT, args.out);
  mkdirSync(out, { recursive: true });
  writeFileSync(resolve(out, "commercialization-readiness.json"), `${JSON.stringify(r, null, 2)}\n`);
  const md = resumeMarkdown(r);
  writeFileSync(resolve(out, "commercialization-readiness.md"), md);
  if (args.quiet) console.log(r.verdict);
  else console.log(md);
  console.error(`\n→ ${resolve(out, "commercialization-readiness.json")}\n→ ${resolve(out, "commercialization-readiness.md")}`);
  return r.pass ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main();
