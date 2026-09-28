#!/usr/bin/env node
/**
 * ELSATIA — Qualification Preview distante, orchestrateur unique (`npm run preview:qualification`).
 *
 * Enchaîne, dans cet ordre, les étapes du pack opérateur (docs/qualification/
 * ELSATIA_REMOTE_PREVIEW_OPERATOR_HANDOFF_V1.md) : preflight (git, train, outils, env, DNS, réseau,
 * identités Supabase/Vercel/Stripe/Redis/Brevo) → protection Production → ledger → sauvegarde →
 * dry-run → db push → DB verify → Auth → Storage → e-mail → Stripe → Redis → HTTP → Playwright → logs.
 *
 * Chaque étape rend GO · NO-GO · SKIPPED · BLOCKED_CREDENTIAL · BLOCKED_NETWORK.
 * ARRÊT DE SÉCURITÉ : dès qu'une étape CRITIQUE n'est pas GO, toutes les écritures (db push,
 * objets Storage, sessions Auth, e-mails, Playwright, clé Redis) sont suspendues ; les
 * diagnostics en lecture seule continuent.
 *
 * Sorties (sans aucun secret : tout texte passe par le masque) :
 *   artifacts/preview-qualification.json            résultat machine-readable
 *   artifacts/preview-qualification/summary.md       synthèse lisible
 *   artifacts/preview-qualification/logs/<étape>.log journaux masqués (non versionnés)
 *
 * Usage (poste opérateur, depuis la racine du dépôt) :
 *   npm run preview:qualification -- --target ~/elsatia-preview/preview-target.json \
 *     --env-dir ~/elsatia-preview --confirm-preview <ref> [--mode full] [--apply-migrations]
 *   Options : --mode read-only|full (défaut read-only) · --apply-migrations · --backup ·
 *     --backup-dir <dir hors dépôt> · --restore-drill-db <postgresql://localhost/…> ·
 *     --before-owner · --pgtap · --email-to <adresse de l'allowlist> · --tools-billing ·
 *     --only <id,…> · --skip <id,…> · --logs-since-minutes <n> · --offline (plan sans aucun appel distant) ·
 *     --pull-env (environnement Claude : variables Preview lues par l'API Vercel et écrites dans --env-dir)
 *   Cible : fichier --target, ou son contenu JSON dans ELSATIA_PREVIEW_TARGET_JSON (environnement cloud).
 * Sortie : 0 QUALIFIED (ou plan hors ligne) · 1 NO-GO · 2 usage · 3 BLOCKED / INCOMPLETE.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import { chargerFichierEnv, estPointEntree, lireOptions } from "../lib/preview-guard.mjs";
import { Masque, NATURE, STATUT, VERDICT, bloqueursEcriture, compter, masquerEmail, resultat, statutDepuisErreur, verdict } from "./lib/core.mjs";
import { envPgDepuisUrl } from "./lib/database.mjs";
import { creerRuntime } from "./lib/runtime.mjs";
import { etapesBase } from "./steps/database.mjs";
import { etapesE2eLogs } from "./steps/e2e-logs.mjs";
import { etapesPreflight } from "./steps/preflight.mjs";
import { etapesServices } from "./steps/services.mjs";

const ROOT = resolve(import.meta.dirname, "../../..");
export const VERSION_OUTIL = "preview-qualification/1.0.0";
const FICHIERS_ENV = ["gp", "tools", "colors", "reserves", "worker", "qualification"];

/** Ordre d'exécution. La protection Production précède toute écriture ; le ledger précède la sauvegarde. */
export function toutesEtapes() {
  const parId = new Map([...etapesPreflight, ...etapesBase, ...etapesServices, ...etapesE2eLogs].map((e) => [e.id, e]));
  const ordre = [
    "preflight.git", "preflight.train", "preflight.tooling", "preflight.pull-env", "preflight.env", "preflight.dns", "preflight.network",
    "preflight.supabase-identity", "preflight.vercel-identity", "preflight.stripe-mode", "preflight.redis", "preflight.brevo",
    "protection.target",
    "ledger.read", "backup.dump", "backup.validate", "db.push-dry-run", "db.push", "db.verify", "db.pgtap",
    "auth.gotrue", "storage.buckets", "storage.cross-tenant", "email.brevo", "stripe.verify", "redis.check", "http.smoke",
    "e2e.gp", "e2e.tools", "e2e.colors", "e2e.reserves",
    "logs.vercel", "logs.supabase", "logs.stripe-webhooks", "logs.summary",
  ];
  if (ordre.length !== parId.size || ordre.some((id) => !parId.has(id))) throw new Error("ordre des étapes incohérent avec leurs définitions");
  return ordre.map((id) => parId.get(id));
}

