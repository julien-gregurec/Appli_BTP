// Purge RGPD (art. 17) d'une entreprise après le délai de 30 jours (CGV art. 10).
//
// Opération manuelle, supervisée par la plateforme (jamais self-service, jamais
// automatique/cron) — conforme à PROMPT_CODEX_RGPD.md. Irréversible pour les tables
// DELETE ; réversible seulement par restauration de sauvegarde pour le reste.
//
// V2 (architecture, voir docs/qualification/ELSATIA_RGPD_PURGE_ARCHITECTURE_CLOSURE_V2.md) :
// remplace l'ordre alphabétique de v1 (F2) par l'ordre topologique réel renvoyé par
// rapport_purge_entreprise(), gère la catégorie ANONYMIZE en plus de DELETE/RETAIN (F3),
// et ajoute un mode verify + une reprise sûre par run_id (F1/F4 : l'audit de chaque appel
// survit désormais, y compris en cas d'échec, dans platform.purge_audit).
//
// Usage :
//   node scripts/purger-entreprise.mjs <entreprise_id> dry-run
//   node scripts/purger-entreprise.mjs <entreprise_id> execute [--run-id=<uuid>]
//   node scripts/purger-entreprise.mjs <entreprise_id> verify
//
// "execute" sans --run-id démarre un nouveau run et affiche son run_id : notez-le. En
// cas d'interruption (Ctrl+C, crash, panne), relancez EXACTEMENT la même commande avec
// --run-id=<uuid> pour reprendre — purger_table_entreprise et anonymiser_table_entreprise
// sont idempotents (une table déjà vide/déjà anonymisée renvoie ok=true, 0 ligne), donc
// la reprise ne refait aucun travail déjà fait et ne peut pas doubler une suppression.
//
// Nécessite NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans l'environnement.

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const [, , entrepriseId, mode, ...rest] = process.argv;
const runIdArg = rest.find((a) => a.startsWith("--run-id="))?.split("=")[1];

if (!entrepriseId || !["dry-run", "execute", "verify"].includes(mode)) {
  console.error("Usage: node scripts/purger-entreprise.mjs <entreprise_id> <dry-run|execute|verify> [--run-id=<uuid>]");
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
  const { data, error } = await supabase.rpc("verifier_storage_entreprise", { p_entreprise_id: entrepriseId });
  if (error) throw new Error(`Vérification Storage impossible : ${error.message}`);
  return data ?? [];
}

function afficherRapport(lignes) {
  const aSupprimer = lignes.filter((l) => l.categorie === "DELETE").sort((a, b) => a.ordre - b.ordre);
  const aAnonymiser = lignes.filter((l) => l.categorie === "ANONYMIZE");
  const conservees = lignes.filter((l) => l.categorie === "RETAIN");
  console.log(`\nEntreprise ${entrepriseId} — rapport de purge`);
  console.log(`\n${aSupprimer.length} table(s) seront purgées (DELETE), ordre topologique réel :`);
  for (const l of aSupprimer) console.log(`  [ordre ${l.ordre}] ${l.table_nom} (${l.nb_lignes} ligne(s))`);
  console.log(`\n${aAnonymiser.length} table(s) seront anonymisées (ligne conservée, PII vidée) :`);
  for (const l of aAnonymiser) console.log(`  - ${l.table_nom} (${l.nb_lignes} ligne(s))`);
  console.log(`\n${conservees.length} table(s) conservées (rétention légale) :`);
  for (const l of conservees) console.log(`  - ${l.table_nom} (${l.nb_lignes} ligne(s))`);
  console.log("\nLa ligne `entreprises` n'est jamais supprimée : elle est anonymisée (voir marquer_entreprise_purgee).\n");
}

function afficherStorage(fichiers) {
  const parCategorie = { ORPHELIN: [], RETAIN: [], A_PURGER: [] };
  for (const f of fichiers) (parCategorie[f.categorie] ??= []).push(f);
  console.log(`\nStorage — ${fichiers.length} fichier(s) réel(s) sous ce tenant :`);
  console.log(`  - ORPHELIN (référence base déjà supprimée, sûr à supprimer physiquement) : ${parCategorie.ORPHELIN.length}`);
  console.log(`  - RETAIN (référencé par une ligne conservée/anonymisée, ne JAMAIS supprimer) : ${parCategorie.RETAIN.length}`);
  console.log(`  - A_PURGER (référencé par une ligne DELETE pas encore purgée) : ${parCategorie.A_PURGER.length}`);
  return parCategorie;
}

