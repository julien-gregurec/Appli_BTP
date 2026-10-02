#!/usr/bin/env node
/**
 * ELSATIA — Pack Preview V8 : sauvegarde OBLIGATOIRE avant toute migration Preview.
 *
 * Lectures distantes uniquement (pg_dump et psql en session lecture seule). Produit, dans un
 * dossier HORS du dépôt (jamais versionné : données de recette, comptes Auth) :
 *   db.dump                base complète (pg_dump --format=custom)
 *   ledger.txt             ledger des migrations (supabase_migrations.schema_migrations)
 *   auth.dump              snapshot Auth (pg_dump --data-only --schema=auth)
 *   storage-inventory.tsv  inventaire Storage : buckets puis objets (bucket, nom, taille, date)
 *   manifest.json          ref, date, empreinte du ledger, sha256 et taille de chaque fichier
 * Le CONTENU des objets Storage n'est pas copié (inventaire seulement) : voir le runbook §Storage.
 *
 * Usage :
 *   ELSATIA_PREVIEW_DB_URL='postgresql://…' node scripts/preview/backup-preview.mjs --out <dossier-neuf>
 * Le manifeste est exigé par v8-upgrade-gate.mjs --authorize-push et pilot-subscription.mjs --apply.
 * Sortie : 0 sauvegarde complète · 1 échec · 2 refus.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { Refus, SORTIE, estPointEntree, ligne, lireOptions, refuserProduction } from "./lib/preview-guard.mjs";
import { FICHIERS_SAUVEGARDE, analyserLedger, exigerDepotV8 } from "./lib/v8-gate.mjs";
import { versionsLocales } from "./db-verify.mjs";
import { lireLedgerDistant, psqlLectureSeule, resoudreCible, sha256Fichier } from "./v8-upgrade-gate.mjs";

const ROOT = resolve(import.meta.dirname, "../..");

export const SQL_INVENTAIRE_STORAGE = `
select 'bucket', id, public::text, coalesce(file_size_limit::text, ''), '' from storage.buckets
union all
select 'objet', bucket_id, name, coalesce(metadata->>'size', ''), coalesce(updated_at::text, '')
from storage.objects
order by 1, 2, 3`;

export const SQL_COMPTEURS = `
select (select count(*) from auth.users), (select count(*) from auth.identities),
       (select count(*) from storage.buckets), (select count(*) from storage.objects)`;

/** Dossier de sortie : hors du dépôt, neuf ou vide. */
export function exigerDossierSortie(dossier, racine = ROOT) {
  const abs = resolve(dossier);
  const rel = relative(racine, abs);
  if (!rel.startsWith("..") && !rel.startsWith("/")) throw new Refus("--out doit être HORS du dépôt (données de recette et comptes Auth : jamais versionnés)");
  if (existsSync(abs) && readdirSync(abs).length) throw new Refus("--out existe et n'est pas vide : choisir un dossier neuf");
  return abs;
}

function pgDump(url, fichier, args) {
  const r = spawnSync("pg_dump", [...args, "--file", fichier, url], {
    encoding: "utf8",
    env: { ...process.env, PGOPTIONS: "-c default_transaction_read_only=on", PGCONNECT_TIMEOUT: "15" },
  });
  if (r.error) throw new Refus(`pg_dump introuvable (${r.error.code ?? r.error.message})`);
  const erreur = (r.stderr ?? "").replace(/postgres(?:ql)?:\/\/\S+/g, "<url masquée>").trim().split("\n").at(-1);
  return { code: r.status, erreur };
}

