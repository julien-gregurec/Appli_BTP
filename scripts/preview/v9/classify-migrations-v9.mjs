#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : classement REVERSIBLE / FORWARD_ONLY / RESTORE_REQUIRED des
 * migrations EN ATTENTE, déterminé depuis le SQL (Phase K).
 *
 * Usage : node scripts/preview/v9/classify-migrations-v9.mjs [--ledger <export>] [--json]
 *   sans --ledger : PENDING depuis le socle V8 (plancher 813 ORIGINALE, rang calculé) ;
 *   --ledger      : PENDING_MIGRATIONS = train − ledger fourni (préfixe exact exigé).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { estPointEntree, lireOptions } from "../lib/preview-guard.mjs";
import { VERSION_SOCLE } from "./lib/constantes.mjs";
import { classerTrain } from "./lib/classement.mjs";
import { analyserLedger, ErreurLedger, lireLedger } from "./lib/ledger.mjs";
import { DOSSIER_MIGRATIONS, rangDe, trainLocal } from "./lib/train.mjs";

/** Classe une liste de migrations du train (lecture du SQL local). */
export function classerMigrations(liste) {
  return classerTrain(liste.map((m) => ({ version: m.version, name: m.name, sql: readFileSync(resolve(DOSSIER_MIGRATIONS, m.fichier), "utf8") })))
    .map((c, i) => ({ ...c, phase0: Boolean(liste[i].phase0) }));
}

/** Migrations en attente depuis une version (défaut : socle V8) ou depuis un ledger fourni. */
export function enAttente({ local = trainLocal(), depuis = VERSION_SOCLE, ledger = null } = {}) {
  if (ledger) {
    const a = analyserLedger(ledger, local, { attente: "pre" });
    if (!a.conforme) throw new ErreurLedger(`ledger non conforme (${a.verdict}) : ${a.divergences.map((d) => d.code).join(", ") || "rien en attente"}`);
    return a.enAttente;
  }
  const r = rangDe(local, depuis);
  if (!r) throw new ErreurLedger(`${depuis} absente du train local`);
  return local.slice(r);
}

/** Classement des PENDING (depuis le socle V8 par défaut). */
export function classementV9(opts = {}) {
  return classerMigrations(enAttente(opts));
}

if (estPointEntree(import.meta.url)) {
  const o = lireOptions(process.argv.slice(2));
  let c;
  try {
    c = classementV9(typeof o.ledger === "string" ? { ledger: lireLedger(readFileSync(o.ledger, "utf8")) } : {});
  } catch (e) {
    console.log(`CLASSIFY_REFUSED\n  ✖ ${e.message}`);
    process.exit(1);
  }
  if (o.json) console.log(JSON.stringify(c, null, 2));
  else {
    console.log(`PENDING_MIGRATIONS=${c.length} (${typeof o.ledger === "string" ? "depuis le ledger fourni" : `depuis le socle V8 ${VERSION_SOCLE}`})`);
    for (const m of c) console.log(`${m.version}  ${m.classe.padEnd(16)} ${m.name}${m.phase0 ? "  [phase 0 : no-op en Preview]" : ""}${m.note ? `\n                  ↳ ${m.note}` : ""}`);
    const k = {};
    for (const m of c) k[m.classe] = (k[m.classe] ?? 0) + 1;
    console.log(`\n${Object.entries(k).map(([a, b]) => `${a}=${b}`).join("  ")}`);
  }
}
