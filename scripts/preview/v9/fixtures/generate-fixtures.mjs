#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : génère les fixtures hors ligne depuis le train local (GÉNÉRIQUE).
 *
 *   node scripts/preview/v9/fixtures/generate-fixtures.mjs           # écrit
 *   node scripts/preview/v9/fixtures/generate-fixtures.mjs --check   # 1 si une fixture dérive ou est orpheline
 *   node scripts/preview/v9/fixtures/generate-fixtures.mjs --courant <version> --out <dossier>
 *        # jeu « courant » paramétré (ledger courant = train jusqu'à <version>), écrit HORS des
 *        # fixtures versionnées (dry-run exact / ±1 / include-all, partiel, divergences).
 *
 * Aucun nombre de migrations : chaque ledger est un préfixe du train jusqu'à une VERSION
 * identifiée (socle V8 = 813 ORIGINALE, V9.1 = 20261002001302, train complet), le reste est
 * dérivé. Les fixtures versionnées utilisent le ledger courant par défaut : le socle V8.
 * Toutes les valeurs « secrètes » sont FACTICES et volontairement trop courtes pour ressembler à
 * une vraie clé (le scanner `verify:secrets` ne doit rien y voir).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadJson, MANIFEST_PATH } from "../../../lib/env-manifest-core.mjs";
import { classe } from "../lib/env-scope.mjs";
import { REF_PREVIEW_AUTORISEE, REF_PRODUCTION_CONNUE, SHA256_813_NON_ORIGINAL, VERSION_PREREQUIS_PHASE0, VERSION_SOCLE, VERSION_V9_1 } from "../lib/constantes.mjs";
import { ROOT, rangDe, trainLocal } from "../lib/train.mjs";

const DIR = import.meta.dirname;

/** Préfixes des fixtures générées : tout fichier de ce motif non produit par fixtures() est orphelin. */
export const MOTIF_FIXTURE_GENEREE = /^(ledger-|dry-run-|migration-list-)/;

function ledgerJson(entries, { ref = REF_PREVIEW_AUTORISEE, fonction = { original: true, non_original: false } } = {}) {
  const lignes = entries.map((e) => JSON.stringify(e));
  return `{"format":"elsatia-ledger-v1","source":"fixture","project_ref":${JSON.stringify(ref)},"fonction_813":${JSON.stringify(fonction)},"entries":[\n${lignes.join(",\n")}\n]}\n`;
}

const entree = (m) => (m.version === VERSION_SOCLE ? { version: m.version, name: m.name, marqueur_813: true } : { version: m.version, name: m.name });
const jusqua = (local, version) => local.slice(0, rangDe(local, version)).map(entree);

/** Sorties de `supabase db push --dry-run` pour un ledger courant (exact, une de moins, une de plus, include-all). */
export function dryRuns(local, courant = VERSION_SOCLE) {
  const rang = rangDe(local, courant);
  if (!rang) throw new Error(`version courante ${courant} absente du train`);
  const a = local.slice(rang);
  const derniere = local.at(-1).version;
  const fictive = { fichier: `${(BigInt(derniere) + 1n).toString()}_migration_absente_du_train_v1.sql` };
  const dry = (liste) => ["DRY RUN: migrations will *not* be pushed to the database.", "Would push these migrations:", ...liste.map((m) => ` • ${m.fichier}`), ""].join("\n");
  return {
    "dry-run-exact.txt": dry(a),
    "dry-run-une-de-moins.txt": dry(a.slice(0, -1)),
    "dry-run-une-de-plus.txt": dry([...a, fictive]),
    "dry-run-include-all.txt": [
      "Found local migration files to be inserted before the last migration on remote database.",
      "",
      "Rerun the command with --include-all flag to apply these migrations:",
      ` • ${local[Math.floor(rang / 2)].fichier}`,
      "",
    ].join("\n"),
  };
}

