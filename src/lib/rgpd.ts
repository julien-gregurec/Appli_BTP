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
 * Miroir TypeScript de `public.tables_conservees_purge()` (supabase/migrations/
 * 20260923000331_purge_entreprise_architecture_v2.sql) — à garder synchronisé. La SQL
 * est la source de vérité effectivement utilisée par la purge ; cette liste ne sert
 * qu'à l'UI/aux tests côté client.
 *
 * Tables dont les enregistrements doivent être CONSERVÉS (jamais supprimés) lors de la
 * purge d'un compte : facturation (factures, dont avoirs type='avoir'), bancaire/
 * virements, paie (module complet, y compris son journal d'audit et ses pièces
 * jointes — supprimer une partie viderait de son contenu un dossier de paie qu'on a
 * par ailleurs décidé de conserver), notes de frais/archivage (verrouillées
 * structurellement par une FK RESTRICT depuis ordres_virements dès qu'une note a été
 * remboursée par virement), documents contractuels/preuve (signatures_documents,
 * immuable par trigger), écritures/audit (journal_activite).
 *
 * Périmètre proposé par l'IA — à faire CONFIRMER par Julien (voir docs/qualification/
 * ELSATIA_RGPD_PURGE_ARCHITECTURE_CLOSURE_V2.md, section décisions juridiques
 * restantes) avant toute purge réelle en production : cette liste engage une décision
 * de rétention légale, pas seulement technique.
 */
export const TABLES_CONSERVEES_PURGE = [
  "factures",
  "lignes_factures",
  "paiements",
  "remises_banque_paiements",
  "coordonnees_bancaires",
  "connexions_bancaires",
  "lots_virements",
  "ordres_virements",
  "journal_paiements_bancaires",
  "bulletins_paie",
  "periodes_paie",
  "dossiers_paie_salaries",
  "validations_paie",
  "absences_paie",
  "indemnites_deplacement_paie",
  "pieces_jointes_paie",
  "journal_audit_paie",
  "grands_deplacements",
  "facturation_comptes_mensuelle",
  "notes_frais",
  "depenses_fournisseurs",
  "categories_notes_frais",
  "documents_notes_frais",
  "versions_documents_notes_frais",
  "exports_notes_frais",
  "elements_export_notes_frais",
  "signatures_documents",
  "journal_activite",
] as const;

/**
 * Miroir TypeScript de `public.tables_anonymisees_purge()` (même migration) : tables où
 * la ligne reste (jamais supprimée) mais dont le contenu personnel est vidé, parce
 * qu'une FK RESTRICT/NO ACTION depuis une table conservée empêche structurellement la
 * suppression de la ligne (ex. bulletins_paie.employe_id → employes, ordres_virements.
 * fournisseur_id → fournisseurs, factures.client_id → clients).
 */
export const TABLES_ANONYMISEES_PURGE = ["employes", "clients", "fournisseurs"] as const;

/** Tables portant `entreprise_id` éligibles à la purge effective (DELETE), à partir de
 * la liste réelle des tables du schéma (obtenue dynamiquement côté SQL, comme le fait déjà
 * `exporter_donnees_entreprise`) moins les tables conservées et anonymisées ci-dessus.
 * L'ordre alphabétique ici est informatif uniquement (dead-simple liste pour l'UI/les
 * tests) ; l'ordre RÉEL de purge (topologique, F2) est calculé côté SQL par
 * `rapport_purge_entreprise()`, jamais reproduit côté client. */
export function tablesEligiblesPurge(toutesLesTablesAvecEntrepriseId: readonly string[]): string[] {
  const conservees = new Set<string>(TABLES_CONSERVEES_PURGE);
  const anonymisees = new Set<string>(TABLES_ANONYMISEES_PURGE);
  return toutesLesTablesAvecEntrepriseId.filter((table) => !conservees.has(table) && !anonymisees.has(table)).sort();
}