export function lireOptionsQualification(argv) {
  const o = lireOptions(argv);
  const liste = (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : []);
  const mode = typeof o.mode === "string" ? o.mode : "read-only";
  if (!["read-only", "full"].includes(mode)) throw new Error("--mode read-only|full");
  const envDir = typeof o["env-dir"] === "string" ? o["env-dir"].replace(/^~(?=\/|$)/, homedir()) : join(homedir(), "elsatia-preview");
  const cheminDe = (v, defaut) => (typeof v === "string" ? v.replace(/^~(?=\/|$)/, homedir()) : defaut);
  return {
    mode,
    offline: Boolean(o.offline),
    envDir,
    target: cheminDe(o.target, join(envDir, "preview-target.json")),
    confirmPreview: typeof o["confirm-preview"] === "string" ? o["confirm-preview"].trim().toLowerCase() : null,
    applyMigrations: Boolean(o["apply-migrations"]),
    pullEnv: Boolean(o["pull-env"]),
    backup: Boolean(o.backup),
    backupDir: cheminDe(o["backup-dir"], join(envDir, "backups")),
    backupMinEntries: Number(o["backup-min-entries"] ?? 500),
    restoreDrillDb: typeof o["restore-drill-db"] === "string" ? o["restore-drill-db"] : null,
    beforeOwner: Boolean(o["before-owner"]),
    pgtap: Boolean(o.pgtap),
    emailTo: typeof o["email-to"] === "string" ? o["email-to"] : null,
    toolsBilling: Boolean(o["tools-billing"]),
    only: liste(o.only),
    skip: liste(o.skip),
    logsSinceMinutes: Number(o["logs-since-minutes"] ?? 60),
    artifactsDir: cheminDe(o["artifacts-dir"], resolve(ROOT, "artifacts")),
    jsonOut: cheminDe(o["json-out"], null),
  };
}

/** Charge les fichiers d'environnement (absents = null) et la cible (JSON invalide = null + note). */
export function chargerEntrees(options, env = process.env) {
  const envs = {};
  for (const f of FICHIERS_ENV) {
    const p = join(options.envDir, `${f}.env`);
    envs[f] = existsSync(p) ? chargerFichierEnv(p) : null;
  }
  let cible = null;
  let noteCible = null;
  if (existsSync(options.target)) {
    try { cible = JSON.parse(readFileSync(options.target, "utf8")); } catch { noteCible = "fichier de cible illisible (JSON invalide)"; }
  } else if (env.ELSATIA_PREVIEW_TARGET_JSON) {
    try { cible = JSON.parse(env.ELSATIA_PREVIEW_TARGET_JSON); } catch { noteCible = "ELSATIA_PREVIEW_TARGET_JSON illisible (JSON invalide)"; }
  } else noteCible = "fichier de cible absent (ni --target ni ELSATIA_PREVIEW_TARGET_JSON)";
  return { envs, cible, noteCible };
}

/** Construit le masque : toutes les valeurs secrètes connues, plus les motifs génériques. */
export function construireMasque(envs, env = process.env) {
  const m = new Masque();
  for (const [f, e] of Object.entries(envs)) if (e) (f === "qualification" ? Object.values(e).forEach((v) => m.ajouter(v)) : m.ajouterEnv(e));
  m.ajouterEnv(env);
  return m;
}

