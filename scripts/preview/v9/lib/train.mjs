// ELSATIA — Pack opérateur V9 : train LOCAL (supabase/migrations de HEAD), seule référence du pack.
// Pur, hors ligne : lecture de fichiers, aucune écriture. Aucun nombre de migrations codé :
// TARGET_LEDGER (nombre, dernière version) est CALCULÉ depuis les fichiers.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { MARQUEUR_PHASE0, NOM_SOCLE, SHA256_813_ORIGINAL, VERSION_PREREQUIS_PHASE0, VERSION_SOCLE, VERSION_V9_1 } from "./constantes.mjs";

export const ROOT = resolve(import.meta.dirname, "../../../..");
export const DOSSIER_MIGRATIONS = resolve(ROOT, "supabase/migrations");

const FICHIER = /^(\d{14})_(.+)\.sql$/;
const LIGNE_PHASE0 = new RegExp(`^${MARQUEUR_PHASE0.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m");

/** Vrai si le SQL porte la ligne marqueur des ponts d'upgrade Production (phase 0). */
export function estPhase0(sql) {
  return LIGNE_PHASE0.test(String(sql));
}

/** Migrations locales triées : { version, name, fichier, sha256, phase0 }. */
export function trainLocal(dir = DOSSIER_MIGRATIONS) {
  return readdirSync(dir)
    .map((f) => [f, FICHIER.exec(f)])
    .filter(([, m]) => m)
    .map(([f, m]) => {
      const contenu = readFileSync(resolve(dir, f));
      return { version: m[1], name: m[2], fichier: f, sha256: createHash("sha256").update(contenu).digest("hex"), phase0: estPhase0(contenu.toString("utf8")) };
    })
    .sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));
}

/** TARGET_LEDGER : nombre et dernière version du train local. */
export function cibleTrain(train) {
  return { nb: train.length, derniere: train.at(-1)?.version ?? null };
}

/** Rang (1-based) d'une version dans le train ; 0 si absente. */
export function rangDe(train, version) {
  return train.findIndex((m) => m.version === version) + 1;
}

/** Préfixe du train jusqu'à `version` incluse (vide si absente). */
export function prefixeJusqua(train, version) {
  const r = rangDe(train, version);
  return r ? train.slice(0, r) : [];
}

/**
 * Contrôle du train local contre les INVARIANTS historiques (jamais contre un compteur).
 * @returns {{ ok: boolean, cible: {nb: number, derniere: string|null}, constats: {ok: boolean, code: string, message: string}[] }}
 */
export function verifierTrainLocal(train) {
  const constats = [];
  const c = (ok, code, message) => constats.push({ ok, code, message });
  const cible = cibleTrain(train);
  c(train.length > 0, "TRAIN-CIBLE", `TARGET_LEDGER=${cible.nb} (dernière ${cible.derniere ?? "—"}), calculé depuis supabase/migrations`);
  const versions = train.map((m) => m.version);
  c(new Set(versions).size === versions.length, "TRAIN-UNICITE", "versions uniques");
  const rangSocle = rangDe(train, VERSION_SOCLE);
  const socle = train[rangSocle - 1];
  c(Boolean(socle) && socle.name === NOM_SOCLE, "TRAIN-SOCLE", socle ? `plancher Preview ${VERSION_SOCLE}_${socle.name} au rang ${rangSocle} (attendu ${VERSION_SOCLE}_${NOM_SOCLE})` : `plancher Preview ${VERSION_SOCLE}_${NOM_SOCLE} absent du train`);
  c(socle?.sha256 === SHA256_813_ORIGINAL, "TRAIN-813-ORIGINAL", socle?.sha256 === SHA256_813_ORIGINAL ? "813 locale = 813 ORIGINALE (sha256 c95e3e…)" : "813 locale DIFFÉRENTE de l'originale : train non canonique");
  const rangV91 = rangDe(train, VERSION_V9_1);
  c(rangV91 > rangSocle, "TRAIN-V9-1", rangV91 ? `base publiée V9.1 (${VERSION_V9_1}) au rang ${rangV91}` : `${VERSION_V9_1} (dernière de V9.1) absente du train`);
  const apres = train.slice(rangSocle);
  c(rangSocle > 0 && apres.length > 0, "TRAIN-POSTERIEURES", `${apres.length} migration(s) postérieure(s) au plancher ${VERSION_SOCLE} (PENDING depuis le socle V8)`);
  const p0 = train.filter((m) => m.phase0);
  const rang300 = rangDe(train, VERSION_PREREQUIS_PHASE0);
  const p0Ok = rang300 > 0 && p0.every((m) => m.version > VERSION_SOCLE);
  c(p0Ok, "TRAIN-PHASE0", p0.length
    ? `${p0.length} pont(s) phase 0 (${p0.map((m) => m.version).join(", ")}) postérieur(s) au plancher et à ${VERSION_PREREQUIS_PHASE0} : no-op en Preview`
    : "aucun pont phase 0 dans le train");
  return { ok: constats.every((x) => x.ok), cible, constats };
}
