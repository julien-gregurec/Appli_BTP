/**
 * Réglages de devis par entreprise (GP V1, Paramètres > Devis) — miroir applicatif de la migration
 * 20260913000295 : valeurs par défaut des nouveaux devis et rappel de sauvegarde.
 */
export type ParametresDevis = {
  validiteJours: number;
  conditionsDefaut: string | null;
  modeReglementDefaut: string | null;
  conditionsPaiementDefaut: string | null;
  uniteDefaut: string;
  tauxTvaDefaut: number;
  rappelSauvegardeActif: boolean;
  rappelSauvegardeMinutes: number;
};

/** Valeurs historiques (comportement sans réglage). */
export const PARAMETRES_DEVIS_DEFAUT: ParametresDevis = {
  validiteJours: 30,
  conditionsDefaut: null,
  modeReglementDefaut: null,
  conditionsPaiementDefaut: null,
  uniteDefaut: "u",
  tauxTvaDefaut: 20,
  rappelSauvegardeActif: true,
  rappelSauvegardeMinutes: 10,
};

/** Fréquences proposées pour le rappel (minutes) ; « personnalisé » = toute valeur de 1 à 240. */
export const FREQUENCES_RAPPEL = [2, 5, 10, 15, 30] as const;
export const RAPPEL_MINUTES_MIN = 1;
export const RAPPEL_MINUTES_MAX = 240;

export function lireParametresDevis(ligne: Partial<Record<string, unknown>> | null | undefined): ParametresDevis {
  const d = PARAMETRES_DEVIS_DEFAUT;
  if (!ligne) return d;
  const entier = (v: unknown, defaut: number, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.trunc(v) : defaut);
  const texte = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const tva = typeof ligne.taux_tva_defaut === "number" ? ligne.taux_tva_defaut : typeof ligne.taux_tva_defaut === "string" ? Number(ligne.taux_tva_defaut) : NaN;
  return {
    validiteJours: entier(ligne.validite_jours, d.validiteJours, 1, 365),
    conditionsDefaut: texte(ligne.conditions_defaut),
    modeReglementDefaut: texte(ligne.mode_reglement_defaut),
    conditionsPaiementDefaut: texte(ligne.conditions_paiement_defaut),
    uniteDefaut: typeof ligne.unite_defaut === "string" && ligne.unite_defaut.trim() ? ligne.unite_defaut.trim() : d.uniteDefaut,
    tauxTvaDefaut: Number.isFinite(tva) && tva >= 0 && tva <= 100 ? tva : d.tauxTvaDefaut,
    rappelSauvegardeActif: typeof ligne.rappel_sauvegarde_actif === "boolean" ? ligne.rappel_sauvegarde_actif : d.rappelSauvegardeActif,
    rappelSauvegardeMinutes: entier(ligne.rappel_sauvegarde_minutes, d.rappelSauvegardeMinutes, RAPPEL_MINUTES_MIN, RAPPEL_MINUTES_MAX),
  };
}

/** Motif de refus ou `null` (mêmes bornes que la base). */
export function validerParametresDevis(p: ParametresDevis): string | null {
  if (!Number.isInteger(p.validiteJours) || p.validiteJours < 1 || p.validiteJours > 365) return "La validité par défaut est un nombre de jours entre 1 et 365.";
  if (!p.uniteDefaut.trim() || p.uniteDefaut.trim().length > 20) return "Indiquez une unité par défaut (20 caractères maximum).";
  if (!Number.isFinite(p.tauxTvaDefaut) || p.tauxTvaDefaut < 0 || p.tauxTvaDefaut > 100) return "Le taux de TVA par défaut est compris entre 0 et 100 %.";
  if (!Number.isInteger(p.rappelSauvegardeMinutes) || p.rappelSauvegardeMinutes < RAPPEL_MINUTES_MIN || p.rappelSauvegardeMinutes > RAPPEL_MINUTES_MAX) return `La fréquence du rappel est comprise entre ${RAPPEL_MINUTES_MIN} et ${RAPPEL_MINUTES_MAX} minutes.`;
  if ((p.conditionsDefaut ?? "").length > 4000) return "Les conditions par défaut sont limitées à 4 000 caractères.";
  if ((p.modeReglementDefaut ?? "").length > 60) return "Le mode de règlement est limité à 60 caractères.";
  if ((p.conditionsPaiementDefaut ?? "").length > 500) return "Les conditions de paiement sont limitées à 500 caractères.";
  return null;
}

/** Date de validité par défaut (AAAA-MM-JJ) : émission + validité. */
export function dateValiditeParDefaut(emission: string, validiteJours: number): string {
  const d = new Date(`${emission}T12:00:00`);
  d.setDate(d.getDate() + validiteJours);
  return d.toISOString().slice(0, 10);
}
