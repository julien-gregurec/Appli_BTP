import { describe, expect, it } from "vitest";
import {
  champsTarifairesMappes,
  construireLignesImportStock,
  MESSAGE_IMPORT_PRIX_REFUSE,
  MESSAGE_IMPORT_STOCK_REFUSE,
  messageErreurImportStock,
  peutGererPrixStock,
} from "./stock-lignes";

const AVEC_PRIX = { reference: 0, designation: 1, prix_achat_ht: 2, prix_vente_ht: 3, quantite_stock: 4 };
const SANS_PRIX = { reference: 0, designation: 1, quantite_stock: 4 };

describe("peutGererPrixStock", () => {
  it("null (accès complet) ou gerer_prix_stock : oui", () => {
    expect(peutGererPrixStock(null)).toBe(true);
    expect(peutGererPrixStock(["gerer_prix_stock"])).toBe(true);
  });
  it("gerer_stock ou voir_prix_stock seuls : non", () => {
    expect(peutGererPrixStock(["gerer_stock", "voir_prix_stock"])).toBe(false);
  });
});

describe("construireLignesImportStock — D2", () => {
  it("avec gerer_prix_stock : prix d'achat ET de vente transmis", () => {
    const r = construireLignesImportStock({ lignes: [["A1", "Article", "12,50", "20 €", "3"]], mapping: AVEC_PRIX, peutGererPrix: true });
    expect(r.refus).toBeNull();
    expect(r.lignes).toEqual([{ reference: "A1", designation: "Article", prix_achat_ht: 12.5, prix_vente_ht: 20, quantite: 3 }]);
  });

  it("colonnes de prix mappées sans gerer_prix_stock : refus explicite de TOUT l'import", () => {
    const r = construireLignesImportStock({ lignes: [["A1", "Article", "12", "", ""], ["A2", "B", "", "", ""]], mapping: AVEC_PRIX, peutGererPrix: false });
    expect(r).toEqual({ lignes: [], ignores: 2, erreurs: [], refus: MESSAGE_IMPORT_PRIX_REFUSE });
  });

  it("un seul champ tarifaire mappé suffit à refuser", () => {
    expect(champsTarifairesMappes({ reference: 0, designation: 1, prix_vente_ht: 2 })).toEqual(["prix_vente_ht"]);
    expect(construireLignesImportStock({ lignes: [["A1", "B", "9"]], mapping: { reference: 0, designation: 1, prix_vente_ht: 2 }, peutGererPrix: false }).refus)
      .toBe(MESSAGE_IMPORT_PRIX_REFUSE);
  });

  it("sans colonne tarifaire et sans gerer_prix_stock : import accepté, aucune clé de prix", () => {
    const r = construireLignesImportStock({ lignes: [["A1", "Article", "", "", "5"]], mapping: SANS_PRIX, peutGererPrix: false });
    expect(r.refus).toBeNull();
    expect(r.lignes).toEqual([{ reference: "A1", designation: "Article", quantite: 5 }]);
  });

  it("cellule de prix vide : clé absente (le prix existant reste inchangé, jamais 0 ni null)", () => {
    const [ligne] = construireLignesImportStock({ lignes: [["A1", "Article", "", "7", ""]], mapping: AVEC_PRIX, peutGererPrix: true }).lignes;
    expect(ligne).not.toHaveProperty("prix_achat_ht");
    expect(ligne.prix_vente_ht).toBe(7);
    expect(ligne).not.toHaveProperty("quantite");
  });

  it("prix négatif : ligne refusée avec message, jamais ramenée à 0", () => {
    const r = construireLignesImportStock({ lignes: [["A1", "Article", "-3", "", ""], ["A2", "Bon", "4", "", ""]], mapping: AVEC_PRIX, peutGererPrix: true });
    expect(r.lignes).toEqual([{ reference: "A2", designation: "Bon", prix_achat_ht: 4 }]);
    expect(r.ignores).toBe(1);
    expect(r.erreurs[0]).toMatch(/Ligne 2 \(A1\) : prix négatif refusé/);
  });

  it("prix illisible : ligne refusée avec message", () => {
    const r = construireLignesImportStock({ lignes: [["A1", "Article", "", "abc", ""]], mapping: AVEC_PRIX, peutGererPrix: true });
    expect(r.lignes).toEqual([]);
    expect(r.erreurs[0]).toMatch(/prix illisible « abc »/);
  });

  it("référence ou désignation manquante : ligne ignorée", () => {
    expect(construireLignesImportStock({ lignes: [["", "Article"], ["A1", ""]], mapping: SANS_PRIX, peutGererPrix: true }).ignores).toBe(2);
  });
});

describe("messageErreurImportStock", () => {
  it("42501 : refus tarifaire explicite", () => expect(messageErreurImportStock({ code: "42501" })).toBe(MESSAGE_IMPORT_PRIX_REFUSE));
  it("« Accès refusé » : refus gerer_stock explicite", () => expect(messageErreurImportStock({ code: "P0001", message: "Accès refusé" })).toBe(MESSAGE_IMPORT_STOCK_REFUSE));
  it("prix négatif : message SQL conservé", () =>
    expect(messageErreurImportStock({ code: "22023", message: "Prix négatif refusé pour la référence A1" })).toMatch(/^Prix négatif refusé pour la référence A1/));
  it("erreur inconnue : null (repli générique journalisé par l'appelant)", () => expect(messageErreurImportStock({ code: "XX000", message: "boom" })).toBeNull());
});
