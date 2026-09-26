#!/usr/bin/env node
/**
 * ELSATIA — Preflight Preview consolidé (mission de clôture des blockers, §10).
 *
 * Composition, pas duplication : appelle `runPreflight` (scripts/lib/env-manifest-preflight.mjs,
 * déjà couvert par 58 tests) pour chaque application/unité contre son gabarit `.env.preview.example`
 * (ou l'environnement réel du processus avec `--live`), puis ajoute UNE vérification qui
 * n'existait nulle part ailleurs : la présence des buckets Storage attendus, en lecture seule.
 *
 * AUCUNE valeur d'environnement n'est jamais affichée. AUCUNE écriture réseau — la seule requête
 * réseau possible est un GET en lecture seule sur /storage/v1/bucket, et seulement si une clé de
 * service est fournie pour l'app concernée (l'accès anonyme à cette route est révoqué en
 * production/preview par migration — voir docs/runbooks/ELSATIA_PREVIEW_DOMAINS_STORAGE_STRIPE_V1.md §8).
 *
 * Volontairement PAS branché sur `npm run build`/`prebuild`/`verify` : ce script est un outil
 * d'inventaire pour un opérateur avant un provisioning Preview réel, pas un nouveau gate global —
 * `preflight_enforcement` du manifeste reste en mode `report` (voir config/env-manifest.json),
 * inchangé par ce livrable, exactement comme demandé par la mission.
 *
 * Usage :
 *   node scripts/preflight-preview.mjs                    # tous les gabarits .env.preview.example
 *   node scripts/preflight-preview.mjs --app colors,studio # sous-ensemble
 *   node scripts/preflight-preview.mjs --live               # process.env réel, pas les gabarits
 *   node scripts/preflight-preview.mjs --skip-storage       # saute la vérification buckets
 *
 * Code de sortie : toujours 0 (mode rapport, cohérent avec preflight_enforcement=report). Utiliser
 * --strict pour un code 1 en cas d'erreur (jamais appelé automatiquement par ce dépôt).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadJson, MANIFEST_PATH } from "./lib/env-manifest-core.mjs";
import { parseEnvFile, runPreflight } from "./lib/env-manifest-preflight.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

/** Une entrée par unité `applications` du manifeste qui possède un gabarit Preview dédié. */
export const PREVIEW_TARGETS = [
  { app: "gestion_pro", envFile: ".env.preview.example" },
  { app: "colors", envFile: "apps/colors/.env.preview.example" },
  { app: "tools", envFile: "apps/tools/.env.preview.example" },
  { app: "reserves", envFile: "apps/reserves/.env.preview.example" },
  { app: "studio", envFile: "apps/studio/.env.preview.example" },
  { app: "studio_worker", envFile: "workers/studio-video/.env.example" },
];

/** Buckets attendus, extraits de supabase/migrations/*.sql (docs/runbooks/ELSATIA_PREVIEW_DOMAINS_STORAGE_STRIPE_V1.md §8). */
export const EXPECTED_BUCKETS = [
  "entreprise-assets", "chantier-documents", "pointage-preuves", "factures-fournisseurs",
  "documents-employes", "notes-frais", "notes-frais-exports", "bulletins-paie",
  "fiches-techniques", "documents-paie", "messagerie-medias", "devis-medias",
  "colors-seaux", "reserves-photos", "reserves-plans", "communications-elsatia",
  "studio-originals", "studio-renders",
];

/** Pure : ne fait aucun appel réseau. Testable indépendamment (tests/preflight-preview.test.mjs). */
export function missingBuckets(expected, present) {
  const have = new Set(present);
  return expected.filter((id) => !have.has(id));
}

/** Seul appel réseau du script : un GET en lecture seule, jamais de création/suppression. */
async function fetchBucketIds({ supabaseUrl, serviceKey }) {
  const r = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/storage/v1/bucket`, {
    method: "GET",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`storage/v1/bucket a répondu ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error("réponse inattendue (pas un tableau)");
  return data.map((b) => b.id ?? b.name).filter(Boolean);
}

async function checkStorageBuckets(env) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.STUDIO_STORAGE_SERVICE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return { skipped: true, reason: "aucune clé de service fournie pour cette cible — vérification ignorée (jamais bloquant)" };
  }
  try {
    const present = await fetchBucketIds({ supabaseUrl, serviceKey });
    const missing = missingBuckets(EXPECTED_BUCKETS, present);
    return { skipped: false, missing };
  } catch (error) {
    return { skipped: true, reason: `appel réseau impossible (${error instanceof Error ? error.message : String(error)})` };
  }
}

async function main() {
  const manifest = loadJson(ROOT, MANIFEST_PATH);
  const wantedApps = (option("--app") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const targets = wantedApps.length
    ? PREVIEW_TARGETS.filter((t) => wantedApps.includes(t.app))
    : PREVIEW_TARGETS;
  const live = flag("--live");
  let totalErrors = 0;

  console.log("ELSATIA — preflight Preview consolidé (rapport, non bloquant)");
  console.log("Aucune valeur d'environnement n'est affichée.\n");

  for (const { app, envFile } of targets) {
    let env = process.env;
    let source = "process.env (--live)";
    if (!live) {
      try {
        env = parseEnvFile(readFileSync(resolve(ROOT, envFile), "utf8"));
        source = envFile;
      } catch {
        console.log(`── ${app} : gabarit ${envFile} introuvable, ignoré\n`);
        continue;
      }
    }
    const { findings } = runPreflight(manifest, env, { target: "preview", apps: [app], phase: "all" });
    const errors = findings.filter((f) => f.level === "error");
    totalErrors += errors.length;
    console.log(`── ${app} (source : ${source})`);
    if (!errors.length) console.log("   ENV : aucune erreur.");
    for (const f of errors) console.log(`   ✖ [${f.code}] ${f.subject} — ${f.message}`);

    if (!flag("--skip-storage") && (app === "gestion_pro" || app === "colors" || app === "reserves" || app === "studio_worker")) {
      const storage = await checkStorageBuckets(env);
      if (storage.skipped) console.log(`   Storage : ignoré (${storage.reason})`);
      else if (!storage.missing.length) console.log("   Storage : tous les buckets attendus sont présents.");
      else console.log(`   Storage : ${storage.missing.length} bucket(s) attendu(s) absent(s) — ${storage.missing.join(", ")} (rejouer les migrations avant d'exposer cette Preview)`);
    }
    console.log("");
  }

  console.log(totalErrors ? `NO-GO (rapport) : ${totalErrors} erreur(s) ENV au total.` : "GO (rapport) : aucune erreur ENV.");
  process.exitCode = flag("--strict") ? (totalErrors ? 1 : 0) : 0;
}

if (process.env.PREFLIGHT_PREVIEW_SKIP_MAIN !== "1") await main();
