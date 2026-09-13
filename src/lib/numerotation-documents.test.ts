import { describe, expect, it } from "vitest";
import { formatParDefaut, formaterNumero, lireFormat, validerFormatNumerotation } from "./numerotation-documents";

describe("numérotation des documents — miroir des règles de la base", () => {
  const date = new Date(2026, 8, 13);
  it("format historique par défaut", () => {
    expect(formaterNumero(formatParDefaut("devis"), 1, date)).toBe("DEV-2026-001");
    expect(formaterNumero(formatParDefaut("facture"), 12, date)).toBe("FAC-2026-012");
    expect(formaterNumero(formatParDefaut("avoir"), 3, date)).toBe("FAC-2026-003");
    expect(formatParDefaut("commande")).toMatchObject({ prefixe: "CMD", compteurAnnuel: true });
  });
  it("préfixe facultatif, année et mois facultatifs, séparateur, largeur", () => {
    expect(formaterNumero({ prefixe: "", avecAnnee: false, avecMois: false, separateur: "-", largeur: 5, compteurAnnuel: false }, 125, date)).toBe("00125");
    expect(formaterNumero({ prefixe: "DEV", avecAnnee: true, avecMois: false, separateur: "-", largeur: 5, compteurAnnuel: false }, 125, date)).toBe("DEV-2026-00125");
    expect(formaterNumero({ prefixe: "F", avecAnnee: true, avecMois: true, separateur: "/", largeur: 4, compteurAnnuel: true }, 7, date)).toBe("F/2026/09/0007");
    expect(formaterNumero({ prefixe: "", avecAnnee: true, avecMois: false, separateur: "", largeur: 3, compteurAnnuel: true }, 7, date)).toBe("2026007");
  });
  it("valide comme la base : préfixe, largeur, compteur annuel sans année, lisibilité minimale", () => {
    expect(validerFormatNumerotation(formatParDefaut("devis"))).toBeNull();
    expect(validerFormatNumerotation({ ...formatParDefaut("devis"), prefixe: "dev-x" })).toMatch(/préfixe/);
    expect(validerFormatNumerotation({ ...formatParDefaut("devis"), largeur: 0 })).toMatch(/chiffres/);
    expect(validerFormatNumerotation({ ...formatParDefaut("devis"), largeur: 9 })).toMatch(/chiffres/);
    expect(validerFormatNumerotation({ ...formatParDefaut("devis"), avecAnnee: false, compteurAnnuel: true })).toMatch(/année/);
    expect(validerFormatNumerotation({ prefixe: "", avecAnnee: false, avecMois: false, separateur: "-", largeur: 2, compteurAnnuel: false })).toMatch(/3 chiffres/);
    expect(validerFormatNumerotation({ prefixe: "", avecAnnee: false, avecMois: false, separateur: "-", largeur: 5, compteurAnnuel: false })).toBeNull();
  });
  it("lecture indulgente d'une ligne de base", () => {
    expect(lireFormat("devis", null)).toEqual(formatParDefaut("devis"));
    expect(lireFormat("devis", { prefixe: "", avec_annee: false, separateur: "?", largeur: 5 })).toMatchObject({ prefixe: "", avecAnnee: false, separateur: "-", largeur: 5, avecMois: false });
  });
});
