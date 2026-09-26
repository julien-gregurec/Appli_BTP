#!/usr/bin/env node
/**
 * ELSATIA — Contrôle du manifeste d'environnement (config/env-manifest.json).
 *
 * Trois modes. AUCUN n'affiche ni ne journalise la valeur d'une variable.
 *
 *   1. Dépôt (CI, poste dev) — code ↔ manifeste ↔ gabarits .env.example :
 *        node scripts/check-env-manifest.mjs [--rev <git-rev>] [--json] [--fail-on-decision] [--verbose]
 *
 *   2. Preflight de déploiement (opérateur) — un environnement fourni ↔ manifeste :
 *        node scripts/check-env-manifest.mjs --preflight --environment preview|production \
 *            --app gestion_pro[,colors,…] [--env-file chemin] [--phase build|runtime|all]
 *      Sans --env-file, lit les variables du processus. Ne se connecte à rien.
 *
 *   3. Avant build (npm prebuild) — actif seulement sur un vrai build Vercel (VERCEL_ENV =
 *      preview|production), ignoré partout ailleurs :
 *        node scripts/check-env-manifest.mjs --auto --app gestion_pro
 *      Le manifeste décide, PAR CIBLE, si les erreurs bloquent (enforce) ou sont seulement
 *      rapportées (report) : `preflight_enforcement_by_target.<preview|production>`, à défaut
 *      `preflight_enforcement`. Coupe-circuit opérateur, dans le seul sens qui désarme :
 *      ELSATIA_PREFLIGHT_ENFORCEMENT=report (posée sur le projet Vercel) ramène le build à
 *      « report » et le dit. Aucune autre valeur n'est honorée : on ne durcit jamais par là.
 *
 * Sortie : code 0 (aucune erreur) / 1 (au moins une erreur).
 */
import { appendFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MANIFEST_PATH, SCHEMA_PATH, checkManifest, loadJson, resolveEnforcement } from "./lib/env-manifest-core.mjs";
import { createGitSource, runRepoChecks } from "./lib/env-manifest-scan.mjs";
import { detectVercelTarget, parseEnvFile, runPreflight } from "./lib/env-manifest-preflight.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1] ?? null;
};

const ICON = { error: "✖", warning: "▲", decision: "◆", info: "·" };
const ORDER = ["error", "decision", "warning", "info"];
const ANNOTATE = { error: "error", warning: "warning", decision: "warning" };

function annotate(f) {
  if (process.env.GITHUB_ACTIONS !== "true" || !ANNOTATE[f.level]) return;
  const message = `${f.subject} — ${f.message}`.replace(/[\r\n%]/g, " ");
  console.log(`::${ANNOTATE[f.level]} title=${f.code}::${message}`);
}

function print(findings, { verbose = false } = {}) {
  const counts = Object.fromEntries(ORDER.map((l) => [l, 0]));
  for (const f of findings) counts[f.level]++;
  for (const level of ORDER) {
    const list = findings.filter((f) => f.level === level);
    if (!list.length) continue;
    const shown = level === "info" && !verbose ? [] : level === "warning" && !verbose ? list.slice(0, 12) : list;
    console.log(`\n${ICON[level]} ${level.toUpperCase()} (${list.length})`);
    for (const f of shown) {
      console.log(`  ${ICON[level]} [${f.code}] ${f.subject} — ${f.message}`);
      annotate(f);
    }
    if (shown.length < list.length) console.log(`  … ${list.length - shown.length} de plus (--verbose)`);
  }
  return counts;
}

function summary(lines) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join("\n") + "\n");
}

function loadManifest() {
  const rawText = readFileSync(`${ROOT}/${MANIFEST_PATH}`, "utf8");
  return { manifest: JSON.parse(rawText), schema: loadJson(ROOT, SCHEMA_PATH), rawText };
}

// ── Mode preflight / auto ───────────────────────────────────────────────────

