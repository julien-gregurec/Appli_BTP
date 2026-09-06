#!/usr/bin/env node
// Lanceur du jeu de démonstration local (ELSATIA-GP-SAFE-DEMO-CAPTURE-BUILD-V1).
//
// Rôle unique : garantir que les scripts SQL de supabase/local/ ne partent JAMAIS
// ailleurs que vers le Supabase local du poste, puis les exécuter dans l'ordre.
// Aucune écriture n'est tentée avant que la cible ne soit prouvée locale.
//
//   node scripts/seed-demo-captures-local.mjs

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTENEUR = process.env.ELSATIA_LOCAL_DB_CONTAINER ?? "supabase_db_btp-platform";
const HOTES_LOCAUX = new Set(["127.0.0.1", "localhost", "::1", "0.0.0.0", "::"]);
const FICHIERS = [
  "supabase/local/creer_entreprise_demo_captures.sql",
  "supabase/local/compte_demo_captures.sql",
];

function stop(message) {
  console.error(`\nARRÊT SÛR : ${message}\n`);
  process.exit(1);
}

/** Lit les fichiers .env locaux sans les charger dans l'environnement du processus. */
function lireEnv() {
  const valeurs = {};
  for (const nom of [".env.local", ".env.development.local"]) {
    const chemin = path.join(RACINE, nom);
    if (!existsSync(chemin)) continue;
    for (const ligne of readFileSync(chemin, "utf8").split(/\r?\n/)) {
      if (!ligne || ligne.startsWith("#")) continue;
      const separateur = ligne.indexOf("=");
      if (separateur < 1) continue;
      // .env.development.local est chargé en dernier : il l'emporte, comme dans Next.js.
      valeurs[ligne.slice(0, separateur).trim()] = ligne.slice(separateur + 1).trim();
    }
  }
  return { ...valeurs, ...process.env };
}

/** L'URL Supabase visée doit être locale, sans exception ni option de contournement. */
function verifierUrlSupabase(env) {
  const brute = env.NEXT_PUBLIC_SUPABASE_URL;
  if (!brute) stop("NEXT_PUBLIC_SUPABASE_URL absente : cible non identifiable.");
  let url;
  try {
    url = new URL(brute);
  } catch {
    stop(`NEXT_PUBLIC_SUPABASE_URL illisible : ${brute}`);
  }
  if (!HOTES_LOCAUX.has(url.hostname)) {
    stop(`cible Supabase non locale (${url.hostname}). Seul le Supabase local du poste est autorisé — jamais Production, jamais Preview.`);
  }
  return url.origin;
}

/** La base visée doit être le conteneur Docker local, publié sur une boucle locale. */
function verifierBaseLocale() {
  let inspection;
  try {
    inspection = execFileSync(
      "docker",
      ["inspect", "-f", "{{json .NetworkSettings.Ports}}", CONTENEUR],
      { encoding: "utf8" },
    ).trim();
  } catch {
    stop(`conteneur Docker « ${CONTENEUR} » introuvable. Démarrez le Supabase local (npm run db:start).`);
  }
  const ports = JSON.parse(inspection);
  const liaisons = ports["5432/tcp"] ?? [];
  if (!liaisons.length) stop(`le conteneur « ${CONTENEUR} » ne publie aucun port PostgreSQL : cible non vérifiable.`);
  for (const liaison of liaisons) {
    if (!HOTES_LOCAUX.has(liaison.HostIp)) {
      stop(`le conteneur « ${CONTENEUR} » est publié sur ${liaison.HostIp} : ce n'est pas une base locale.`);
    }
  }
  return liaisons.map((l) => `${l.HostIp}:${l.HostPort}`).join(", ");
}

function executer(fichier) {
  const chemin = path.join(RACINE, fichier);
  if (!existsSync(chemin)) stop(`fichier SQL introuvable : ${fichier}`);
  console.log(`\n▶ ${fichier}`);
  try {
    const sortie = execFileSync(
      "docker",
      [
        "exec", "-i", CONTENEUR,
        "psql", "-U", "postgres", "-d", "postgres",
        "-v", "ON_ERROR_STOP=1",
        // Le garde-fou en tête de chaque fichier SQL exige ce paramètre de session :
        // un collage manuel dans un éditeur SQL distant échoue donc d'emblée.
        "-c", "set elsatia.demo_captures_local = 'oui'",
        "-f", "-",
      ],
      { input: readFileSync(chemin), encoding: "utf8", stdio: ["pipe", "pipe", "inherit"] },
    );
    process.stdout.write(sortie);
  } catch {
    // psql a déjà écrit le diagnostic sur stderr : inutile d'empiler une trace Node.
    stop(`échec de ${fichier} — voir le message psql ci-dessus. Aucune suite exécutée.`);
  }
}

const env = lireEnv();
const origine = verifierUrlSupabase(env);
const liaison = verifierBaseLocale();
console.log(`Cible vérifiée — API ${origine} · base ${CONTENEUR} (${liaison})`);

for (const fichier of FICHIERS) executer(fichier);
console.log("\n✓ Jeu de démonstration local prêt.");
