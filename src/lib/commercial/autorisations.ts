import type { PeriodiciteAbonnement } from "@/lib/commercial/catalogue";
import { validerRemise } from "@/lib/commercial/remises";
import type { ErreurRemise } from "@/lib/commercial/remises";
import type { Remise } from "@/lib/commercial/types";

/**
 * Politique d'autorisation d'une remise commerciale (§13).
 *
 * Fonctions PURES : elles décident, elles n'appliquent rien. Le contrôle réel
 * reste côté base (`est_plateforme_admin()`, `plateforme_autoriser_effet_externe`,
 * AAL2) — ceci sert à décider ce que l'interface exige AVANT d'appeler l'action,
 * et à produire le même verdict dans les tests.
 */

/** Au-delà de ce seuil, une remise est « importante » et exige une seconde confirmation. */
export const SEUIL_REMISE_IMPORTANTE_POURCENT = 30;
export const SEUIL_REMISE_IMPORTANTE_CENTIMES = 10_000;

export type ContexteAutorisationRemise = {
  estPlateformeAdmin: boolean;
  /** Niveau d'assurance de la session Supabase. */
  aal: "aal1" | "aal2" | null;
  /** Nombre d'administrateurs plateforme existants (exploitation solo = 1). */
  nombreAdminsPlateforme: number;
  /** L'administrateur a explicitement coché la seconde confirmation. */
  secondeConfirmation?: boolean;
  /** Un second administrateur a validé (seulement possible s'ils sont ≥ 2). */
  validationSecondAdministrateur?: boolean;
  periodicite: PeriodiciteAbonnement;
  ambiguiteAnnuelleConfirmee?: boolean;
  /** Sous-total public du périmètre, pour juger de l'ampleur d'un montant fixe. */
  baseCentimes?: number;
};

export type ExigencesRemise = {
  motifObligatoire: true;
  mfaRequis: true;
  apercuAvantApres: true;
  journalisationImmuable: true;
  secondeConfirmationRequise: boolean;
  avertissementRenforce: boolean;
  /** Vrai seulement si au moins deux administrateurs plateforme existent. */
  validationSecondAdministrateurRequise: boolean;
  raisons: readonly string[];
};

export type VerdictRemise = {
  autorise: boolean;
  exigences: ExigencesRemise;
  erreurs: readonly ErreurRemise[];
  blocages: readonly string[];
};

/** Une remise est « importante » par son ampleur, ou « lourde » par sa durée. */
export function estRemiseImportante(remise: Remise, baseCentimes?: number): boolean {
  if (remise.type === "pourcentage") return remise.valeur >= SEUIL_REMISE_IMPORTANTE_POURCENT;
  if (remise.type === "montant") {
    if (typeof baseCentimes === "number" && baseCentimes > 0) {
      return remise.valeur * 100 >= baseCentimes * SEUIL_REMISE_IMPORTANTE_POURCENT;
    }
    return remise.valeur >= SEUIL_REMISE_IMPORTANTE_CENTIMES;
  }
  // Prix négocié : important dès qu'il abaisse la base d'au moins le seuil.
  if (typeof baseCentimes === "number" && baseCentimes > 0) {
    return (baseCentimes - remise.valeur) * 100 >= baseCentimes * SEUIL_REMISE_IMPORTANTE_POURCENT;
  }
  return true;
}

export function estRemiseSansFin(remise: Remise): boolean {
  return remise.duree.mode === "permanente" || remise.duree.mode === "jusqu_a_revocation";
}

