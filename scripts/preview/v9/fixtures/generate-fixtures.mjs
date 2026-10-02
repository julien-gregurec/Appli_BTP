#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : génère les fixtures hors ligne depuis le train local.
 *
 *   node scripts/preview/v9/fixtures/generate-fixtures.mjs           # écrit
 *   node scripts/preview/v9/fixtures/generate-fixtures.mjs --check   # 1 si une fixture dérive
 *
 * Toutes les valeurs « secrètes » sont FACTICES et volontairement trop courtes pour ressembler à
 * une vraie clé (le scanner `verify:secrets` ne doit rien y voir).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadJson, MANIFEST_PATH } from "../../../lib/env-manifest-core.mjs";
import { classe } from "../lib/env-scope.mjs";
import { REF_PREVIEW_AUTORISEE, REF_PRODUCTION_CONNUE, NB_SOCLE, SHA256_813_NON_ORIGINAL, VERSION_SOCLE } from "../lib/constantes.mjs";
import { ROOT, trainLocal } from "../lib/train.mjs";

const DIR = import.meta.dirname;

function ledgerJson(entries, { ref = REF_PREVIEW_AUTORISEE, fonction = { original: true, non_original: false } } = {}) {
  const lignes = entries.map((e) => JSON.stringify(e));
  return `{"format":"elsatia-ledger-v1","source":"fixture","project_ref":${JSON.stringify(ref)},"fonction_813":${JSON.stringify(fonction)},"entries":[\n${lignes.join(",\n")}\n]}\n`;
}

const entree = (m) => (m.version === VERSION_SOCLE ? { version: m.version, name: m.name, marqueur_813: true } : { version: m.version, name: m.name });

export function fixtures(local = trainLocal()) {
  const socle = local.slice(0, NB_SOCLE).map(entree);
  const out = {};
  out["ledger-372-ok.json"] = ledgerJson(socle);
  out["ledger-389-v9.json"] = ledgerJson(local.map(entree));
  out["ledger-372-813-non-originale.json"] = ledgerJson(
    socle.map((e) => (e.version === VERSION_SOCLE ? { version: e.version, name: e.name, marqueur_813: false, sha256: SHA256_813_NON_ORIGINAL } : e)),
    { fonction: { original: false, non_original: true } },
  );
  // Version orpheline d'une autre lignée (exemple cité par le runbook V3) : étrangère au train.
  out["ledger-373-etrangere.json"] = ledgerJson([...socle, { version: "20260922000184", name: "orpheline_autre_lignee" }].sort((a, b) => (a.version < b.version ? -1 : 1)));
  const inverse = socle.slice();
  [inverse[200], inverse[201]] = [inverse[201], inverse[200]];
  out["ledger-372-ordre-incorrect.json"] = ledgerJson(inverse);
  out["ledger-371-manquante.json"] = ledgerJson(socle.filter((_, i) => i !== 200));
  out["ledger-372-ref-production.json"] = ledgerJson(socle, { ref: REF_PRODUCTION_CONNUE });
  out["ledger-380-partiel.json"] = ledgerJson(local.slice(0, 380).map(entree));
  // Texte de `supabase migration list --linked` (Local | Remote | Time) : 389 locales, 372 distantes.
  out["migration-list-372.txt"] = [
    "  ", "   Local          | Remote         | Time (UTC)          ", "  ----------------|----------------|---------------------",
    ...local.map((m, i) => `   ${m.version} | ${i < NB_SOCLE ? m.version : "              "} | ${m.version.slice(0, 4)}-${m.version.slice(4, 6)}-${m.version.slice(6, 8)} ${m.version.slice(8, 10)}:${m.version.slice(10, 12)}:${m.version.slice(12, 14)}`),
    "",
  ].join("\n");

  // Sorties de `supabase db push --dry-run`.
  const a = local.slice(NB_SOCLE);
  const dry = (liste) => ["DRY RUN: migrations will *not* be pushed to the database.", "Would push these migrations:", ...liste.map((m) => ` • ${m.fichier}`), ""].join("\n");
  out["dry-run-17.txt"] = dry(a);
  out["dry-run-16.txt"] = dry(a.slice(0, 16));
  out["dry-run-18.txt"] = dry([...a, { fichier: "20261002001114_releve_lot_10_v1.sql" }]);
  out["dry-run-include-all.txt"] = [
    "Found local migration files to be inserted before the last migration on remote database.",
    "",
    "Rerun the command with --include-all flag to apply these migrations:",
    ` • ${local[100].fichier}`,
    "",
  ].join("\n");

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
      { kind: "ledger", path: "../elsatia-v9-backup/ledger-avant.json" },
      { kind: "roles", path: "../elsatia-v9-backup/preview-roles.sql" },
      { kind: "storage_metadata", path: "../elsatia-v9-backup/preview-storage-data.sql" },
    ],
  }, null, 2)}\n`;
  return out;
}

if (import.meta.filename === resolve(process.argv[1] ?? "")) {
  const verifier = process.argv.includes("--check");
  const derives = [];
  for (const [nom, contenu] of Object.entries(fixtures())) {
    const chemin = resolve(DIR, nom);
    let actuel = null;
    try { actuel = readFileSync(chemin, "utf8"); } catch { /* absente */ }
    if (actuel === contenu) continue;
    derives.push(nom);
    if (!verifier) writeFileSync(chemin, contenu);
  }
  if (verifier) {
    console.log(derives.length ? `DÉRIVE : ${derives.join(", ")} — relancer generate-fixtures.mjs` : "fixtures à jour");
    process.exitCode = derives.length ? 1 : 0;
  } else console.log(derives.length ? `écrites : ${derives.join(", ")}` : "déjà à jour");
}