export function executer(o, env = process.env, log = console.log) {
  refuserProduction(env);
  exigerDepotV8(versionsLocales());
  const url = env.ELSATIA_PREVIEW_DB_URL;
  if (!url) throw new Refus("ELSATIA_PREVIEW_DB_URL absente (URL PostgreSQL de la Preview)");
  const { ref, simulation } = resoudreCible(url, o);
  if (typeof o.out !== "string") throw new Refus("--out <dossier> requis");
  const dossier = exigerDossierSortie(o.out);
  mkdirSync(dossier, { recursive: true, mode: 0o700 });
  log(`ELSATIA — sauvegarde Preview ${ref} (lectures seules, URL masquée) → ${dossier}\n`);

  const distantes = lireLedgerDistant(url);
  const analyse = analyserLedger(versionsLocales(), distantes);
  writeFileSync(join(dossier, "ledger.txt"), `${[...distantes].sort().join("\n")}\n`, { mode: 0o600 });
  log(ligne("ok", "BACKUP-LEDGER", "ledger", `${analyse.nbDistantes} version(s), dernière ${analyse.derniereDistante ?? "—"} (${analyse.statut})`));

  let echecs = 0;
  const dump = pgDump(url, join(dossier, "db.dump"), ["--format=custom", "--no-password"]);
  if (dump.code !== 0) { echecs += 1; log(ligne("ko", "BACKUP-DB", "pg_dump", dump.erreur)); } else log(ligne("ok", "BACKUP-DB", "base complète", "db.dump"));
  const auth = pgDump(url, join(dossier, "auth.dump"), ["--format=custom", "--no-password", "--data-only", "--schema=auth"]);
  if (auth.code !== 0) { echecs += 1; log(ligne("ko", "BACKUP-AUTH", "pg_dump auth", auth.erreur)); } else log(ligne("ok", "BACKUP-AUTH", "snapshot Auth", "auth.dump"));

  const inv = psqlLectureSeule(url, SQL_INVENTAIRE_STORAGE.replace(/\n/g, " "));
  if (inv.code !== 0) { echecs += 1; log(ligne("ko", "BACKUP-STORAGE", "inventaire", inv.erreur)); } else {
    writeFileSync(join(dossier, "storage-inventory.tsv"), `type|bucket|nom_ou_public|taille_ou_limite|maj\n${inv.stdout}`, { mode: 0o600 });
    log(ligne("ok", "BACKUP-STORAGE", "inventaire Storage", "storage-inventory.tsv (contenu des objets non copié)"));
  }
  const c = psqlLectureSeule(url, SQL_COMPTEURS.replace(/\n/g, " "));
  const [authUsers, authIdentities, buckets, objets] = c.code === 0 ? c.stdout.trim().split("|").map(Number) : [];

  const fichiers = {};
  const noms = { db_dump: "db.dump", ledger: "ledger.txt", auth_snapshot: "auth.dump", storage_inventory: "storage-inventory.tsv" };
  for (const cle of Object.keys(FICHIERS_SAUVEGARDE)) {
    const p = join(dossier, noms[cle]);
    if (existsSync(p)) fichiers[cle] = { nom: noms[cle], octets: statSync(p).size, sha256: sha256Fichier(p) };
  }
  const manifeste = {
    ref,
    cree_le: new Date().toISOString(),
    ledger: { nb: analyse.nbDistantes, derniere: analyse.derniereDistante, statut: analyse.statut, empreinte: analyse.empreinte },
    fichiers,
    compteurs: { auth_users: authUsers ?? null, auth_identities: authIdentities ?? null, storage_buckets: buckets ?? null, storage_objets: objets ?? null },
    storage_contenu_copie: false,
    simulation,
  };
  writeFileSync(join(dossier, "manifest.json"), `${JSON.stringify(manifeste, null, 2)}\n`, { mode: 0o600 });
  const complet = !echecs && Object.keys(fichiers).length === Object.keys(FICHIERS_SAUVEGARDE).length && Object.values(fichiers).every((f) => f.octets > 0);
  log(complet ? `\nSAUVEGARDE COMPLÈTE : ${join(dossier, "manifest.json")} (valable 6 h, tant que le ledger ne change pas).` : "\nSAUVEGARDE INCOMPLÈTE : aucune migration ne sera autorisée.");
  return complet ? SORTIE.GO : SORTIE.NO_GO;
}

if (estPointEntree(import.meta.url)) {
  try {
    process.exitCode = executer(lireOptions(process.argv.slice(2)));
  } catch (error) {
    if (error instanceof Refus) { console.error(`REFUS : ${error.message}`); process.exitCode = SORTIE.REFUS; } else throw error;
  }
}
