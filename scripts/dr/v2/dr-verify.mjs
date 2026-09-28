#!/usr/bin/env node
// DR V2 — commande opérateur : `npm run dr:verify`.
// Rapport : docs/qualification/ELSATIA_DISASTER_RECOVERY_RESTORE_V2.md §12.
//
//   npm run dr:verify                         drill complet LOCAL : base (backup, 4 catastrophes,
//                                             smokes), Storage (vraie storage-api si Docker),
//                                             Auth (vrai GoTrue si binaire) ; verdict final.
//   npm run dr:verify -- --db-only            drill base seul.
//   npm run dr:verify -- --backup <dossier>   vérifie une sauvegarde existante (backup.sh) :
//                                             intégrité, TOC, restauration de test LOCALE,
//                                             comparaison stricte à son instantané.
//   npm run dr:verify -- --strict             Storage et Auth doivent être EXÉCUTÉS (pas
//                                             seulement « non prouvés ») pour réussir.
//   npm run dr:verify -- --out <dossier>      dossier de sortie (défaut /tmp/elsatia-dr-v2/…).
//
// Garde-fous (scripts/dr/v2/garde-cible.mjs), appliqués AVANT toute action puis à nouveau par
// chaque script bash : Production refusée par défaut ; cible distante refusée sauf
// DR_ALLOW_REMOTE=1 + DR_REMOTE_ALLOWLIST (et jamais pour un drill destructif) ; bases locales
// `elsatia_dr_*` uniquement. Aucune valeur secrète n'est lue ni écrite par cette commande.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { verifierCibleDr, indicesProduction } from "./garde-cible.mjs";

const ICI = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : undefined; };
const drapeau = (nom) => args.includes(nom);
const horodatage = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "Z");
const OUT = opt("--out") ?? `/tmp/elsatia-dr-v2/run-${horodatage}`;
const hote = process.env.DR_PGHOST ?? "127.0.0.1";

function refuser(motif) {
  console.error(`[dr:verify] REFUS : ${motif}`);
  process.exit(3);
}

const prod = indicesProduction(process.env, { hote });
if (prod.length) refuser(`Production refusée par défaut (${prod.join(" ; ")}).`);
const bases = drapeau("--backup") || opt("--backup")
  ? ["elsatia_dr_v2_verify"]
  : ["elsatia_dr_v2_src", "elsatia_dr_v2_live", "elsatia_dr_v2_verify", "elsatia_dr_v2_d3ref", "elsatia_dr_v2_d3resume",
     "elsatia_dr_v2_storage", "elsatia_dr_v2_auth"];
for (const base of bases) {
  const r = verifierCibleDr({ hote, base, mode: "drill" }, process.env);
  if (!r.autorise) refuser(r.motif);
}
mkdirSync(OUT, { recursive: true });

function lancer(script, ...a) {
  const r = spawnSync("bash", [path.join(ICI, script), ...a], { stdio: "inherit", env: process.env });
  return r.status ?? 1;
}
const lire = (f) => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null);

if (opt("--backup")) {
  const dossier = path.resolve(opt("--backup"));
  if (!existsSync(path.join(dossier, "manifest.json"))) refuser(`pas de manifest.json dans ${dossier}`);
  const code = lancer("verify_backup.sh", dossier, "elsatia_dr_v2_verify");
  console.log(code === 0 ? "BACKUP VERIFIED — restaurable à l'identique" : "BACKUP INVALID");
  process.exit(code);
}

const resultats = {};
const codeDb = lancer("drill.sh", path.join(OUT, "db"));
resultats.db = { code: codeDb, ...(lire(path.join(OUT, "db", "results.json")) ?? {}) };
if (!drapeau("--db-only")) {
  const codeSt = lancer("storage_drill.sh", path.join(OUT, "storage"));
  resultats.storage = { code: codeSt, ...(lire(path.join(OUT, "storage", "storage_results.json")) ?? {}) };
  const codeAu = lancer("auth_drill.sh", path.join(OUT, "auth"));
  resultats.auth = { code: codeAu, ...(lire(path.join(OUT, "auth", "auth_results.json")) ?? {}) };
}

const compte = (r) => {
  const c = r?.controles ?? [];
  return `${c.filter((x) => x.statut === "ok").length}/${c.length}`;
};
const nonProuve = (r) => r && r.code === 2;
const echec = Object.values(resultats).some((r) => r.code !== 0 && !(nonProuve(r) && !drapeau("--strict")));
console.log("\n== DR V2 — synthèse");
console.log(`  base     : ${compte(resultats.db)} contrôles${resultats.db.code === 0 ? "" : " — ÉCHEC"}`);
if (resultats.storage) console.log(`  storage  : ${nonProuve(resultats.storage) ? "STORAGE_NOT_PROVEN (pas de vraie storage-api)" : `${compte(resultats.storage)} contrôles — ${resultats.storage.verdict}`}`);
if (resultats.auth) console.log(`  auth     : ${nonProuve(resultats.auth) ? "AUTH_NOT_PROVEN (pas de vrai GoTrue)" : `${compte(resultats.auth)} contrôles — ${resultats.auth.verdict}`}`);
if (resultats.db.mesures) {
  const m = resultats.db.mesures;
  console.log(`  mesures  : backup ${m.backup_total_s}s (pg_dump ${m.backup_pg_dump_s}s), restauration ${m.D1_restore_s}–${m.D4_restore_s}s, vérification ${m.D1_verify_s}s`);
}
console.log(`  sortie   : ${OUT}`);
console.log(echec ? "\nELSATIA DR BLOCKED" : "\nELSATIA DR LOCALLY QUALIFIED");
process.exit(echec ? 1 : 0);
