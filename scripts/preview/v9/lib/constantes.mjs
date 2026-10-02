// ELSATIA — Pack opérateur V9 (cutover Preview 372 → 389) : constantes canoniques.
//
// Une seule source pour tout le pack `scripts/preview/v9/`. Les nombres du train sont
// RE-VÉRIFIÉS contre supabase/migrations par le préflight (`preview:v9:preflight`) : une
// constante qui dériverait des fichiers bloque le pack au lieu de mentir.
// Rapport de train : docs/qualification/ELSATIA_CANONICAL_TRAIN_V9_FINAL_CONVERGENCE_V1.md.

import { REF_PREVIEW_AUTORISEE, REF_PRODUCTION_CONNUE } from "../../lib/preview-guard.mjs";

export { REF_PREVIEW_AUTORISEE, REF_PRODUCTION_CONNUE };

/** Train canonique V9 FINAL : commit et branche publiés (code ET migrations à déployer). */
export const SHA_CANONIQUE = "6392131aa02cecc9991358915963068de8292d24";
export const BRANCHE_CANONIQUE = "integration/elsatia-canonical-train-v9-final";

/** Code servi aujourd'hui par la Preview (V8 + 813 original) : cible du retour arrière code. */
export const SHA_V8_PREVIEW = "de50245a259e06623fbab070f9dc296573bae0ce";
export const BRANCHE_V8_PREVIEW = "integration/elsatia-canonical-train-v8-hotfix-813-original";

/** Branches depuis lesquelles le pack peut être exécuté (le pack + le train qu'il porte). */
export const BRANCHES_PACK_AUTORISEES = Object.freeze([BRANCHE_CANONIQUE, "claude/zen-clarke-qchnnt"]);
/** Branches refusées par principe : un cutover Preview ne part jamais de ces lignées. */
export const BRANCHES_INTERDITES = Object.freeze([/^main$/, /^master$/, /^production$/i, /^release\//i]);

/** Ledger Preview attendu AVANT cutover. */
export const NB_SOCLE = 372;
export const VERSION_SOCLE = "20261002000813";
export const NOM_SOCLE = "plateforme_annuaire_lecture_pure";

/** Ledger attendu APRÈS cutover. */
export const NB_FINAL = 389;
export const DERNIERE_FINALE = "20261002001113";
export const NB_A_APPLIQUER = NB_FINAL - NB_SOCLE; // 17

/** 813 : l'originale (de50245a) est au ledger Preview ; la reconstruction 23153716 est FAUSSE. */
export const SHA256_813_ORIGINAL = "c95e3ef33c4c63c182136159343f08c4bc89ce6245b52bb9662f5ea7f6961d9b";
export const SHA256_813_NON_ORIGINAL = "194d1d33a2e7ab17a21d9145ce317c0bf64dab20db7c220cd81c37f344b8c2a8";
export const COMMIT_813_NON_ORIGINAL = "231537165c3c013db47da034f0f66e85a4fed9c0";
/**
 * Marqueurs de CORPS de fonction (présents dans pg_proc.prosrc et dans
 * supabase_migrations.schema_migrations.statements) :
 *  - l'originale renvoie la colonne `abonnement_statut_effectif` ;
 *  - la reconstruction 23153716 porte le commentaire interne « HOTFIX 813 » et pas ce nom.
 */
export const MARQUEUR_813_ORIGINAL = "abonnement_statut_effectif";
export const MARQUEUR_813_NON_ORIGINAL = "HOTFIX 813";

/** Migration du limiteur de connexion : DOIT précéder le code V9 (fail-closed du login). */
export const VERSION_LIMITEUR = "20261002001113";
/** Migration du registre des clés bancaires (k1). */
export const VERSION_REGISTRE_IBAN = "20261002001112";

/** Pilote de recette (identifiant seulement : aucun mot de passe n'est jamais demandé ni stocké). */
export const PILOTE = "pilote.karim.haddad@example.test";

/** Projet Vercel GP Preview (runbook d'exécution V3, STEP 8). */
export const PROJET_VERCEL_GP = "elsatia-preview";

/** Hôtes applicatifs de Production connus : jamais une cible du pack. */
export const HOTES_PRODUCTION = Object.freeze(["app.elsatia.fr", "tools.elsatia.fr", "colors.elsatia.fr", "reserves.elsatia.fr", "elsatia.fr", "www.elsatia.fr"]);

/** Verdicts du pack (chaînes stables, testées). */
export const VERDICT = Object.freeze({
  CIBLE_OK: "TARGET_PREVIEW_CONFIRMED",
  CIBLE_KO: "TARGET_REJECTED",
  LEDGER_PREFIXE_OK: "PREVIEW_LEDGER_PREFIX_OK",
  LEDGER_DIVERGENCE: "PREVIEW_LEDGER_DIVERGENCE",
  LEDGER_DEJA_V9: "PREVIEW_LEDGER_ALREADY_V9",
  LEDGER_V9_COMPLET: "PREVIEW_LEDGER_V9_COMPLETE",
  LEDGER_V9_PARTIEL: "PREVIEW_LEDGER_PARTIAL_V9",
  PACK_READY: "PREVIEW_V9_OPERATOR_PACK_READY",
  PACK_PARTIAL: "PREVIEW_V9_OPERATOR_PACK_PARTIAL",
  PACK_BLOCKED: "PREVIEW_V9_OPERATOR_PACK_BLOCKED",
  IBAN_OK: "IBAN_K1_READY",
  IBAN_KO: "IBAN_K1_MISSING",
  IBAN_BLOQUANT: "BLOCKER_IBAN_KEY",
});