/** Ledgers dérivés d'un ledger courant (préfixe jusqu'à `courant`). */
export function ledgersDerives(local, courant = VERSION_SOCLE) {
  const base = jusqua(local, courant);
  const milieu = Math.floor(base.length / 2);
  const out = {};
  out["ledger-813-non-originale.json"] = ledgerJson(
    base.map((e) => (e.version === VERSION_SOCLE ? { version: e.version, name: e.name, marqueur_813: false, sha256: SHA256_813_NON_ORIGINAL } : e)),
    { fonction: { original: false, non_original: true } },
  );
  // Version orpheline d'une autre lignée (exemple cité par le runbook V3) : étrangère au train.
  out["ledger-etrangere.json"] = ledgerJson([...base, { version: "20260922000184", name: "orpheline_autre_lignee" }].sort((x, y) => (x.version < y.version ? -1 : 1)));
  const inverse = base.slice();
  [inverse[milieu], inverse[milieu + 1]] = [inverse[milieu + 1], inverse[milieu]];
  out["ledger-ordre-incorrect.json"] = ledgerJson(inverse);
  out["ledger-version-manquante.json"] = ledgerJson(base.filter((_, i) => i !== milieu));
  out["ledger-ref-production.json"] = ledgerJson(base, { ref: REF_PRODUCTION_CONNUE });
  // Push interrompu : préfixe exact à mi-chemin entre le ledger courant et le train complet.
  const rang = rangDe(local, courant);
  out["ledger-partiel.json"] = ledgerJson(local.slice(0, rang + Math.max(1, Math.floor((local.length - rang) / 2))).map(entree));
  return out;
}

