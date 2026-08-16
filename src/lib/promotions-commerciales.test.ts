import { describe, expect, it } from "vitest";
import { calculerApercuPromotion, normaliserCodePromotionnel, statutPromotionEffectif, validerPromotion, type PromotionSaisie } from "./promotions-commerciales";

const valide: PromotionSaisie = {
  nomInterne: "Pilote Mini",
  type: "pourcentage",
  valeur: 10,
  duree: "forever",
  dureeMois: null,
  dateDebut: "2026-08-16",
  dateFin: null,
  offres: ["mini"],
  entrepriseId: null,
  justification: "Test pilote",
  estPilote: true,
  codePromotionnel: null,
  limiteUtilisations: null,
};

describe("PROMO-V1", () => {
  it("calcule Mini -10 % sans total négatif", () => {
    expect(calculerApercuPromotion({ baseMensuelleHt: 69, type: "pourcentage", valeur: 10, periodicite: "mensuel" })).toEqual({ tarifNormalHt: 69, remiseHt: 6.9, tarifResultantHt: 62.1, nombreMoisFactures: 1 });
  });

  it("plafonne une remise fixe au montant facturable", () => {
    expect(calculerApercuPromotion({ baseMensuelleHt: 69, type: "montant", valeur: 100, periodicite: "mensuel" }).tarifResultantHt).toBe(0);
  });

  it("applique l’annuel à dix mois puis la remise, sans recompter les mois offerts", () => {
    expect(calculerApercuPromotion({ baseMensuelleHt: 199, supplementsMensuelsHt: 14, type: "pourcentage", valeur: 10, periodicite: "annuel" })).toEqual({ tarifNormalHt: 2130, remiseHt: 213, tarifResultantHt: 1917, nombreMoisFactures: 10 });
  });

  it("refuse un pourcentage supérieur à 100", () => {
    expect(validerPromotion({ ...valide, valeur: 101 })).toContain("Le pourcentage ne peut pas dépasser 100 %");
  });

  it("refuse une fin antérieure au début", () => {
    expect(validerPromotion({ ...valide, dateFin: "2026-08-15" })).toContain("La date de fin ne peut pas précéder la date de début");
  });

  it("refuse Sur mesure dans le parcours automatisé", () => {
    expect(validerPromotion({ ...valide, offres: ["sur_mesure" as never] })).toContain("Sélectionnez au moins une offre automatisée compatible");
  });

  it("normalise un code lisible et détecte l’expiration", () => {
    expect(normaliserCodePromotionnel(" pilote-10 ")).toBe("PILOTE-10");
    expect(statutPromotionEffectif("actif", "2026-08-15", new Date("2026-08-16T10:00:00Z"))).toBe("expire");
  });
});
