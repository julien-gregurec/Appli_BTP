#!/usr/bin/env node
/**
 * ELSATIA — PREFLIGHT PRODUCTION V9.x (npm run production:v9x:preflight).
 *
 * Décide, AVANT toute fenêtre de cutover, si l'upgrade Production → tête V9.x qualifiée est autorisé.
 * NE SE CONNECTE À RIEN et N'ÉCRIT RIEN : il lit uniquement le dépôt git local et des fichiers fournis
 * par l'opérateur (exports en LECTURE SEULE réalisés hors de ce script) ; le rapport va sur stdout.
 * Toute option ressemblant à une connexion (--db-url, --project-ref-live, …) est refusée.
 *
 * Refuse (code 1) si :
 *   P1 mauvaise branche            branche courante hors liste autorisée
 *   P2 SHA inconnu                 --target-sha absent du dépôt, ≠ HEAD, ou non publié sur une branche origin
 *   P3 nombre de migrations        fichiers au SHA ≠ --target-migration-count, ou versions dupliquées
 *   P4 historical mismatch         une migration historique (manifeste source) modifiée / renommée / absente
 *   P5 ledger non préfixe          ledger Production ≠ manifeste source ∪ préfixe du plan d'application
 *   P6 migrations inattendues      en attente ≠ plan qualifié par le harnais pour ce SHA (manifests/target-*.json)
 *   P7 Production non attestée     attestation absente / ref ≠ attendue / empreinte du ledger ≠ / non lecture seule
 *                                   / préconditions de données bloquantes (sonde production_readonly_probe.sql)
 *   P9 phase du cutover            plan avec ponts de phase 0 : --phase 0 (ponts seuls) puis --phase principale
 *                                   (ponts de phase 0 au ledger, préconditions de phase principale à 0)
 *   P8 backup absent               attestation de sauvegarde absente, trop ancienne, d'un autre projet,
 *                                   ou restauration jamais testée hors Production
 *
 * Usage :
 *   npm run production:v9x:preflight -- --target-sha <sha> --target-migration-count <n> \
 *     --ledger <export.txt> --production-attestation <prod.json> --backup-attestation <backup.json> \
 *     [--target-plan scripts/upgrade/manifests/target-<sha8>.json] [--source-manifest …] [--allow-branch <regex>] \
 *     [--phase 0|principale] [--expected-project-ref <ref>] [--max-backup-age-hours 24] [--now <ISO>] [--depot <checkout de release>]
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ICI = dirname(fileURLToPath(import.meta.url));
export const DEPOT = resolve(ICI, "../..");
// Référence d'AUDIT (comparaison de chaînes uniquement, jamais une cible de connexion).
export const REF_PRODUCTION_ATTENDUE = "exhvuzegsefmoguxoiak";
export const REFS_INTERDITES_RESTAURATION = ["exhvuzegsefmoguxoiak", "pgvvpqyjziyapbbkydmc"];
export const BRANCHES_AUTORISEES = "^(integration/elsatia-[a-z0-9.-]*v9[a-z0-9.-]*|release/elsatia-[a-z0-9.-]+)$";
const OPTIONS_INTERDITES = /^--(db-url|database-url|connection|host|password|project-ref-live|supabase-url|service-role|linked)/;

const sha256 = (b) => createHash("sha256").update(b).digest("hex");

export function gitDepot(depot = DEPOT) {
  const git = (...a) => execFileSync("git", ["-C", depot, ...a], { encoding: "utf8", maxBuffer: 1 << 28 }).trim();
  return {
    branche: () => git("rev-parse", "--abbrev-ref", "HEAD"),
    head: () => git("rev-parse", "HEAD"),
    resoudre: (s) => { try { return git("rev-parse", "--verify", "--quiet", `${s}^{commit}`); } catch { return null; } },
    publie: (s) => { try { return git("branch", "-r", "--contains", s).split("\n").filter(Boolean).length > 0; } catch { return false; } },
    migrations: (s) => git("ls-tree", "--name-only", s, "supabase/migrations/").split("\n").filter((n) => n.endsWith(".sql")).map((n) => n.split("/").pop()),
    contenu: (s, nom) => execFileSync("git", ["-C", depot, "show", `${s}:supabase/migrations/${nom}`], { maxBuffer: 1 << 26 }),
  };
}

export function lireLedger(texte) {
  const meta = {};
  const versions = [];
  for (const brut of texte.split(/\r?\n/)) {
    const l = brut.trim();
    if (!l) continue;
    if (l.startsWith("#")) { const m = /^#\s*([a-z_]+)\s*=\s*(.*)$/.exec(l); if (m) meta[m[1]] = m[2].trim(); continue; }
    versions.push(l);
  }
  return { meta, versions };
}

/** Cœur pur (testable) : aucune E/S hors des fonctions injectées. */
export function evaluer(o, d) {
  const res = [];
  const verif = (id, ok, detail) => res.push({ id, ok: Boolean(ok), detail });
  const now = o.now ? new Date(o.now) : new Date();

  for (const a of o.argv ?? []) if (OPTIONS_INTERDITES.test(a)) verif("P0", false, `option de connexion interdite : ${a} (le preflight ne se connecte jamais)`);

  // P1 — branche
  const branche = d.git.branche();
  const motif = new RegExp(o.allowBranch ?? BRANCHES_AUTORISEES);
  verif("P1", motif.test(branche), `branche courante « ${branche} » ${motif.test(branche) ? "autorisée" : `hors ${motif}`}`);

  // P2 — SHA
  const sha = o.targetSha ? d.git.resoudre(o.targetSha) : null;
  if (!sha) { verif("P2", false, `SHA cible inconnu : ${o.targetSha ?? "(absent)"}`); return res; }
  const head = d.git.head();
  verif("P2", sha === head && d.git.publie(sha), sha !== head ? `HEAD ${head.slice(0, 12)} ≠ cible ${sha.slice(0, 12)}` : d.git.publie(sha) ? `cible ${sha.slice(0, 12)} = HEAD, publiée sur origin` : "cible non publiée sur une branche origin");

  // P3 — nombre de migrations
  const fichiers = d.git.migrations(sha).sort();
  const versions = fichiers.map((f) => f.split("_")[0]);
  const uniques = new Set(versions).size === versions.length;
  verif("P3", fichiers.length === Number(o.targetMigrationCount) && uniques,
    `${fichiers.length} migrations au SHA (attendu ${o.targetMigrationCount})${uniques ? "" : ", versions dupliquées"}`);

  // P4 — migrations historiques inchangées
  const manif = o.sourceManifest;
  const parVersion = new Map(fichiers.map((f) => [f.split("_")[0], f]));
  const modifiees = [];
  for (const [v, info] of Object.entries(manif?.migrations ?? {})) {
    const f = parVersion.get(v);
    if (!f) modifiees.push(`${v} absente`);
    else if (f !== info.fichier) modifiees.push(`${v} renommée ${info.fichier} → ${f}`);
    else if (sha256(d.git.contenu(sha, f)) !== info.sha256) modifiees.push(`${f} modifiée`);
  }
  verif("P4", manif && modifiees.length === 0, manif ? (modifiees.length ? `historique modifié : ${modifiees.slice(0, 5).join(" ; ")}` : `${Object.keys(manif.migrations).length} migrations historiques identiques au manifeste ${String(manif.ref).slice(0, 12)}`) : "manifeste source absent");

  // P5 — ledger = manifeste source ∪ préfixe (ordre lexical) des migrations en attente
  const ledger = o.ledger;
  if (!ledger) { verif("P5", false, "export du ledger Production absent (--ledger)"); }
  else {
    const lset = new Set(ledger.versions);
    const doublons = lset.size !== ledger.versions.length;
    const inconnues = ledger.versions.filter((v) => !parVersion.has(v));
    const source = Object.keys(manif?.migrations ?? {}).sort();
    const manquantesSource = source.filter((v) => !lset.has(v));
    // Ordre d'application du plan : ponts de phase 0 (versions postérieures au train) d'abord, puis l'ordre lexical.
    const phase0 = (o.targetPlan?.phase0 ?? []).map((f) => f.split("_")[0]).filter((v) => versions.includes(v));
    const attente = [...phase0, ...versions.filter((v) => !source.includes(v) && !phase0.includes(v)).sort()];
    let k = 0;
    while (k < attente.length && lset.has(attente[k])) k += 1;
    const horsPrefixe = attente.slice(k).filter((v) => lset.has(v));
    const ok = !doublons && !inconnues.length && !manquantesSource.length && !horsPrefixe.length;
    verif("P5", ok, ok ? `ledger ${ledger.versions.length} = source ${source.length} + préfixe de ${k} / ${attente.length} migration(s) du plan`
      : [doublons && "doublons", inconnues.length && `versions inconnues de la cible : ${inconnues.slice(0, 5).join(",")}`,
        manquantesSource.length && `versions historiques absentes du ledger : ${manquantesSource.slice(0, 5).join(",")}`,
        horsPrefixe.length && `ledger non préfixe (trou avant ${horsPrefixe[0]})`].filter(Boolean).join(" ; "));

    // P6 — migrations attendues par le plan qualifié pour ce SHA
    const plan = o.targetPlan;
    const enAttente = fichiers.filter((f) => !lset.has(f.split("_")[0]));
    if (!plan) verif("P6", false, `plan qualifié absent pour ${sha.slice(0, 8)} (scripts/upgrade/manifests/target-${sha.slice(0, 8)}.json, produit par le harnais)`);
    else {
      const qualifiees = new Set(plan.migrations.map((m) => m.migration));
      const inattendues = enAttente.filter((f) => !qualifiees.has(f));
      const shaOk = plan.target_sha === sha;
      // Un plan qualifié AVEC ponts d'upgrade n'autorise l'upgrade que si chaque pont est réellement dans la cible,
      // à l'octet près (sinon la Production exécuterait un train différent de celui qualifié).
      const pontsAbsents = (plan.ponts ?? []).filter((p) => {
        const nom = typeof p === "string" ? p : p.fichier;
        if (!fichiers.includes(nom)) return true;
        return typeof p !== "string" && p.sha256 && sha256(d.git.contenu(sha, nom)) !== p.sha256;
      }).map((p) => (typeof p === "string" ? p : p.fichier));
      verif("P6", shaOk && inattendues.length === 0 && pontsAbsents.length === 0,
        !shaOk ? `plan qualifié pour ${String(plan.target_sha).slice(0, 12)}, pas pour ${sha.slice(0, 12)}`
          : pontsAbsents.length ? `plan qualifié AVEC pont(s) absent(s) ou différent(s) de la cible : ${pontsAbsents.join(", ")} — intégrer les ponts au train puis requalifier`
          : inattendues.length ? `${inattendues.length} migration(s) en attente non qualifiée(s) : ${inattendues.slice(0, 5).join(", ")}`
            : `${enAttente.length} migration(s) en attente, toutes qualifiées (${plan.migrations.filter((m) => m.verrou === "MAINTENANCE_WINDOW_REQUIRED").length} en fenêtre de maintenance)`);
    }
  }

  // P9 — phase du cutover. Un plan avec ponts de phase 0 s'exécute en DEUX temps : « --phase 0 » (uniquement les
  // ponts de phase 0, ledger = source), puis « --phase principale » (défaut : ponts de phase 0 déjà au ledger et
  // précondition de phase principale à 0, mesurée par la sonde APRÈS la phase 0).
  {
    const phase = o.phase ?? "principale";
    const p0 = (o.targetPlan?.phase0 ?? []).map((f) => f.split("_")[0]);
    const lv = new Set(o.ledger?.versions ?? []);
    const source = Object.keys(manif?.migrations ?? {});
    if (!["0", "principale"].includes(phase)) verif("P9", false, `phase inconnue : ${phase} (0 | principale)`);
    else if (!p0.length) verif("P9", phase === "principale", phase === "principale" ? "plan sans phase 0" : "--phase 0 demandée mais le plan n'a pas de pont de phase 0");
    else if (phase === "0") {
      const autres = [...lv].filter((v) => !source.includes(v) && !p0.includes(v));
      verif("P9", autres.length === 0, autres.length ? `phase 0 refusée : la phase principale a déjà commencé (${autres.slice(0, 3).join(", ")})`
        : `phase 0 autorisée : appliquer UNIQUEMENT ${(o.targetPlan.phase0).join(", ")} (déjà au ledger : ${p0.filter((v) => lv.has(v)).length}/${p0.length})`);
    } else {
      const manquants = p0.filter((v) => !lv.has(v));
      verif("P9", manquants.length === 0, manquants.length ? `phase principale refusée : pont(s) de phase 0 absent(s) du ledger Production (${manquants.join(", ")}) — exécuter d'abord la phase 0`
        : `phase 0 au ledger (${p0.length} pont(s)) : phase principale autorisée`);
    }
  }

  // P7 — Production attestée (export lecture seule) + préconditions de données
  const att = o.productionAttestation;
  const refAttendue = o.expectedProjectRef ?? REF_PRODUCTION_ATTENDUE;
  if (!att) verif("P7", false, "attestation Production absente (--production-attestation)");
  else {
    const pb = [];
    if (att.project_ref !== refAttendue) pb.push(`project_ref ${att.project_ref} ≠ ${refAttendue}`);
    if (att.read_only !== true) pb.push("export non déclaré en lecture seule");
    if (!att.exported_by || !att.exported_at) pb.push("auteur / date de l'export manquants");
    if (o.ledgerTexte && att.ledger_sha256 !== sha256(o.ledgerTexte)) pb.push("empreinte du ledger ≠ fichier fourni");
    if (ledger?.meta?.project_ref && ledger.meta.project_ref !== att.project_ref) pb.push("ledger d'un autre projet");
    const pre = att.data_preconditions;
    if (!pre) pb.push("préconditions de données absentes (scripts/upgrade/sql/production_readonly_probe.sql)");
    else {
      // En phase 0, les préconditions de phase principale (mesurées avant que la phase 0 ne les remette à 0) sont attendues non nulles.
      const differees = (o.phase ?? "principale") === "0" ? new Set(o.targetPlan?.preconditions_phase_principale ?? []) : new Set();
      for (const [k, v] of Object.entries(pre)) if (k.startsWith("bloquant_") && !differees.has(k) && Number(v) !== 0) pb.push(`précondition ${k} = ${v}`);
      // Préconditions que le PLAN QUALIFIÉ déclare bloquantes pour ce SHA (ex. lignes_factures_emises sans pont 298/399).
      const preconditionsPlan = [...(o.targetPlan?.preconditions_bloquantes ?? []),
        ...((o.phase ?? "principale") === "principale" ? (o.targetPlan?.preconditions_phase_principale ?? []) : [])];
      for (const k of preconditionsPlan) {
        if (!(k in pre)) pb.push(`précondition ${k} non mesurée`);
        else if (Number(pre[k]) !== 0) pb.push(`précondition ${k} = ${pre[k]} (bloquante pour ce plan)`);
      }
    }
    verif("P7", pb.length === 0, pb.length ? pb.join(" ; ") : `Production ${att.project_ref} attestée par ${att.exported_by} (${att.exported_at}), préconditions de données à 0`);
  }

  // P8 — sauvegarde
  const bk = o.backupAttestation;
  if (!bk) verif("P8", false, "attestation de sauvegarde absente (--backup-attestation)");
  else {
    const pb = [];
    const age = (now - new Date(bk.taken_at)) / 3.6e6;
    if (bk.project_ref !== refAttendue) pb.push(`sauvegarde du projet ${bk.project_ref}`);
    if (!["pitr", "dump", "pitr+dump"].includes(bk.kind)) pb.push(`type ${bk.kind} inconnu`);
    if (!bk.backup_id) pb.push("identifiant de sauvegarde manquant");
    if (!(age >= 0 && age <= Number(o.maxBackupAgeHours ?? 24))) pb.push(`sauvegarde âgée de ${Number.isFinite(age) ? age.toFixed(1) : "?"} h`);
    if (bk.restore_tested !== true) pb.push("restauration jamais testée");
    if (!bk.restore_target || REFS_INTERDITES_RESTAURATION.some((r) => String(bk.restore_target).includes(r))) pb.push("restauration testée sur une cible non isolée");
    verif("P8", pb.length === 0, pb.length ? pb.join(" ; ") : `sauvegarde ${bk.kind} ${bk.backup_id} (${age.toFixed(1)} h), restauration testée sur ${bk.restore_target}`);
  }
  return res;
}

