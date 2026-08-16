import {
  OFFRES_PROMOTION_AUTORISEES,
  normaliserCodePromotionnel,
  type DureePromotion,
  type OffrePromotion,
  type PromotionSaisie,
  type TypePromotion,
} from "@/lib/promotions-commerciales";

function chaine(formData: FormData, nom: string) {
  return String(formData.get(nom) ?? "").trim();
}

function nombreOptionnel(formData: FormData, nom: string) {
  const brut = chaine(formData, nom);
  return brut ? Number(brut) : null;
}

export function lirePromotionFormData(formData: FormData): PromotionSaisie {
  const offres = formData.getAll("offres").map(String).filter((offre): offre is OffrePromotion =>
    (OFFRES_PROMOTION_AUTORISEES as readonly string[]).includes(offre),
  );
  return {
    nomInterne: chaine(formData, "nom_interne"),
    type: chaine(formData, "type_remise") as TypePromotion,
    valeur: Number(chaine(formData, "valeur")),
    duree: chaine(formData, "duree") as DureePromotion,
    dureeMois: nombreOptionnel(formData, "duree_mois"),
    dateDebut: chaine(formData, "date_debut"),
    dateFin: chaine(formData, "date_fin") || null,
    offres,
    entrepriseId: chaine(formData, "entreprise_id") || null,
    justification: chaine(formData, "justification"),
    estPilote: formData.get("est_pilote") === "on",
    codePromotionnel: normaliserCodePromotionnel(chaine(formData, "code_promotionnel")),
    limiteUtilisations: nombreOptionnel(formData, "limite_utilisations"),
  };
}
