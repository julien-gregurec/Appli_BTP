// ELSATIA — Pack opérateur V9 : vérification de la sauvegarde DÉCLARÉE avant migration (Phase E).
//
// L'opérateur produit les sauvegardes (commandes : docs/runbooks/ELSATIA_V9_PREVIEW_BACKUP_AND_RESTORE.md)
// puis décrit ce qu'il a produit dans un manifeste JSON HORS du dépôt. Ce module vérifie, hors
// ligne, ce que les fichiers prouvent réellement — il ne prétend pas qu'une sauvegarde existe
// parce qu'elle est déclarée :
//   - projet = Preview, date récente et non future ;
//   - chaque artefact REQUIRED présent, hors du dépôt, non vide, taille / sha256 conformes si
//     déclarés, et contenant le marqueur attendu (p. ex. `auth.users` dans le dump Auth) ;
//   - l'export de ledger joint = exactement le socle 372.
// Ne lit et n'affiche aucune donnée : uniquement des tailles, des sommes et des présences.

import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { REF_PREVIEW_AUTORISEE } from "./constantes.mjs";
import { analyserLedger, lireLedger } from "./ledger.mjs";

/** Artefacts : niveau d'exigence et marqueur de contenu (présence prouvant ce que le fichier contient). */
export const ARTEFACTS = Object.freeze({
  schema: { niveau: "REQUIRED", marqueur: /CREATE TABLE/i, libelle: "schéma (db dump)" },
  data: { niveau: "REQUIRED", marqueur: /(COPY|INSERT INTO) "?public"?\./i, libelle: "données public (db dump --data-only)" },
  auth: { niveau: "REQUIRED", marqueur: /"?auth"?\."?users"?/i, libelle: "utilisateurs Auth (db dump --data-only --schema auth)" },
  ledger: { niveau: "REQUIRED", marqueur: null, libelle: "ledger des migrations (export JSON)" },
  roles: { niveau: "RECOMMENDED", marqueur: /CREATE ROLE|ALTER ROLE/i, libelle: "rôles (db dump --role-only)" },
  storage_metadata: { niveau: "RECOMMENDED", marqueur: /"?storage"?\."?(objects|buckets)"?/i, libelle: "métadonnées Storage (db dump --data-only --schema storage)" },
  storage_files: { niveau: "OPTIONAL", marqueur: null, libelle: "fichiers Storage (copie des objets) — non couverts par db dump" },
});

function sha256Fichier(chemin) {
  const h = createHash("sha256");
  const fd = openSync(chemin, "r");
  const buf = Buffer.alloc(8 << 20);
  try { let n; while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n)); } finally { closeSync(fd); }
  return h.digest("hex");
}

function contientMarqueur(chemin, motif) {
  const fd = openSync(chemin, "r");
  const buf = Buffer.alloc(8 << 20);
  let reste = "";
  try {
    let n;
    while ((n = readSync(fd, buf, 0, buf.length, null)) > 0) {
      const texte = reste + buf.subarray(0, n).toString("utf8");
      if (motif.test(texte)) return true;
      reste = texte.slice(-256);
    }
  } finally { closeSync(fd); }
  return false;
}

/**
 * @param {object} manifeste  JSON déclaré par l'opérateur
 * @param {{ racineDepot: string, local: object[], maintenant?: Date, ageMaxHeures?: number, baseManifeste?: string }} opts
 */
export function verifierSauvegarde(manifeste, { racineDepot, local, maintenant = new Date(), ageMaxHeures = 12, baseManifeste = process.cwd() }) {
  const constats = [];
  const c = (ok, code, message, niveau = "REQUIRED") => constats.push({ ok, code, message, niveau });
  c(manifeste?.project_ref === REF_PREVIEW_AUTORISEE, "BACKUP-REF", manifeste?.project_ref === REF_PREVIEW_AUTORISEE ? `sauvegarde du projet ${REF_PREVIEW_AUTORISEE}` : "sauvegarde d'un autre projet que la Preview (ou project_ref absent)");
  const date = new Date(manifeste?.created_at ?? "");
  const ageH = (maintenant - date) / 3.6e6;
  c(!Number.isNaN(date.getTime()) && ageH >= -0.1 && ageH <= ageMaxHeures, "BACKUP-DATE", Number.isNaN(date.getTime()) ? "created_at absent ou invalide" : ageH < -0.1 ? "created_at dans le futur" : `sauvegarde âgée de ${ageH.toFixed(1)} h (max ${ageMaxHeures} h)`);

  const artefacts = Array.isArray(manifeste?.artefacts) ? manifeste.artefacts : [];
  for (const [kind, def] of Object.entries(ARTEFACTS)) {
    const a = artefacts.find((x) => x.kind === kind);
    if (!a) { c(def.niveau !== "REQUIRED", `BACKUP-${kind.toUpperCase()}`, `${def.libelle} : non déclaré`, def.niveau); continue; }
    const chemin = isAbsolute(String(a.path ?? "")) ? a.path : resolve(baseManifeste, String(a.path ?? ""));
    const rel = relative(racineDepot, chemin);
    if (!rel.startsWith("..") && !isAbsolute(rel)) { c(false, `BACKUP-${kind.toUpperCase()}`, `${def.libelle} : fichier DANS le dépôt (risque de commit) — le déplacer hors du dépôt`, def.niveau); continue; }
    if (!existsSync(chemin)) { c(false, `BACKUP-${kind.toUpperCase()}`, `${def.libelle} : fichier introuvable`, def.niveau); continue; }
    const st = statSync(chemin);
    const problemes = [];
    if (!st.isFile() || st.size === 0) problemes.push("vide");
    if (a.bytes !== undefined && a.bytes !== null && Number(a.bytes) !== st.size) problemes.push(`taille ${st.size} ≠ déclarée ${a.bytes}`);
    if (a.sha256 && st.size && sha256Fichier(chemin) !== a.sha256) problemes.push("sha256 ≠ déclaré");
    if (def.marqueur && st.size && !contientMarqueur(chemin, def.marqueur)) problemes.push("contenu attendu introuvable");
    if (kind === "ledger" && st.size) {
      try {
        const an = analyserLedger(lireLedger(readFileSync(chemin, "utf8")), local, { attente: "pre" });
        if (!an.conforme) problemes.push(`ledger sauvegardé non conforme (${an.verdict})`);
      } catch (e) { problemes.push(`ledger illisible (${e.message})`); }
    }
    c(problemes.length === 0, `BACKUP-${kind.toUpperCase()}`, problemes.length ? `${def.libelle} : ${problemes.join(", ")}` : `${def.libelle} : ${st.size} octets${a.sha256 ? ", sha256 conforme" : ""}`, def.niveau);
  }
  c(true, "BACKUP-PITR", manifeste?.dashboard_backup_id ? "identifiant de sauvegarde Supabase consigné" : "aucun identifiant de sauvegarde Supabase consigné (plan sans PITR : les dumps sont la seule restauration)", "OPTIONAL");

  const bloquants = constats.filter((x) => !x.ok && x.niveau === "REQUIRED");
  return { ok: bloquants.length === 0, verdict: bloquants.length ? "BACKUP_MISSING" : "BACKUP_DECLARED_OK", constats };
}