function option(argv, nom) { const i = argv.indexOf(nom); return i >= 0 ? argv[i + 1] : undefined; }
function json(p) { return p && existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : undefined; }

export function main(argv = process.argv.slice(2), depot = DEPOT) {
  const ledgerP = option(argv, "--ledger");
  const ledgerTexte = ledgerP && existsSync(ledgerP) ? readFileSync(ledgerP, "utf8") : undefined;
  const targetSha = option(argv, "--target-sha");
  const g = gitDepot(depot);
  const resolu = targetSha ? g.resoudre(targetSha) : null;
  // Manifestes : ceux du dépôt contrôlé s'il les porte, sinon ceux livrés avec ce preflight.
  const manifeste = (nom) => [resolve(depot, "scripts/upgrade/manifests", nom), resolve(ICI, "manifests", nom)].find((x) => existsSync(x));
  const planP = option(argv, "--target-plan") ?? (resolu ? manifeste(`target-${resolu.slice(0, 8)}.json`) : undefined);
  const o = {
    argv, targetSha, targetMigrationCount: option(argv, "--target-migration-count"),
    allowBranch: option(argv, "--allow-branch"), expectedProjectRef: option(argv, "--expected-project-ref"),
    maxBackupAgeHours: option(argv, "--max-backup-age-hours"), now: option(argv, "--now"), phase: option(argv, "--phase"),
    sourceManifest: json(option(argv, "--source-manifest") ?? manifeste("source-prod-210-5777abb.json")),
    targetPlan: json(planP), ledger: ledgerTexte ? lireLedger(ledgerTexte) : undefined, ledgerTexte,
    productionAttestation: json(option(argv, "--production-attestation")), backupAttestation: json(option(argv, "--backup-attestation")),
  };
  const res = evaluer(o, { git: g });
  const refus = res.filter((r) => !r.ok);
  for (const r of res) console.log(`${r.ok ? "✅" : "❌"} ${r.id} ${r.detail}`);
  console.log(refus.length ? `PREFLIGHT REFUSÉ (${refus.map((r) => r.id).join(", ")}) — aucune action n'a été effectuée.` : "PREFLIGHT OK — upgrade autorisé pour ce SHA (aucune action n'a été effectuée).");
  return refus.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  // --depot : checkout de release à contrôler (lecture seule) ; défaut = ce dépôt.
  const argv = process.argv.slice(2);
  const i = argv.indexOf("--depot");
  process.exit(main(argv, i >= 0 ? resolve(argv[i + 1]) : DEPOT));
}
