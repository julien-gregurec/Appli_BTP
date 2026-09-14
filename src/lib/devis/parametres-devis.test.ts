import { describe, expect, it } from "vitest";
import { dateValiditeParDefaut, lireParametresDevis, PARAMETRES_DEVIS_DEFAUT, validerParametresDevis } from "./parametres-devis";

describe("réglages de devis", () => {
  it("lecture indulgente et défauts historiques", () => {
    expect(lireParametresDevis(null)).toEqual(PARAMETRES_DEVIS_DEFAUT);
    expect(lireParametresDevis({ validite_jours: 45, unite_defaut: "m²", taux_tva_defaut: "10", rappel_sauvegarde_minutes: 5, rappel_sauvegarde_actif: false, conditions_defaut: " " }))
      .toMatchObject({ validiteJours: 45, uniteDefaut: "m²", tauxTvaDefaut: 10, rappelSauvegardeMinutes: 5, rappelSauvegardeActif: false, conditionsDefaut: null });
    expect(lireParametresDevis({ validite_jours: 999, rappel_sauvegarde_minutes: 0 })).toMatchObject({ validiteJours: 30, rappelSauvegardeMinutes: 10 });
  });
  it("validation = bornes de la base", () => {
    expect(validerParametresDevis(PARAMETRES_DEVIS_DEFAUT)).toBeNull();
    expect(validerParametresDevis({ ...PARAMETRES_DEVIS_DEFAUT, validiteJours: 0 })).toMatch(/365/);
    expect(validerParametresDevis({ ...PARAMETRES_DEVIS_DEFAUT, rappelSauvegardeMinutes: 241 })).toMatch(/240/);
    expect(validerParametresDevis({ ...PARAMETRES_DEVIS_DEFAUT, tauxTvaDefaut: 101 })).toMatch(/TVA/);
    expect(validerParametresDevis({ ...PARAMETRES_DEVIS_DEFAUT, uniteDefaut: " " })).toMatch(/unité/);
  });
  it("date de validité = émission + N jours", () => {
    expect(dateValiditeParDefaut("2026-09-13", 30)).toBe("2026-10-13");
    expect(dateValiditeParDefaut("2026-12-20", 15)).toBe("2027-01-04");
  });
});
