// Aides RGPD pures (sans effet de bord), testables sans base de données.
// Utilisées par src/app/actions/rgpd.ts (anonymisation salarié) et par
// scripts/purger-entreprise.mjs (purge de compte après le délai de 30 jours).

/** Colonnes de chemins Storage sur `employes` que l'anonymisation doit purger réellement
 * (la RPC `anonymiser_employe` ne fait que vider ces colonnes en base ; sans cette purge,
 * les fichiers restent orphelins mais toujours présents et téléchargeables dans le bucket). */
export type CheminsStorageEmploye = {
  photo_storage_path?: string | null;
  signature_storage_path?: string | null;
  carte_btp_storage_path?: string | null;
};

export function cheminsStorageEmployeAAnonymiser(employe: CheminsStorageEmploye | null | undefined): string[] {
  if (!employe) return [];
  return [employe.photo_storage_path, employe.signature_storage_path, employe.carte_btp_storage_path].filter(
    (chemin): chemin is string => typeof chemin === "string" && chemin.length > 0
  );
}

/**
 * Tables portant `entreprise_id` dont les enregistrements doivent être CONSERVÉS
 * (jamais supprimés) lors de la purge d'un compte, le temps de la prescription légale
 * comptable (~10 ans) : factures (dont avoirs, type='avoir'), lignes, paiements, paie,
 * virements bancaires, et le journal d'activité (intégrité de la piste d'audit).
 *
 * Périmètre proposé par Codex — à faire CONFIRMER par Julien (voir le rapport de
 * qualification, section "LEGAL_DECISION_REQUIRED") avant toute purge réelle en production :
 * cette liste engage une décision de rétention légale, pas seulement technique.
 */
export const TABLES_CONSERVEES_PURGE = [
  "factures",
  "lignes_factures",
  "paiements",
  "coordonnees_bancaires",
  "bulletins_paie",
  "connexions_bancaires",
  "lots_virements",
  "ordres_virements",
  "journal_paiements_bancaires",
  "journal_activite",
] as const;

/** Tables portant `entreprise_id` éligibles à la purge effective (DELETE), à partir de
 * la liste réelle des tables du schéma (obtenue dynamiquement côté SQL, comme le fait déjà
 * `exporter_donnees_entreprise`) moins les tables conservées ci-dessus. */
export function tablesEligiblesPurge(toutesLesTablesAvecEntrepriseId: readonly string[]): string[] {
  const conservees = new Set<string>(TABLES_CONSERVEES_PURGE);
  return toutesLesTablesAvecEntrepriseId.filter((table) => !conservees.has(table)).sort();
}
