import { MOIS_FACTURES_EN_ANNUEL } from "@/lib/tarification";

export const TYPES_PROMOTION = ["pourcentage", "montant"] as const;
export type TypePromotion = (typeof TYPES_PROMOTION)[number];

export const DUREES_PROMOTION = ["once", "repeating", "forever"] as const;
export type DureePromotion = (typeof DUREES_PROMOTION)[number];

export const STATUTS_PROMOTION = ["brouillon", "actif", "expire", "desactive"] as const;
export type StatutPromotion = (typeof STATUTS_PROMOTION)[number];

export const OFFRES_PROMOTION_AUTORISEES = ["mini", "pro", "business", "entreprise"] as const;
export type OffrePromotion = (typeof OFFRES_PROMOTION_AUTORISEES)[number];

export const PERIMETRE_REMISE = "abonnement_et_supplements_recurrents" as const;

export type PromotionSaisie = {
  nomInterne: string;
  type: TypePromotion;
  valeur: number;
  duree: DureePromotion;
  dureeMois: number | null;
  dateDebut: string;
  dateFin: string | null;
  offres: OffrePromotion[];
  entrepriseId: string | null;
  justification: string;
  estPilote: boolean;
  codePromotionnel: string | null;
  limiteUtilisations: number | null;
};

export type ApercuPromotion = {
  tarifNormalHt: number;
  remiseHt: number;
  tarifResultantHt: number;
  nombreMoisFactures: number;
};

function arrondirEuros(valeur: number) {
  return Math.round((valeur + Number.EPSILON) * 100) / 100;
}

export function normaliserCodePromotionnel(code: string | null | undefined) {
  const normalise = String(code ?? "").trim().toUpperCase();
  return normalise || null;
}

export function validerPromotion(saisie: PromotionSaisie): string[] {
  const erreurs: string[] = [];
  if (saisie.nomInterne.trim().length < 3) erreurs.push("Le nom interne doit contenir au moins 3 caractères");
  if (!TYPES_PROMOTION.includes(saisie.type)) erreurs.push("Le type de remise est invalide");
  if (!Number.isFinite(saisie.valeur) || saisie.valeur <= 0) erreurs.push("La valeur doit être strictement positive");
  if (saisie.type === "pourcentage" && saisie.valeur > 100) erreurs.push("Le pourcentage ne peut pas dépasser 100 %");
  if (!DUREES_PROMOTION.includes(saisie.duree)) erreurs.push("La durée est invalide");
  if (saisie.duree === "repeating" && (!Number.isInteger(saisie.dureeMois) || Number(saisie.dureeMois) < 1 || Number(saisie.dureeMois) > 36)) {
    erreurs.push("Une remise temporaire doit durer entre 1 et 36 mois");
  }
  if (saisie.duree !== "repeating" && saisie.dureeMois !== null) erreurs.push("Le nombre de mois est réservé aux remises temporaires");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(saisie.dateDebut)) erreurs.push("La date de début est invalide");
  if (saisie.dateFin && (!/^\d{4}-\d{2}-\d{2}$/.test(saisie.dateFin) || saisie.dateFin < saisie.dateDebut)) {
    erreurs.push("La date de fin ne peut pas précéder la date de début");
  }
  if (!saisie.offres.length || saisie.offres.some((offre) => !OFFRES_PROMOTION_AUTORISEES.includes(offre))) {
    erreurs.push("Sélectionnez au moins une offre automatisée compatible");
  }
  if (saisie.justification.trim().length < 5) erreurs.push("La justification interne doit contenir au moins 5 caractères");
  const code = normaliserCodePromotionnel(saisie.codePromotionnel);
  if (code && !/^[A-Z0-9_-]{3,32}$/.test(code)) erreurs.push("Le code promotionnel doit contenir 3 à 32 lettres, chiffres, tirets ou underscores");
  if (saisie.limiteUtilisations !== null && (!Number.isInteger(saisie.limiteUtilisations) || saisie.limiteUtilisations < 1)) {
    erreurs.push("La limite d’utilisation doit être un entier positif");
  }
  return erreurs;
}

export function calculerApercuPromotion(params: {
  baseMensuelleHt: number;
  supplementsMensuelsHt?: number;
  periodicite: "mensuel" | "annuel";
  type: TypePromotion;
  valeur: number;
}): ApercuPromotion {
  const mois = params.periodicite === "annuel" ? MOIS_FACTURES_EN_ANNUEL : 1;
  const normal = arrondirEuros((Math.max(0, params.baseMensuelleHt) + Math.max(0, params.supplementsMensuelsHt ?? 0)) * mois);
  const remiseBrute = params.type === "pourcentage" ? normal * Math.min(100, Math.max(0, params.valeur)) / 100 : Math.max(0, params.valeur);
  const remise = arrondirEuros(Math.min(normal, remiseBrute));
  return { tarifNormalHt: normal, remiseHt: remise, tarifResultantHt: arrondirEuros(normal - remise), nombreMoisFactures: mois };
}

export function statutPromotionEffectif(statut: StatutPromotion, dateFin: string | null, maintenant = new Date()): StatutPromotion {
  if (statut === "actif" && dateFin && dateFin < maintenant.toISOString().slice(0, 10)) return "expire";
  return statut;
}