export async function qualifier(options, { runtime = null, entrees = null, maintenant = Date.now(), log = console.log, env = process.env, root = ROOT, cheminLienCli = null } = {}) {
  const train = JSON.parse(readFileSync(resolve(root, "scripts/preview/qualification/train.json"), "utf8"));
  const { envs, cible, noteCible } = entrees ?? chargerEntrees(options, env);
  const masque = construireMasque(envs, env);
  const journalDir = join(options.artifactsDir, "preview-qualification", "logs");
  const rt = runtime ?? creerRuntime({ horsLigne: options.offline, journalDir, masque });
  const faits = [];
  const q = (nom) => (env[nom] ?? envs.qualification?.[nom] ?? undefined);
  const c = {
    root, options, train, envs, cible, q, rt, masque, maintenant,
    depuisLogs: maintenant - options.logsSinceMinutes * 60_000,
    etat: { observe: { supabaseRefs: {}, stripe: { typesCles: {} }, vercel: {} }, e2e: {}, echecs: { vercel5xx: 0, supabase5xx: 0, webhooksStripe: 0 }, confirmationsManuelles: [] },
    etape: (id) => faits.find((f) => f.id === id),
    pgEnv: () => envPgDepuisUrl(q("ELSATIA_PREVIEW_DB_URL")),
    ecrituresAutorisees: false,
    cheminLienCli: cheminLienCli ?? resolve(root, "supabase/.temp/project-ref"),
  };

  log(`ELSATIA — qualification Preview distante ${train.train} (${options.offline ? "PLAN HORS LIGNE : aucun appel distant" : `mode ${options.mode}`})`);
  if (noteCible) log(`  ! ${noteCible} : ${options.target}`);
  log("");

  for (const e of toutesEtapes()) {
    const debut = Date.now();
    rt.etape = e.id;
    const fiche = { id: e.id, section: e.section, titre: e.titre, nature: e.nature, critique: Boolean(e.critique), requise: Boolean(e.requise), bloqueSiSaute: Boolean(e.bloqueSiSaute) };
    const bloqueurs = bloqueursEcriture(faits);
    c.ecrituresAutorisees = options.mode === "full" && !options.offline && bloqueurs.length === 0;
    let res;
    if (options.only.length && !options.only.includes(e.id)) res = resultat(STATUT.SKIPPED, "hors --only");
    else if (options.skip.includes(e.id)) res = resultat(STATUT.SKIPPED, "--skip demandé");
    else if (e.nature !== NATURE.READ && options.mode !== "full") res = resultat(STATUT.SKIPPED, `écriture (${e.nature}) : mode read-only`);
    else if (e.nature !== NATURE.READ && bloqueurs.length && !options.offline) res = resultat(STATUT.SKIPPED, `ARRÊT DE SÉCURITÉ : écriture suspendue (${bloqueurs.join(", ")} non GO)`, [], { arret_securite: true });
    else if (e.modeComplet && options.mode !== "full" && !options.backup) res = resultat(STATUT.SKIPPED, "mode read-only (--backup pour forcer la sauvegarde)");
    else {
      try { res = await e.executer(c); } catch (err) {
        const statut = statutDepuisErreur(err);
        res = resultat(statut, masque.appliquer(err instanceof Error ? err.message : String(err)));
        if (statut === STATUT.NO_GO) rt.journal(masque.appliquer(err?.stack ?? String(err)));
      }
    }
    const fait = { ...fiche, statut: res.statut, resume: masque.appliquer(res.resume), details: (res.details ?? []).map((d) => masque.appliquer(d)), duree_ms: Date.now() - debut, arret_securite: Boolean(res.arret_securite) };
    faits.push(fait);
    log(`[${fait.statut.padEnd(18)}] ${e.id.padEnd(28)} ${fait.resume}`);
    for (const d of fait.details.slice(0, 12)) log(`${" ".repeat(22)}${d}`);
  }

  const v = verdict(faits, { horsLigne: options.offline });
  const sortie = construireSortie({ options, train, faits, verdict: v, c, maintenant, cible });
  const json = masque.appliquerJson(sortie);
  const chemin = options.jsonOut ?? join(options.artifactsDir, "preview-qualification.json");
  mkdirSync(resolve(chemin, ".."), { recursive: true });
  writeFileSync(chemin, `${JSON.stringify(json, null, 2)}\n`);
  const dirSynthese = join(options.artifactsDir, "preview-qualification");
  mkdirSync(dirSynthese, { recursive: true });
  writeFileSync(join(dirSynthese, "summary.md"), masque.appliquer(synthese(json)));
  const n = compter(faits);
  log(`\n${v}\n  ${Object.entries(n).map(([s, k]) => `${s}=${k}`).join(" · ")}`);
  log(`  résultat : ${relative(root, chemin) || chemin}`);
  return { verdict: v, faits, json };
}