async function purgerUneTable(tableNom, runId) {
  const { data, error } = await supabase.rpc("purger_table_entreprise", {
    p_entreprise_id: entrepriseId, p_table: tableNom, p_run_id: runId,
  });
  if (error) {
    // Ne devrait plus arriver (F1 : la fonction ne relance plus d'exception), sauf
    // panne réseau/connexion — dans ce cas l'audit du côté serveur peut être incomplet
    // pour CET appel précis, mais tous les appels précédents sont déjà consignés.
    return { ok: false, lignes_supprimees: null, erreur: `appel RPC échoué : ${error.message}` };
  }
  return data?.[0] ?? { ok: false, lignes_supprimees: null, erreur: "réponse RPC vide" };
}

async function anonymiserUneTable(tableNom, runId) {
  const { data, error } = await supabase.rpc("anonymiser_table_entreprise", {
    p_entreprise_id: entrepriseId, p_table: tableNom, p_run_id: runId,
  });
  if (error) return { ok: false, lignes_anonymisees: null, erreur: `appel RPC échoué : ${error.message}` };
  return data?.[0] ?? { ok: false, lignes_anonymisees: null, erreur: "réponse RPC vide" };
}

async function executer(runId) {
  console.log(`\n=== Purge réelle — run_id=${runId} ===`);
  console.log("En cas d'interruption, reprendre avec :");
  console.log(`  node scripts/purger-entreprise.mjs ${entrepriseId} execute --run-id=${runId}\n`);

  let lignes = await rapport();
  let aSupprimer = lignes.filter((l) => l.categorie === "DELETE").sort((a, b) => a.ordre - b.ordre);
  const echecs = new Map();

  // Passe principale, dans l'ordre topologique.
  for (const l of aSupprimer) {
    const res = await purgerUneTable(l.table_nom, runId);
    if (res.ok) {
      console.log(`OK  ${l.table_nom} (${res.lignes_supprimees} ligne(s))`);
      echecs.delete(l.table_nom);
    } else {
      console.error(`ÉCHEC ${l.table_nom} : ${res.erreur}`);
      echecs.set(l.table_nom, res.erreur);
    }
  }

  // Passes de rattrapage : une table peut échouer temporairement si une table qui la
  // restreint (RESTRICT) n'a pas encore été vidée dans cette même passe pour une raison
  // imprévue par l'ordre calculé (ex. FK ajoutée entre-temps). Robuste plutôt que fragile :
  // on retente jusqu'à convergence (plus aucun progrès) au lieu de s'arrêter net (F2 v1).
  let progresse = true;
  let passe = 1;
  while (echecs.size > 0 && progresse && passe <= 5) {
    progresse = false;
    passe += 1;
    for (const tableNom of [...echecs.keys()]) {
      const res = await purgerUneTable(tableNom, runId);
      if (res.ok) {
        console.log(`OK  ${tableNom} (${res.lignes_supprimees} ligne(s), rattrapage passe ${passe})`);
        echecs.delete(tableNom);
        progresse = true;
      }
    }
  }

  if (echecs.size > 0) {
    console.error(`\n${echecs.size} table(s) restent en échec après rattrapage :`);
    for (const [t, e] of echecs) console.error(`  - ${t} : ${e}`);
    const pasEchue = [...echecs.values()].every((e) => e.includes("aucune suppression programmee echue"));
    if (pasEchue) {
      console.error("\nCette entreprise n'a pas (ou plus) de suppression programmée échue — vérifiez `suppression_prevue_at` avant de relancer. Ce n'est pas un défaut d'architecture.");
    } else {
      console.error("\nCeci indique une contrainte structurelle non résolue par cette architecture (LEGAL_DECISION_REQUIRED probable).");
    }
    console.error(`Reprenez avec : node scripts/purger-entreprise.mjs ${entrepriseId} execute --run-id=${runId}`);
    process.exit(1);
  }

  // Anonymisation (F3).
  const aAnonymiser = lignes.filter((l) => l.categorie === "ANONYMIZE");
  for (const l of aAnonymiser) {
    const res = await anonymiserUneTable(l.table_nom, runId);
    if (res.ok) console.log(`OK  ${l.table_nom} anonymisée (${res.lignes_anonymisees} ligne(s))`);
    else {
      console.error(`ÉCHEC anonymisation ${l.table_nom} : ${res.erreur}`);
      console.error(`Reprenez avec : node scripts/purger-entreprise.mjs ${entrepriseId} execute --run-id=${runId}`);
      process.exit(1);
    }
  }

  // Balayage final : une suppression tardive (devis, chantiers…) peut recréer par
  // trigger une ligne dans une table DELETE déjà vidée (ex. entreprises_dashboard_cache).
  // marquer_entreprise_purgee refuserait alors le marquage : on relit le rapport
  // jusqu'à stabilité avant de passer au Storage.
  for (let balayage = 1; balayage <= 3; balayage += 1) {
    const restantes = (await rapport()).filter((l) => l.categorie === "DELETE");
    if (restantes.length === 0) break;
    for (const l of restantes) {
      const res = await purgerUneTable(l.table_nom, runId);
      if (res.ok) console.log(`OK  ${l.table_nom} (${res.lignes_supprimees} ligne(s), balayage final ${balayage})`);
      else console.error(`ÉCHEC ${l.table_nom} (balayage final ${balayage}) : ${res.erreur}`);
    }
  }

  // Storage (F7) : seuls les fichiers ORPHELINs (plus référencés par aucune ligne) sont
  // physiquement supprimés. Les RETAIN (ex. signatures_documents, notes_frais
  // conservées) ne sont jamais touchés.
  const fichiers = await fichiersStorage();
  const parCategorie = afficherStorage(fichiers);
  if (parCategorie.A_PURGER.length > 0) {
    console.error(`\n${parCategorie.A_PURGER.length} fichier(s) encore rattaché(s) à des lignes DELETE non purgées — relancez execute.`);
    process.exit(1);
  }
  const parBucket = parCategorie.ORPHELIN.reduce((acc, f) => {
    (acc[f.bucket_id] ??= []).push(f.chemin);
    return acc;
  }, {});
  for (const [bucket, chemins] of Object.entries(parBucket)) {
    const { error } = await supabase.storage.from(bucket).remove(chemins);
    if (error) {
      console.error(`ÉCHEC suppression Storage bucket ${bucket} : ${error.message}`);
      console.error(`Reprenez avec : node scripts/purger-entreprise.mjs ${entrepriseId} execute --run-id=${runId}`);
      process.exit(1);
    }
    console.log(`OK  storage:${bucket} (${chemins.length} fichier(s) orphelin(s) supprimé(s))`);
  }

  const { error: erreurMarquage } = await supabase.rpc("marquer_entreprise_purgee", {
    p_entreprise_id: entrepriseId, p_run_id: runId,
  });
  if (erreurMarquage) {
    console.error(`ÉCHEC marquage entreprise purgée : ${erreurMarquage.message}`);
    process.exit(1);
  }
  console.log("OK  entreprise anonymisée et marquée purgee_at");
  console.log(`\nPurge terminée (run_id=${runId}). Vérifiez avec :`);
  console.log(`  node scripts/purger-entreprise.mjs ${entrepriseId} verify\n`);
}

