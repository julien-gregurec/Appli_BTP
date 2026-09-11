import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COEFFICIENT_MAX,
  coefficientDepuisPrix,
  indicateursArticle,
  lireCoefficient,
  lireModePrix,
  prixVenteDepuisCoefficient,
  prixVenteRetenu,
} from "./prix-article";

describe("prixVenteDepuisCoefficient", () => {
  it("prix d'achat × coefficient, au centime", () => {
    expect(prixVenteDepuisCoefficient(12.5, 1.6)).toBe(20);
    expect(prixVenteDepuisCoefficient(0.1, 3)).toBe(0.3);
  });

  it("arrondit comme round() PostgreSQL (demi loin de zéro), jamais en flottant", () => {
    expect(prixVenteDepuisCoefficient(3.335, 1)).toBe(3.34);
    expect(prixVenteDepuisCoefficient(10.005, 1)).toBe(10.01);
    expect(prixVenteDepuisCoefficient(7.77, 1.35)).toBe(10.49);
  });
});

describe("coefficientDepuisPrix", () => {
  it("rend le coefficient à 4 décimales", () => {
    expect(coefficientDepuisPrix(20, 12.5)).toBe(1.6);
    expect(coefficientDepuisPrix(10, 3)).toBe(3.3333);
  });

  it("n'invente rien quand l'achat est nul", () => {
    expect(coefficientDepuisPrix(5, 0)).toBeNull();
  });
});

describe("indicateursArticle", () => {
  it("marge, taux de marge, taux de marque et coefficient", () => {
    expect(indicateursArticle(20, 12.5)).toEqual({
      margeHt: 7.5, tauxMargePct: 60, tauxMarquePct: 37.5, coefficient: 1.6, sousLeCout: false,
    });
  });

  it("signale une vente sous le coût", () => {
    expect(indicateursArticle(10, 12)).toMatchObject({ margeHt: -2, sousLeCout: true });
  });

  it("sans prix d'achat visible, aucun indicateur n'est reconstitué", () => {
    expect(indicateursArticle(20, null)).toEqual({
      margeHt: null, tauxMargePct: null, tauxMarquePct: null, coefficient: null, sousLeCout: false,
    });
  });

  it("aucune division par zéro", () => {
    expect(indicateursArticle(0, 0)).toMatchObject({ margeHt: 0, tauxMargePct: null, tauxMarquePct: null, coefficient: null });
  });
});

describe("lireCoefficient", () => {
  it("accepte la virgule et rend l'absence explicite", () => {
    expect(lireCoefficient("1,6")).toEqual({ valeur: 1.6 });
    expect(lireCoefficient(" ")).toEqual({ valeur: null });
    expect(lireCoefficient(null)).toEqual({ valeur: null });
  });

  it("refuse zéro, le texte et le dépassement, comme la contrainte SQL", () => {
    expect(lireCoefficient("0")).toHaveProperty("erreur");
    expect(lireCoefficient("abc")).toHaveProperty("erreur");
    expect(lireCoefficient("-1")).toHaveProperty("erreur");
    expect(lireCoefficient(String(COEFFICIENT_MAX + 1))).toHaveProperty("erreur");
    expect(lireCoefficient(String(COEFFICIENT_MAX))).toEqual({ valeur: COEFFICIENT_MAX });
  });

  it("bornes identiques à la contrainte proposée", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase/proposed/gp-v1-metier-bibliotheque.sql.proposed"), "utf8");
    expect(sql).toContain(`coefficient > 0 and coefficient <= ${COEFFICIENT_MAX}`);
  });
});

describe("lireModePrix", () => {
  it("« calculé » seulement sur demande explicite", () => {
    expect(lireModePrix("calcule")).toBe("calcule");
    expect(lireModePrix("saisi")).toBe("saisi");
    expect(lireModePrix("n'importe quoi")).toBe("saisi");
    expect(lireModePrix(undefined)).toBe("saisi");
  });
});

describe("prixVenteRetenu", () => {
  it("mode saisi : le prix du formulaire fait foi", () => {
    expect(prixVenteRetenu("saisi", 19.9, 12.5, 1.6)).toEqual({ valeur: 19.9 });
  });

  it("mode calculé : le prix est recalculé, le champ du formulaire est ignoré", () => {
    expect(prixVenteRetenu("calcule", 999, 12.5, 1.6)).toEqual({ valeur: 20 });
  });

  it("mode calculé sans achat ou sans coefficient : refus explicite", () => {
    expect(prixVenteRetenu("calcule", 20, null, 1.6)).toHaveProperty("erreur");
    expect(prixVenteRetenu("calcule", 20, 12.5, null)).toHaveProperty("erreur");
  });
});
