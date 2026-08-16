import { describe, expect, it } from "vitest";
import { lirePromotionFormData } from "@/lib/promotions-form";

describe("actions PROMO-V1", () => {
  it("normalise les champs non sensibles d’un brouillon", () => {
    const formulaire = new FormData();
    formulaire.set("nom_interne", " Pilote Mini ");
    formulaire.set("type_remise", "pourcentage");
    formulaire.set("valeur", "10");
    formulaire.set("duree", "repeating");
    formulaire.set("duree_mois", "3");
    formulaire.set("date_debut", "2026-08-16");
    formulaire.set("date_fin", "2026-11-16");
    formulaire.append("offres", "mini");
    formulaire.append("offres", "sur_mesure");
    formulaire.set("justification", " Offre pilote ");
    formulaire.set("est_pilote", "on");
    formulaire.set("code_promotionnel", " pilote-10 ");
    formulaire.set("limite_utilisations", "5");
    expect(lirePromotionFormData(formulaire)).toMatchObject({
      nomInterne: "Pilote Mini",
      valeur: 10,
      dureeMois: 3,
      offres: ["mini"],
      estPilote: true,
      codePromotionnel: "PILOTE-10",
      limiteUtilisations: 5,
    });
  });
});