export function evaluerRemise(remise: Remise, contexte: ContexteAutorisationRemise): VerdictRemise {
  const raisons: string[] = [];
  const importante = estRemiseImportante(remise, contexte.baseCentimes);
  const sansFin = estRemiseSansFin(remise);
  const prixNegocie = remise.type === "prix_negocie";

  if (importante) raisons.push(`Remise importante (seuil ${SEUIL_REMISE_IMPORTANTE_POURCENT} %).`);
  if (remise.duree.mode === "permanente") raisons.push("Remise permanente : aucun retour au tarif normal n'est programmé.");
  if (remise.duree.mode === "jusqu_a_revocation") raisons.push("Remise sans terme : elle court jusqu'à révocation explicite.");
  if (prixNegocie) raisons.push("Prix négocié : le montant reste figé même si le tarif public évolue.");
  if (remise.cumulAutorise) raisons.push("Cumul explicitement autorisé : plusieurs avantages pourront se superposer.");

  const secondeConfirmationRequise = importante || sansFin || prixNegocie || Boolean(remise.cumulAutorise);

  // Exploitation solo : on n'exige JAMAIS un second administrateur qui n'existe
  // pas. La double confirmation, le motif, la MFA et l'historique restent, eux,
  // toujours exigés — c'est ce qui remplace le quatre-yeux.
  const validationSecondAdministrateurRequise =
    contexte.nombreAdminsPlateforme >= 2 && (sansFin || prixNegocie);

  const exigences: ExigencesRemise = {
    motifObligatoire: true,
    mfaRequis: true,
    apercuAvantApres: true,
    journalisationImmuable: true,
    secondeConfirmationRequise,
    avertissementRenforce: importante || sansFin || prixNegocie,
    validationSecondAdministrateurRequise,
    raisons,
  };

  const blocages: string[] = [];
  if (!contexte.estPlateformeAdmin) blocages.push("Rôle plateforme requis.");
  if (contexte.aal !== "aal2") blocages.push("Authentification à deux facteurs (AAL2) requise.");
  if (secondeConfirmationRequise && !contexte.secondeConfirmation) {
    blocages.push("Seconde confirmation explicite requise pour cette remise.");
  }
  if (validationSecondAdministrateurRequise && !contexte.validationSecondAdministrateur) {
    blocages.push("Validation d'un second administrateur plateforme requise.");
  }

  const erreurs = validerRemise(remise, contexte.periodicite, {
    ambiguiteAnnuelleConfirmee: contexte.ambiguiteAnnuelleConfirmee,
  });

  return {
    autorise: blocages.length === 0 && erreurs.length === 0,
    exigences,
    erreurs,
    blocages,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Journal (§14)
// ─────────────────────────────────────────────────────────────────────────────

export type EntreeJournalRemise = {
  action: "creation" | "activation" | "expiration" | "revocation" | "remplacement" | "annulation";
  entrepriseId: string;
  abonnementId: string | null;
  forfait: string;
  modules: readonly string[];
  tarifPublicCentimes: number;
  ancienPrixCentimes: number;
  nouveauPrixCentimes: number;
  typeRemise: string;
  valeurRemise: number;
  perimetre: string;
  dureeMode: string;
  dateDebut: string;
  dateFin: string | null;
  auteurId: string | null;
  motif: string;
  impactEstimeCentimes: number;
  /** Identifiant Stripe masqué : jamais l'identifiant complet dans un journal lisible. */
  referenceStripeMasquee: string | null;
  facturesConcernees: readonly string[];
  creeLe: string;
};

/** Masque un identifiant Stripe : `sub_1A2B3C4D5E` → `sub_…4D5E`. */
export function masquerIdentifiantStripe(identifiant: string | null | undefined): string | null {
  if (!identifiant) return null;
  const separateur = identifiant.indexOf("_");
  const prefixe = separateur > 0 ? identifiant.slice(0, separateur) : "";
  const fin = identifiant.slice(-4);
  return prefixe ? `${prefixe}_…${fin}` : `…${fin}`;
}

export function construireEntreeJournal(params: {
  action: EntreeJournalRemise["action"];
  entrepriseId: string;
  abonnementId?: string | null;
  forfait: string;
  modules?: readonly string[];
  tarifPublicCentimes: number;
  ancienPrixCentimes: number;
  nouveauPrixCentimes: number;
  remise: Remise;
  dateFin: string | null;
  auteurId?: string | null;
  identifiantStripe?: string | null;
  facturesConcernees?: readonly string[];
  creeLe: string;
}): EntreeJournalRemise {
  return {
    action: params.action,
    entrepriseId: params.entrepriseId,
    abonnementId: params.abonnementId ?? null,
    forfait: params.forfait,
    modules: params.modules ?? [],
    tarifPublicCentimes: params.tarifPublicCentimes,
    ancienPrixCentimes: params.ancienPrixCentimes,
    nouveauPrixCentimes: params.nouveauPrixCentimes,
    typeRemise: params.remise.type,
    valeurRemise: params.remise.valeur,
    perimetre: params.remise.perimetre.cles?.length
      ? `${params.remise.perimetre.cible}:${params.remise.perimetre.cles.join(",")}`
      : params.remise.perimetre.cible,
    dureeMode: params.remise.duree.mode,
    dateDebut: params.remise.duree.debut,
    dateFin: params.dateFin,
    auteurId: params.auteurId ?? null,
    motif: params.remise.motif,
    impactEstimeCentimes: params.ancienPrixCentimes - params.nouveauPrixCentimes,
    referenceStripeMasquee: masquerIdentifiantStripe(params.identifiantStripe),
    facturesConcernees: params.facturesConcernees ?? [],
    creeLe: params.creeLe,
  };
}
