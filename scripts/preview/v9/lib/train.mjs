// ELSATIA — Pack opérateur V9 : train LOCAL (supabase/migrations), seule référence du pack.
// Pur, hors ligne : lecture de fichiers, aucune écriture.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { DERNIERE_FINALE, NB_FINAL, NB_SOCLE, NOM_SOCLE, SHA256_813_ORIGINAL, VERSION_SOCLE } from "./constantes.mjs";

export const ROOT = resolve(import.meta.dirname, "../../../..");
export const DOSSIER_MIGRATIONS = resolve(ROOT, "supabase/migrations");

const FICHIER = /^(\d{14})_(.+)\.sql$/;

/** Migrations locales triées : { version, name, fichier, sha256 }. */
export function trainLocal(dir = DOSSIER_MIGRATIONS) {
  return readdirSync(dir)
    .map((f) => [f, FICHIER.exec(f)])
    .filter(([, m]) => m)
    .map(([f, m]) => ({ version: m[1], name: m[2], fichier: f, sha256: createHash("sha256").update(readFileSync(resolve(dir, f))).digest("hex") }))
    .sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));
}

/**
 * Contrôle du train local contre les attendus canoniques V9.
 * @returns {{ ok: boolean, constats: {ok: boolean, code: string, message: string}[] }}
 */
export function verifierTrainLocal(train) {
  const constats = [];
  const c = (ok, code, message) => constats.push({ ok, code, message });
  c(train.length === NB_FINAL, "TRAIN-NB", `${train.length} migrations locales (attendu ${NB_FINAL})`);
  c(train.at(-1)?.version === DERNIERE_FINALE, "TRAIN-DERNIERE", `dernière locale ${train.at(-1)?.version ?? "—"} (attendu ${DERNIERE_FINALE})`);
  const socle = train[NB_SOCLE - 1];
  c(socle?.version === VERSION_SOCLE && socle?.name === NOM_SOCLE, "TRAIN-SOCLE", `migration n°${NB_SOCLE} = ${socle?.version ?? "—"}_${socle?.name ?? "—"} (attendu ${VERSION_SOCLE}_${NOM_SOCLE})`);
  c(socle?.sha256 === SHA256_813_ORIGINAL, "TRAIN-813-ORIGINAL", socle?.sha256 === SHA256_813_ORIGINAL ? "813 locale = 813 ORIGINALE (sha256 c95e3e…)" : "813 locale DIFFÉRENTE de l'originale : train non canonique");
  const versions = train.map((m) => m.version);
  c(new Set(versions).size === versions.length, "TRAIN-UNICITE", "versions uniques");
  const apres = train.slice(NB_SOCLE);
  c(apres.every((m) => m.version > VERSION_SOCLE), "TRAIN-POSTERIEURES", `${apres.length} migrations après le socle, toutes > ${VERSION_SOCLE}`);
  return { ok: constats.every((x) => x.ok), constats };
}