export function fixtures(local = trainLocal(), { courant = VERSION_SOCLE } = {}) {
  const out = {};
  out["ledger-socle-v8-ok.json"] = ledgerJson(jusqua(local, VERSION_SOCLE));
  out["ledger-v9-1-ok.json"] = ledgerJson(jusqua(local, VERSION_V9_1));
  out["ledger-complet.json"] = ledgerJson(local.map(entree));
  Object.assign(out, ledgersDerives(local, courant));
  // Historique de type Production : préfixe qui s'arrête AVANT 20260921000300 → phase 0 refusée.
  out["ledger-sans-300-production.json"] = ledgerJson(local.slice(0, rangDe(local, VERSION_PREREQUIS_PHASE0) - 1).map(entree));
  // Texte de `supabase migration list --linked` (Local | Remote | Time) : distantes = socle V8.
  const rangSocle = rangDe(local, VERSION_SOCLE);
  out["migration-list-socle-v8.txt"] = [
    "  ", "   Local          | Remote         | Time (UTC)          ", "  ----------------|----------------|---------------------",
    ...local.map((m, i) => `   ${m.version} | ${i < rangSocle ? m.version : "              "} | ${m.version.slice(0, 4)}-${m.version.slice(4, 6)}-${m.version.slice(6, 8)} ${m.version.slice(8, 10)}:${m.version.slice(10, 12)}:${m.version.slice(12, 14)}`),
    "",
  ].join("\n");
  Object.assign(out, dryRuns(local, courant));


  // Inventaires Vercel (projet GP, scope Preview). Secrets : type « encrypted », AUCUNE valeur.
  // Drapeaux et modes non secrets : type « plain » avec la valeur attendue en Preview.
  const manifest = loadJson(ROOT, MANIFEST_PATH);
  const gp = manifest.variables.filter((v) => v.applications.includes("gestion_pro") && classe(v) === "REQUIRED");
  const plain = { ELSATIA_APPLICATION_ENV: "preview", STRIPE_WEBHOOK_EXPECTED_MODE: "test", TOOLS_STORE_ENVIRONMENT: "sandbox" };
  const envs = gp.map((v) => {
    const valeur = v.flag?.expected?.preview ?? plain[v.name];
    return valeur !== undefined ? { key: v.name, target: ["preview"], type: "plain", value: valeur } : { key: v.name, target: ["preview"], type: "encrypted" };
  });
  envs.push({ key: "CRON_SECRET", target: ["production"], type: "encrypted" });
  const inventaire = (liste) => `${JSON.stringify({ source: "fixture (format API Vercel /v9/projects/{id}/env)", envs: liste }, null, 1)}\n`;
  out["vercel-env-preview-ok.json"] = inventaire(envs);
  out["vercel-env-preview-k1-absente.json"] = inventaire(envs.filter((e) => e.key !== "BANK_DATA_ENCRYPTION_KEY"));
  // dotenv d'un `vercel env pull` FAUTIF : clé Stripe live (factice, trop courte pour être réelle) et mode live.
  const faux = gp.map((v) => `${v.name}=${v.flag?.expected?.preview ?? plain[v.name] ?? (v.name === "NEXT_PUBLIC_SUPABASE_URL" ? `https://${REF_PREVIEW_AUTORISEE}.supabase.co` : "FAUX")}`);
  out["vercel-env-preview-stripe-live.env"] = `${faux.map((l) => (l.startsWith("STRIPE_SECRET_KEY=") ? "STRIPE_SECRET_KEY=sk_live_FAUX" : l.startsWith("STRIPE_WEBHOOK_EXPECTED_MODE=") ? "STRIPE_WEBHOOK_EXPECTED_MODE=live" : l.startsWith("ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE=") ? "ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE=true" : l)).join("\n")}\n`;

  // Sorties `npm run bank-keys -- status` (identifiants et statuts seulement).
  const statut = (attestee) => `${JSON.stringify({ environnement: { active: "k1", format_ecriture: "v1", cles: ["k1"] }, registre: [{ cle_id: "k1", statut: "active", attestee }], inventaire: [], controle: { ok: true } })}\n`;
  out["bank-keys-status-k1-attestee.json"] = statut(true);
  out["bank-keys-status-k1-non-attestee.json"] = statut(false);

  // Gabarit du manifeste de sauvegarde (chemins HORS dépôt, à adapter).
  out["backup-manifest.example.json"] = `${JSON.stringify({
    project_ref: REF_PREVIEW_AUTORISEE,
    created_at: "2026-10-03T07:00:00Z",
    dashboard_backup_id: null,
    artefacts: [
      { kind: "schema", path: "../elsatia-v9-backup/preview-schema.sql" },
      { kind: "data", path: "../elsatia-v9-backup/preview-data.sql" },
      { kind: "auth", path: "../elsatia-v9-backup/preview-auth-data.sql" },
      { kind: "migrations_data", path: "../elsatia-v9-backup/preview-migrations-data.sql" },
      { kind: "ledger", path: "../elsatia-v9-backup/ledger-avant.json" },
      { kind: "roles", path: "../elsatia-v9-backup/preview-roles.sql" },
      { kind: "storage_metadata", path: "../elsatia-v9-backup/preview-storage-data.sql" },
    ],
  }, null, 2)}\n`;
  return out;
}

/** Fixtures du motif généré présentes sur disque mais plus produites (anciennes fixtures). */
export function orphelines(attendues, dir = DIR) {
  return readdirSync(dir).filter((f) => MOTIF_FIXTURE_GENEREE.test(f) && !(f in attendues));
}

if (import.meta.filename === resolve(process.argv[1] ?? "")) {
  const argv = process.argv.slice(2);
  const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const verifier = argv.includes("--check");
  const courant = opt("--courant");
  if (courant !== undefined) {
    const out = opt("--out");
    if (!out || resolve(out) === resolve(DIR)) { console.error("--courant exige --out <dossier> distinct des fixtures versionnées"); process.exit(2); }
    const local = trainLocal();
    mkdirSync(out, { recursive: true });
    const jeu = { ...ledgersDerives(local, courant), ...dryRuns(local, courant), "ledger-courant.json": ledgerJson(jusqua(local, courant)) };
    for (const [nom, contenu] of Object.entries(jeu)) writeFileSync(resolve(out, nom), contenu);
    console.log(`jeu courant ${courant} : ${Object.keys(jeu).length} fichier(s) écrit(s) dans ${resolve(out)}`);
  } else {
    const attendues = fixtures();
    const derives = [];
    for (const [nom, contenu] of Object.entries(attendues)) {
      const chemin = resolve(DIR, nom);
      let actuel = null;
      try { actuel = readFileSync(chemin, "utf8"); } catch { /* absente */ }
      if (actuel === contenu) continue;
      derives.push(nom);
      if (!verifier) writeFileSync(chemin, contenu);
    }
    const orph = orphelines(attendues);
    if (verifier) {
      console.log(derives.length || orph.length ? `DÉRIVE : ${[...derives, ...orph.map((f) => `${f} (orpheline)`)].join(", ")} — relancer generate-fixtures.mjs` : "fixtures à jour");
      process.exitCode = derives.length || orph.length ? 1 : 0;
    } else {
      console.log(derives.length ? `écrites : ${derives.join(", ")}` : "déjà à jour");
      if (orph.length) console.log(`orphelines à supprimer (git rm) : ${orph.join(", ")}`);
    }
  }
}
