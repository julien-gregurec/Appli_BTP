// ELSATIA — Pack opérateur V9 (cutover Preview générique, train V9.2+) : constantes.
//
// Une seule source pour tout le pack `scripts/preview/v9/`. AUCUN nombre de migrations n'est
// codé ici : le pack CALCULE depuis le train local (supabase/migrations de HEAD) et le ledger
// exporté de la Preview :
//   CURRENT_LEDGER      = nombre (et dernière version) du ledger distant fourni ;
//   TARGET_LEDGER       = nombre (et dernière version) du train local ;
//   PENDING_MIGRATIONS  = migrations du train absentes du ledger, dans l'ordre.
// Seuls restent des INVARIANTS HISTORIQUES (versions identifiées, jamais des compteurs) : le
// plancher Preview (813 ORIGINALE), la base publiée V9.1, le prérequis des ponts de phase 0.

import { REF_PREVIEW_AUTORISEE, REF_PRODUCTION_CONNUE } from "../../lib/preview-guard.mjs";

export { REF_PREVIEW_AUTORISEE, REF_PRODUCTION_CONNUE };

/** Base publiée V9.1 : HEAD doit la contenir (ancêtre). Le SHA déployé est HEAD lui-même. */
export const SHA_BASE_V9_1 = "24a0c2e993ec0836b492ea72f27ed7dc347a20fa";
/** Dernière migration de la base publiée V9.1 (fixture et plan « depuis V9.1 »). */
export const VERSION_V9_1 = "20261002001302";

/** Branche du train porteur du pack. */
export const BRANCHE_TRAIN = "integration/elsatia-canonical-train-v9.2";
/** Branches depuis lesquelles le pack peut être exécuté (le pack vit DANS le train). */
export const BRANCHES_PACK_AUTORISEES = Object.freeze([BRANCHE_TRAIN, "claude/focused-ptolemy-kwdju8"]);
/** Toute branche de train canonique `integration/elsatia-canonical-train-v<N>[.<M>]`. */
export const MOTIF_BRANCHE_TRAIN = /^integration\/elsatia-canonical-train-v\d+(?:\.\d+)?$/;
/** Branches refusées par principe : un cutover Preview ne part jamais de ces lignées. */
export const BRANCHES_INTERDITES = Object.freeze([/^main$/, /^master$/, /^production$/i, /^release\//i]);

/** Code V8 servi par la Preview avant le premier cutover V9 (cible historique du retour arrière code). */
export const SHA_V8_PREVIEW = "de50245a259e06623fbab070f9dc296573bae0ce";
export const BRANCHE_V8_PREVIEW = "integration/elsatia-canonical-train-v8-hotfix-813-original";

/**
 * Plancher historique de la Preview (socle V8) : la migration 813 ORIGINALE. Tout ledger
 * Preview doit la contenir ; le rang est calculé depuis le train, jamais codé.
 */
export const VERSION_SOCLE = "20261002000813";
export const NOM_SOCLE = "plateforme_annuaire_lecture_pure";

/**
 * Ponts d'upgrade PRODUCTION (phase 0) : migrations dont le fichier porte la ligne marqueur.
 * Sur une base qui a déjà 20260921000300 au ledger (toute Preview), elles sont des no-op
 * appliqués dans l'ordre lexical normal. Sans 300 : historique de type Production, refus.
 */
export const MARQUEUR_PHASE0 = "-- elsatia:upgrade-phase0";
export const VERSION_PREREQUIS_PHASE0 = "20260921000300";
export const OUTIL_PHASE0_PRODUCTION = "scripts/upgrade/preflight.mjs --phase 0";

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
  PACK_READY: "PREVIEW_V9_OPERATOR_PACK_READY",
  PACK_PARTIAL: "PREVIEW_V9_OPERATOR_PACK_PARTIAL",
  PACK_BLOCKED: "PREVIEW_V9_OPERATOR_PACK_BLOCKED",
  IBAN_OK: "IBAN_K1_READY",
  IBAN_KO: "IBAN_K1_MISSING",
  IBAN_BLOQUANT: "BLOCKER_IBAN_KEY",
});