function runPreflightMode({ auto }) {
  const { manifest, schema, rawText } = loadManifest();
  const apps = (option("--app") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!apps.length) { console.error("--app est obligatoire (ex. --app gestion_pro)"); return 2; }

  let target = option("--environment");
  let env = process.env;
  if (auto) {
    target = detectVercelTarget(process.env);
    if (!target) {
      if (process.env.VERCEL?.trim() === "1" && !process.env.VERCEL_ENV?.trim()) {
        // Sur Vercel, VERCEL_ENV n'est visible au build que si les variables système sont exposées
        // (réglage projet). Sans elle, ce contrôle ne peut pas savoir qu'il tourne en Preview.
        console.warn("[env-manifest] ATTENTION : build Vercel sans VERCEL_ENV — activer « Automatically expose System Environment Variables » sur le projet, sinon ce preflight ne s'applique pas.");
      }
      console.log("[env-manifest] build hors Vercel Preview/Production : preflight ignoré.");
      return 0;
    }
  } else if (option("--env-file")) {
    env = parseEnvFile(readFileSync(resolve(option("--env-file")), "utf8"));
  }

  const structural = checkManifest(manifest, schema, rawText).filter((f) => f.level === "error");
  const { findings, rows } = runPreflight(manifest, env, { target, apps, phase: option("--phase") ?? (auto ? "build" : "all") });
  const all = [...structural, ...findings];

  console.log(`ELSATIA — preflight d'environnement : cible ${target}, application(s) ${apps.join(", ")}`);
  console.log("Aucune valeur n'est affichée. Tableau : variable · requise · état\n");
  for (const r of rows) console.log(`  ${r.required ? "requise " : "optionnelle"}  ${r.state.padEnd(8)}  ${r.name}${r.secret ? "  (secret)" : ""}${r.dr ? "  [DR]" : ""}`);
  const counts = print(all, { verbose: true });
  summary([`### Preflight ${target} (${apps.join(", ")})`, `Erreurs : ${counts.error} · avertissements : ${counts.warning}`]);

  if (auto) {
    let enforcement = resolveEnforcement(manifest, target);
    if (enforcement === "enforce" && process.env.ELSATIA_PREFLIGHT_ENFORCEMENT?.trim() === "report") {
      console.log("\n[env-manifest] COUPE-CIRCUIT : ELSATIA_PREFLIGHT_ENFORCEMENT=report sur ce déploiement — le manifeste demande « enforce » pour cette cible, le build n'est PAS bloqué.");
      enforcement = "report";
    }
    console.log(`[env-manifest] cible ${target} : mode ${enforcement}.`);
    if (counts.error && enforcement === "report") {
      console.log(`\n[env-manifest] MODE REPORT : ${counts.error} erreur(s) NON bloquante(s) pour la cible ${target}. Voir preflight_enforcement_by_target dans ${MANIFEST_PATH}.`);
      return 0;
    }
  }
  console.log(counts.error ? `\nNO-GO : ${counts.error} erreur(s).` : "\nGO : aucune erreur.");
  return counts.error ? 1 : 0;
}

// ── Mode dépôt ──────────────────────────────────────────────────────────────

function runRepoMode() {
  const { manifest, schema, rawText } = loadManifest();
  const rev = option("--rev");
  const structural = checkManifest(manifest, schema, rawText);
  const structuralErrors = structural.filter((f) => f.level === "error");
  let findings = structural;
  let stats = null;
  if (!structuralErrors.length) {
    const source = createGitSource({ root: ROOT, rev });
    const result = runRepoChecks(manifest, source);
    findings = [...structural, ...result.findings];
    stats = result.stats;
  }

  if (flag("--json")) {
    console.log(JSON.stringify({ stats, findings }, null, 2));
    return findings.some((f) => f.level === "error") ? 1 : 0;
  }

  const vars = manifest.variables;
  const dr = vars.filter((v) => v.dr_critical);
  console.log(`ELSATIA — manifeste d'environnement (${MANIFEST_PATH})`);
  console.log(`  source analysée : ${stats?.source ?? "(manifeste invalide)"}`);
  console.log(`  ${vars.length} variables · ${Object.keys(manifest.applications).length} applications · ${vars.filter((v) => v.secret).length} secrets · ${vars.filter((v) => v.deprecated).length} dépréciées · ${vars.filter((v) => v.category === "feature_flag").length} drapeaux`);
  if (stats) console.log(`  ${stats.filesScanned} fichiers de code analysés · ${stats.usages} usages · ${stats.distinctNames} noms distincts lus`);
  console.log(`  registre DR : ${dr.length} variable(s) [${dr.map((v) => v.name).join(", ")}] + ${(manifest.external_secrets ?? []).filter((s) => s.dr_critical).length} secret(s) externe(s)`);

  const counts = print(findings, { verbose: flag("--verbose") });
  const failDecision = flag("--fail-on-decision") && counts.decision > 0;

  const open = (manifest.findings ?? []).filter((f) => f.status === "open" || f.status === "detected");
  if (open.length) {
    const bySev = ["P0", "P1", "P2"].map((s) => `${s}:${open.filter((f) => f.severity === s).length}`).join(" ");
    console.log(`\nConstats ouverts au manifeste : ${open.length} (${bySev}) — voir docs/qualification/ELSATIA_ENV_MANIFEST_AND_CI_V1.md`);
  }
  summary([
    "### Manifeste d'environnement",
    `| Erreurs | Décisions | Avertissements |\n|---:|---:|---:|\n| ${counts.error} | ${counts.decision} | ${counts.warning} |`,
  ]);

  if (counts.error || failDecision) {
    console.log(`\nÉCHEC : ${counts.error} erreur(s)${failDecision ? `, ${counts.decision} décision(s) en attente (--fail-on-decision)` : ""}.`);
    return 1;
  }
  console.log(`\nOK : aucune erreur${counts.decision ? ` — ${counts.decision} décision(s) DECISION_REQUIRED en attente (non bloquantes)` : ""}.`);
  return 0;
}

try {
  process.exitCode = flag("--preflight") ? runPreflightMode({ auto: false }) : flag("--auto") ? runPreflightMode({ auto: true }) : runRepoMode();
} catch (error) {
  // Le message d'une erreur système peut citer un chemin, jamais une valeur d'environnement.
  const message = error instanceof Error ? error.message : String(error);
  if (flag("--auto")) {
    // Avant build : une panne du CONTRÔLEUR ne doit pas empêcher un déploiement (le contrôle
    // protège, il ne doit pas devenir une cause d'indisponibilité). On le dit, on ne bloque pas.
    console.warn(`[env-manifest] contrôle avant build IGNORÉ (panne interne : ${message}).`);
    process.exitCode = 0;
  } else {
    console.error(`[env-manifest] échec du contrôle : ${message}`);
    process.exitCode = 2;
  }
}
