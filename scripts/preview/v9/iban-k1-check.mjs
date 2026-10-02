#!/usr/bin/env node
/**
 * ELSATIA — Pack opérateur V9 : contrôle de la clé IBAN k1 (Phase H). Ne lit ni n'affiche aucune clé.
 *
 * Usage :
 *   node scripts/preview/v9/iban-k1-check.mjs <inventaire Vercel exporté> [--bank-keys-status <json>]
 *   --bank-keys-status : sortie de `npm run bank-keys -- status` exécuté dans l'environnement
 *                        Preview APRÈS la migration 1112 (identifiants et statuts seulement).
 * Sortie : « IBAN_K1_READY » (0) ou « IBAN_K1_MISSING » (+ « BLOCKER_IBAN_KEY » si k1 manque) (1).
 * Ne génère jamais de clé.
 */
import { readFileSync } from "node:fs";
import { loadJson, MANIFEST_PATH } from "../../lib/env-manifest-core.mjs";
import { estPointEntree, lireOptions } from "../lib/preview-guard.mjs";
import { lireInventaire } from "./lib/env-scope.mjs";
import { evaluerIban } from "./lib/iban.mjs";
import { ROOT } from "./lib/train.mjs";

export function executer(argv, { manifest = loadJson(ROOT, MANIFEST_PATH), log = console.log } = {}) {
  const o = lireOptions(argv);
  const fichier = argv.find((a, i) => !a.startsWith("--") && argv[i - 1] !== "--bank-keys-status");
  if (!fichier) { log("usage : iban-k1-check.mjs <inventaire> [--bank-keys-status <json>]"); return 2; }
  let inv;
  let statut = null;
  try { inv = lireInventaire(readFileSync(fichier, "utf8"), manifest); } catch { log("IBAN_K1_MISSING\n  ✖ inventaire illisible"); return 1; }
  if (typeof o["bank-keys-status"] === "string") {
    try {
      // bank-keys émet une ligne JSON par événement : on garde la dernière (le rapport `status`).
      const lignes = readFileSync(o["bank-keys-status"], "utf8").trim().split("\n").filter((l) => l.trim().startsWith("{"));
      statut = JSON.parse(lignes.at(-1));
    } catch { log("IBAN_K1_MISSING\n  ✖ sortie bank-keys status illisible"); return 1; }
  }
  const r = evaluerIban(inv, statut);
  log(r.verdict);
  if (r.blocker) log(r.blocker);
  log(`  attestation k1 au registre : ${r.attestation}`);
  for (const c of r.constats) log(`  ${c.ok ? "✓" : c.bloquant ? "✖" : "!"} [${c.code}] ${c.message}`);
  if (r.fluxIndisponibles.length) {
    log("  Flux qui DOIVENT rester indisponibles tant que k1 manque (le trousseau échoue fermé) :");
    for (const f of r.fluxIndisponibles) log(`    - ${f}`);
    log("  Ne JAMAIS générer de clé de remplacement : une clé neuve rend illisibles les IBAN déjà chiffrés sous k1.");
  }
  return r.verdict === "IBAN_K1_READY" ? 0 : 1;
}

if (estPointEntree(import.meta.url)) process.exitCode = executer(process.argv.slice(2));
