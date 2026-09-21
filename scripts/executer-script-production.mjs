#!/usr/bin/env node
// Wrapper sécurisé pour exécuter un script de recette de supabase/production/.
//
// Usage :
//   node scripts/executer-script-production.mjs <nom-fichier.sql>
//
// Ce wrapper ne colle jamais aveuglément le SQL dans un éditeur : il vérifie
// d'abord, par du code, que l'environnement pointe sans ambiguïté sur le projet
// Preview autorisé (jamais une future Production, dont la référence n'a pas
// besoin d'être connue pour être refusée), puis exige une confirmation dédiée
// pour les scripts destructifs. Ce n'est qu'après ces deux vérifications qu'il
// délègue l'exécution à `supabase db query --linked --file`, la même commande
// utilisée manuellement tout au long de ce dépôt.
//
// Voir scripts/garde-scripts-production.mjs pour la logique de vérification
// (pure, testée sans aucun accès réseau dans garde-scripts-production.test.mjs).

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { verifierAutorisationComplete } from "./garde-scripts-production.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOSSIER_SCRIPTS = path.join(ROOT, "supabase", "production");
const FICHIER_REF_LIEE = path.join(ROOT, "supabase", ".temp", "project-ref");

function abort(message) {
  console.error(`ARRÊT SÛR : ${message}`);
  process.exit(1);
}

function litRefLieeCli() {
  if (!existsSync(FICHIER_REF_LIEE)) return null;
  try {
    return readFileSync(FICHIER_REF_LIEE, "utf8").trim();
  } catch {
    return null;
  }
}

function main() {
  const nomFichier = process.argv[2];
  if (!nomFichier) abort("nom de fichier manquant. Usage : node scripts/executer-script-production.mjs <nom-fichier.sql>");
  if (nomFichier.includes("/") || nomFichier.includes("\\") || nomFichier.includes("..")) {
    abort("le nom de fichier doit être un nom simple, sans chemin (protection contre la traversée de chemin).");
  }

  const refLieeCli = litRefLieeCli();
  const resultat = verifierAutorisationComplete(nomFichier, process.env, refLieeCli);
  if (!resultat.autorise) abort(resultat.motif);

  const cheminSql = path.join(DOSSIER_SCRIPTS, nomFichier);
  if (!existsSync(cheminSql)) abort(`fichier introuvable : ${cheminSql}`);

  console.log(`Cible vérifiée : Preview ${resultat.ref} — script ${resultat.destructif ? "DESTRUCTIF, confirmation validée" : "non destructif"}.`);
  console.log(`Exécution de ${nomFichier} via 'supabase db query --linked --file'…`);

  execFileSync("npx", ["supabase", "db", "query", "--linked", "--file", cheminSql], {
    cwd: ROOT,
    stdio: "inherit",
  });
}

main();
