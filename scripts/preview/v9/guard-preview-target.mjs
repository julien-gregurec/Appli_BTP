#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : garde de cible Preview (Phase B).
 *
 * Refuse toute exécution si UNE indication de cible n'est pas exactement `pgvvpqyjziyapbbkydmc` :
 * --ref, supabase/.temp/project-ref (projet lié par la CLI), SUPABASE_PROJECT_REF,
 * NEXT_PUBLIC_SUPABASE_URL, ELSATIA_PREVIEW_DB_URL. Refuse aussi : valeur vide, ref inconnue,
 * Production (exhvuzegsefmoguxoiak), hôte de Production, environment=production, branche main /
 * release / production.
 *
 * Usage :
 *   node scripts/preview/v9/guard-preview-target.mjs [--ref <ref>] [--environment preview]
 *        [--app-url https://…] [--no-linked] [--no-git]
 * Sortie : « TARGET_PREVIEW_CONFIRMED » (0) ou « TARGET_REJECTED » + motifs (2).
 * N'affiche jamais une URL complète, un mot de passe ni une clé : seulement des références.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { estPointEntree, lireOptions } from "../lib/preview-guard.mjs";
import { evaluerCible } from "./lib/cible.mjs";
import { ROOT } from "./lib/train.mjs";

export function lireRefLiee(root = ROOT) {
  const f = resolve(root, "supabase/.temp/project-ref");
  return existsSync(f) ? readFileSync(f, "utf8") : undefined;
}

export function brancheCourante(root = ROOT) {
  const r = spawnSync("git", ["-C", root, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : "";
}

export function executer(argv, env = process.env, log = console.log) {
  const o = lireOptions(argv);
  const urls = [];
  for (let i = 0; i < argv.length; i += 1) if (argv[i] === "--app-url" && argv[i + 1]) urls.push(argv[i + 1]);
  const r = evaluerCible({
    ref: typeof o.ref === "string" ? o.ref : o.ref === true ? "" : undefined,
    refLiee: o["no-linked"] ? undefined : lireRefLiee(),
    environment: typeof o.environment === "string" ? o.environment : undefined,
    branche: o["no-git"] ? undefined : brancheCourante(),
    urlsApp: urls,
    env,
  });
  log(r.verdict);
  if (r.ok) log(`  ref=${r.ref} (sources : ${r.sources.join(", ")})`);
  else for (const m of r.motifs) log(`  ✖ ${m}`);
  return r.ok ? 0 : 2;
}

if (estPointEntree(import.meta.url)) process.exitCode = executer(process.argv.slice(2));
