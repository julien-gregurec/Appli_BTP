import { describe, expect, it } from "vitest";
import { COMMANDE_STATUTS, TRANSITIONS_COMMANDES, statutCommande, statutsCommandeAccessibles, totauxCommande } from "./commandes";

describe("commandes fournisseurs — logique pure (COMMANDES-FOURNISSEURS-V1B, filet de sécurité, aucune modification fonctionnelle)", () => {
  it("statutCommande retrouve le bon statut par clé", () => {
    expect(statutCommande("recue_partiel")).toEqual({ cle: "recue_partiel", libelle: "Reçue partiellement", couleur: "#b8792e" });
  });

  it("statutCommande se replie sur le premier statut (brouillon) pour une clé inconnue", () => {
    expect(statutCommande("inexistant")).toEqual(COMMANDE_STATUTS[0]);
  });

  it("figer la machine à états réellement en vigueur (doit rester synchrone avec changer_statut_commande_interne côté base)", () => {
    expect(TRANSITIONS_COMMANDES).toEqual({
      brouillon: ["envoyee", "annulee"],
      envoyee: ["confirmee", "recue", "annulee"],
      confirmee: ["recue", "annulee"],
      recue_partiel: ["recue", "annulee"],
      recue: [],
      annulee: [],
    });
  });

  it("une commande reçue ou annulée n'a plus aucune transition possible (état terminal)", () => {
    expect(TRANSITIONS_COMMANDES.recue).toEqual([]);
    expect(TRANSITIONS_COMMANDES.annulee).toEqual([]);
  });

  it("statutsCommandeAccessibles inclut le statut courant et ses transitions autorisées, jamais plus", () => {
    const accessibles = statutsCommandeAccessibles("envoyee").map((s) => s.cle);
    expect(accessibles.sort()).toEqual(["annulee", "confirmee", "envoyee", "recue"].sort());
  });

  it("statutsCommandeAccessibles d'un état terminal ne contient que lui-même", () => {
    expect(statutsCommandeAccessibles("recue").map((s) => s.cle)).toEqual(["recue"]);
  });

  it("totauxCommande calcule HT/TVA/TTC sur une ligne unique", () => {
    expect(totauxCommande([{ designation: "x", description: null, quantite: 5, unite: "u", prix_unitaire_ht: 10, taux_tva: 20 }])).toEqual({ ht: 50, tva: 10, ttc: 60 });
  });

  it("totauxCommande agrège plusieurs lignes à taux de TVA différents", () => {
    const lignes = [
      { designation: "a", description: null, quantite: 5, unite: "u", prix_unitaire_ht: 10, taux_tva: 20 },
      { designation: "b", description: null, quantite: 2, unite: "u", prix_unitaire_ht: 20, taux_tva: 10 },
    ];
    // (5×10=50, TVA 10) + (2×20=40, TVA 4) = HT 90, TVA 14, TTC 104.
    expect(totauxCommande(lignes)).toEqual({ ht: 90, tva: 14, ttc: 104 });
  });

  it("totauxCommande renvoie 0 pour une commande sans ligne", () => {
    expect(totauxCommande([])).toEqual({ ht: 0, tva: 0, ttc: 0 });
  });
});