export function construireSortie({ options, train, faits, verdict: v, c, maintenant, cible }) {
  const s = c.etat.sauvegarde;
  const l = c.etat.ledger;
  const bloqueurs = bloqueursEcriture(faits);
  return {
    schema: "elsatia.preview-qualification.v1",
    tool: VERSION_OUTIL,
    generated_at: new Date(maintenant).toISOString(),
    mode: options.offline ? "offline-plan" : options.mode,
    remote_calls: !options.offline,
    verdict: v,
    counts: compter(faits),
    safe_stop: { triggered: bloqueurs.length > 0, blocking_steps: bloqueurs, suspended_writes: faits.filter((f) => f.arret_securite).map((f) => f.id) },
    train: {
      name: train.train, branch: train.branch, qualified_commit: train.qualified_commit, local_verdict: train.local_verdict,
      migrations: c.etat.train?.nb ?? null, last_migration: c.etat.train?.derniere ?? null, db_verify_controls: c.etat.train?.controles ?? null,
    },
    git: c.etat.git ? { head: c.etat.git.head, branch: c.etat.git.branche, dirty: c.etat.git.sale } : null,
    target: cible ? {
      supabase_project_ref: cible.supabase?.project_ref ?? null,
      vercel_projects: Object.fromEntries(Object.entries(cible.vercel?.projects ?? {}).map(([a, p]) => [a, { project_id: p.project_id ?? null, preview_host: (() => { try { return new URL(p.preview_origin).hostname; } catch { return null; } })() }])),
      stripe_account: cible.stripe?.account_id ?? null,
      redis_declared: Boolean(cible.redis),
      email_allowlist: (cible.brevo?.recipient_allowlist ?? []).map(masquerEmail),
      confirmed_by: cible.confirmations?.confirmed_by ?? null,
      confirmed_at: cible.confirmations?.confirmed_at ?? null,
    } : null,
    ledger: l ? { class: l.classe, remote_count: l.nbDistantes, local_count: l.nbLocales, remote_last: l.derniereDistante, local_last: l.derniereLocale, pending: l.enAttente, foreign: l.etrangeres, out_of_order: l.horsOrdre } : null,
    backup: s ? { file_name: s.fichier.split("/").at(-1), size_bytes: s.taille, sha256: s.sha256 ?? null, toc_entries: s.entrees ?? null, data_tables: s.tablesDonnees ?? null, restore_command: s.restauration ?? null } : null,
    deployments: c.etat.deploiements ?? null,
    manual_confirmations: c.etat.confirmationsManuelles,
    steps: faits.map((f) => ({ id: f.id, section: f.section, title: f.titre, nature: f.nature, critical: f.critique, required: f.requise, status: f.statut, summary: f.resume, details: f.details, duration_ms: f.duree_ms, safe_stop: f.arret_securite })),
    secrets_policy: "Aucune valeur secrète : toutes les chaînes passent par le masque (valeurs des fichiers .env, jetons obtenus, motifs sk_/rk_/whsec_/JWT/URL de connexion). Adresses e-mail partiellement masquées.",
  };
}

export function synthese(json) {
  const lignes = [
    `# Qualification Preview ${json.train.name} — ${json.verdict}`, "",
    `- Généré : ${json.generated_at} · mode \`${json.mode}\` · appels distants : ${json.remote_calls ? "oui" : "non"}`,
    `- HEAD : \`${json.git?.head ?? "?"}\` (${json.git?.branch ?? "?"}) · train ${json.train.name} \`${json.train.qualified_commit.slice(0, 8)}\` · ${json.train.migrations ?? "?"} migrations`,
    `- Arrêt de sécurité : ${json.safe_stop.triggered ? `OUI (${json.safe_stop.blocking_steps.join(", ")})` : "non"}`,
    `- Décompte : ${Object.entries(json.counts).map(([s, n]) => `${s} ${n}`).join(" · ")}`, "",
    "| § | Étape | Statut | Résumé |", "|---|---|---|---|",
    ...json.steps.map((s) => `| ${s.section} | \`${s.id}\` | **${s.status}** | ${String(s.summary).replace(/\|/g, "\\|")} |`),
  ];
  if (json.manual_confirmations.length) lignes.push("", "## Confirmations manuelles attendues", ...json.manual_confirmations.map((m) => `- [ ] ${m}`));
  if (json.backup?.restore_command) lignes.push("", "## Restauration (manuelle)", "```bash", json.backup.restore_command, "```");
  return `${lignes.join("\n")}\n`;
}

export function codeSortie(v) {
  if (v === VERDICT.QUALIFIED || v === VERDICT.PLAN) return 0;
  if (v === VERDICT.NO_GO) return 1;
  return 3;
}

if (estPointEntree(import.meta.url)) {
  let options;
  try { options = lireOptionsQualification(process.argv.slice(2)); } catch (e) { console.error(`REFUS : ${e.message}`); process.exit(2); }
  const { verdict: v } = await qualifier(options);
  process.exitCode = codeSortie(v);
}
