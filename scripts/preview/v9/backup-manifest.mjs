#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : écrit le manifeste de sauvegarde d'un dossier de dumps (HORS dépôt).
 *
 * Usage : node scripts/preview/v9/backup-manifest.mjs --dir <dossier de sauvegarde>
 * Noms de fichiers attendus (commandes : docs/runbooks/ELSATIA_V9_PREVIEW_BACKUP_AND_RESTORE.md) :
 *   preview-schema.sql  preview-data.sql  preview-auth-data.sql  preview-migrations-data.sql
 *   ledger-avant.json   preview-roles.sql  preview-storage-data.sql
 * Le manifeste porte taille et sha256 de chaque fichier présent ; `created_at` = date de
 * modification du PLUS ANCIEN fichier (on ne prétend pas une sauvegarde plus récente qu'elle n'est).
 * Il ne vaut rien seul : `backup-check.mjs` vérifie ensuite ce que les fichiers contiennent.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { estPointEntree, lireOptions } from "../lib/preview-guard.mjs";
import { REF_PREVIEW_AUTORISEE } from "./lib/constantes.mjs";
import { ROOT } from "./lib/train.mjs";

export const FICHIERS_SAUVEGARDE = Object.freeze({
  "preview-schema.sql": "schema",
  "preview-data.sql": "data",
  "preview-auth-data.sql": "auth",
  "preview-migrations-data.sql": "migrations_data",
  "ledger-avant.json": "ledger",
  "preview-roles.sql": "roles",
  "preview-storage-data.sql": "storage_metadata",
});

export function construireManifeste(dir) {
  const artefacts = [];
  let plusAncien = null;
  for (const [nom, kind] of Object.entries(FICHIERS_SAUVEGARDE)) {
    const p = resolve(dir, nom);
    if (!existsSync(p)) continue;
    const st = statSync(p);
    if (!plusAncien || st.mtime < plusAncien) plusAncien = st.mtime;
    artefacts.push({ kind, path: nom, bytes: st.size, sha256: createHash("sha256").update(readFileSync(p)).digest("hex") });
  }
  return { project_ref: REF_PREVIEW_AUTORISEE, created_at: (plusAncien ?? new Date(0)).toISOString(), dashboard_backup_id: null, artefacts };
}

if (estPointEntree(import.meta.url)) {
  const o = lireOptions(process.argv.slice(2));
  if (typeof o.dir !== "string") { console.log("usage : backup-manifest.mjs --dir <dossier hors dépôt>"); process.exit(2); }
  const dir = resolve(o.dir);
  const rel = relative(ROOT, dir);
  if (!rel.startsWith("..")) { console.log("REFUS : le dossier de sauvegarde doit être HORS du dépôt"); process.exit(2); }
  const m = construireManifeste(dir);
  writeFileSync(resolve(dir, "manifest.json"), `${JSON.stringify(m, null, 2)}\n`);
  console.log(`manifeste écrit : ${resolve(dir, "manifest.json")} (${m.artefacts.length} fichier(s) ; vérifier avec backup-check.mjs)`);
}
