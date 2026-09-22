// Purge RGPD (art. 17) d'une entreprise après le délai de 30 jours (CGV art. 10).
//
// Opération manuelle, supervisée par la plateforme (jamais self-service, jamais
// automatique/cron) — conforme à PROMPT_CODEX_RGPD.md. Irréversible.
//
// Usage :
//   node scripts/purger-entreprise.mjs <entreprise_id>              # rapport (simulation, rien n'est supprimé)
//   node scripts/purger-entreprise.mjs <entreprise_id> --confirmer   # purge réelle
//
// Nécessite NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans l'environnement.
//
// ⚠️ Non testé en conditions réelles pendant la qualification RGPD (pas d'environnement
// Supabase disponible dans le conteneur de qualification). À exécuter d'abord en mode
// rapport, à faire relire, puis à tester sur une entreprise de test avant tout usage en
// production (REMOTE_ACTION_REQUIRED).

import { createClient } from "@supabase/supabase-js";

const [, , entrepriseId, flag] = process.argv;
const confirme = flag === "--confirmer";

if (!entrepriseId) {
  console.error("Usage: node scripts/purger-entreprise.mjs <entreprise_id> [--confirmer]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRole) {
  console.error("NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.");
  process.exit(1);
}

const supabase = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

async function rapport() {
  const { data, error } = await supabase.rpc("rapport_purge_entreprise", { p_entreprise_id: entrepriseId });
  if (error) throw new Error(`Rapport de purge impossible : ${error.message}`);
  return data ?? [];
}

async function fichiersStorage() {
  const { data, error } = await supabase.rpc("lister_fichiers_storage_entreprise", { p_entreprise_id: entrepriseId });
  if (error) throw new Error(`Listing Storage impossible : ${error.message}`);
  return data ?? [];
}

function afficherRapport(lignes, fichiers) {
  const aSupprimer = lignes.filter((l) => l.categorie === "DELETE");
  const conservees = lignes.filter((l) => l.categorie === "RETAIN");
  console.log(`\nEntreprise ${entrepriseId} — simulation de purge`);
  console.log(`\n${aSupprimer.length} table(s) seront purgées (DELETE) :`);
  for (const l of aSupprimer) console.log(`  - ${l.table_nom} (${l.nb_lignes} ligne(s))`);
  console.log(`\n${conservees.length} table(s) conservées (retention légale, DECISION_REQUIRED) :`);
  for (const l of conservees) console.log(`  - ${l.table_nom} (${l.nb_lignes} ligne(s))`);
  console.log(`\n${fichiers.length} fichier(s) Storage seront supprimés :`);
  const parBucket = fichiers.reduce((acc, f) => {
    acc[f.bucket_id] = (acc[f.bucket_id] ?? 0) + 1;
    return acc;
  }, {});
  for (const [bucket, n] of Object.entries(parBucket)) console.log(`  - ${bucket} : ${n} fichier(s)`);
  console.log("\nLa ligne `entreprises` n'est jamais supprimée : elle est anonymisée (voir marquer_entreprise_purgee).\n");
}

async function purgerReellement(lignes, fichiers) {
  const aSupprimer = lignes.filter((l) => l.categorie === "DELETE");

  for (const l of aSupprimer) {
    const { error } = await supabase.rpc("purger_table_entreprise", {
      p_entreprise_id: entrepriseId,
      p_table: l.table_nom,
    });
    if (error) {
      console.error(`ÉCHEC sur ${l.table_nom} : ${error.message}`);
      console.error("La purge est rejouable : relancez ce script, les tables déjà purgées seront ignorées côté rapport.");
      process.exit(1);
    }
    console.log(`OK  ${l.table_nom}`);
  }

  const parBucket = fichiers.reduce((acc, f) => {
    (acc[f.bucket_id] ??= []).push(f.chemin);
    return acc;
  }, {});
  for (const [bucket, chemins] of Object.entries(parBucket)) {
    const { error } = await supabase.storage.from(bucket).remove(chemins);
    if (error) {
      console.error(`ÉCHEC suppression Storage bucket ${bucket} : ${error.message}`);
      console.error("Les tables ont déjà été purgées. Relancez ce script pour ré-essayer les fichiers Storage restants.");
      process.exit(1);
    }
    console.log(`OK  storage:${bucket} (${chemins.length} fichier(s))`);
  }

  const { error: erreurMarquage } = await supabase.rpc("marquer_entreprise_purgee", { p_entreprise_id: entrepriseId });
  if (erreurMarquage) {
    console.error(`ÉCHEC marquage entreprise purgée : ${erreurMarquage.message}`);
    process.exit(1);
  }
  console.log("OK  entreprise anonymisée et marquée purgee_at");
  console.log("\nPurge terminée.\n");
}

const lignes = await rapport();
const fichiers = await fichiersStorage();
afficherRapport(lignes, fichiers);

if (!confirme) {
  console.log("Mode simulation : rien n'a été supprimé. Relancez avec --confirmer pour exécuter la purge réelle.");
  process.exit(0);
}

await purgerReellement(lignes, fichiers);
