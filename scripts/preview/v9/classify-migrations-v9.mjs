#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : classement REVERSIBLE / FORWARD_ONLY / RESTORE_REQUIRED des
 * migrations appliquées par le cutover (rangs 373 → 389), déterminé depuis le SQL (Phase K).
 *
 * Usage : node scripts/preview/v9/classify-migrations-v9.mjs [--json] [--all]
 *   --all : classe tout le train (389), pour information.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { estPointEntree, lireOptions } from "../lib/preview-guard.mjs";
import { NB_SOCLE } from "./lib/constantes.mjs";
import { classerTrain } from "./lib/classement.mjs";
import { DOSSIER_MIGRATIONS, trainLocal } from "./lib/train.mjs";

export function classementV9({ tout = false } = {}) {
  const t = trainLocal();
  return classerTrain((tout ? t : t.slice(NB_SOCLE)).map((m) => ({ version: m.version, name: m.name, sql: readFileSync(resolve(DOSSIER_MIGRATIONS, m.fichier), "utf8") })));
}

if (estPointEntree(import.meta.url)) {
  const o = lireOptions(process.argv.slice(2));
  const c = classementV9({ tout: Boolean(o.all) });
  if (o.json) console.log(JSON.stringify(c, null, 2));
  else {
    for (const m of c) console.log(`${m.version}  ${m.classe.padEnd(16)} ${m.name}${m.note ? `\n                  ↳ ${m.note}` : ""}`);
    const k = {};
    for (const m of c) k[m.classe] = (k[m.classe] ?? 0) + 1;
    console.log(`\n${Object.entries(k).map(([a, b]) => `${a}=${b}`).join("  ")}`);
  }
}