async function verifier() {
  console.log(`\n=== Vérification post-purge — entreprise ${entrepriseId} ===`);
  const lignes = await rapport();
  afficherRapport(lignes);
  const fichiers = await fichiersStorage();
  const parCategorie = afficherStorage(fichiers);

  const { data: audit, error: erreurAudit } = await supabase.rpc("lire_audit_purge_entreprise", { p_entreprise_id: entrepriseId });
  if (erreurAudit) console.error(`Lecture audit impossible : ${erreurAudit.message}`);
  else {
    const echecs = (audit ?? []).filter((a) => !a.ok);
    console.log(`Piste d'audit (platform.purge_audit) : ${audit?.length ?? 0} entrée(s), ${echecs.length} échec(s) consigné(s).`);
  }

  const resteDelete = lignes.filter((l) => l.categorie === "DELETE").length;
  const resteAPurger = parCategorie.A_PURGER.length;
  const orphelinsRestants = parCategorie.ORPHELIN.length;
  const complet = resteDelete === 0 && resteAPurger === 0;

  console.log(`\nVerdict : ${complet ? "PURGE COMPLÈTE" : "PURGE INCOMPLÈTE"}`);
  if (!complet) {
    console.log(`  - ${resteDelete} table(s) DELETE avec des lignes restantes`);
    console.log(`  - ${resteAPurger} fichier(s) Storage encore rattaché(s) à une table DELETE`);
  }
  if (orphelinsRestants > 0) {
    console.log(`  Note : ${orphelinsRestants} fichier(s) ORPHELIN(s) restent en Storage (non encore supprimés physiquement — relancez execute).`);
  }
  process.exit(complet ? 0 : 1);
}

if (mode === "dry-run") {
  const lignes = await rapport();
  afficherRapport(lignes);
  afficherStorage(await fichiersStorage());
  console.log("Mode dry-run : rien n'a été modifié. Relancez avec `execute` pour la purge réelle.");
} else if (mode === "verify") {
  await verifier();
} else {
  const runId = runIdArg ?? randomUUID();
  await executer(runId);
}
