import { describe, expect, it } from "vitest";
import { calculerSyntheseInventaire } from "@/lib/inventaires";

describe("valorisation d'un inventaire", () => {
  it("calcule les manquants, excédents et écarts au prix d'achat", () => {
    const resultat = calculerSyntheseInventaire([
      { quantiteTheorique: 10, quantiteComptee: 8, prixAchatHt: 12.5 },
      { quantiteTheorique: 5, quantiteComptee: 7, prixAchatHt: 4 },
      { quantiteTheorique: 3, quantiteComptee: 3, prixAchatHt: 20 },
    ]);

    expect(resultat).toEqual({
      articles: 3,
      articlesComptes: 3,
      articlesAvecEcart: 2,
      quantiteManquante: 2,
      quantiteExcedentaire: 2,
      valeurTheoriqueHt: 205,
      valeurCompteeHt: 188,
      ecartValeurHt: -17,
    });
  });

  it("ne valorise pas comme comptée une ligne encore non saisie", () => {
    const resultat = calculerSyntheseInventaire([
      { quantiteTheorique: 4, quantiteComptee: null, prixAchatHt: 10 },
    ]);
    expect(resultat.valeurTheoriqueHt).toBe(40);
    expect(resultat.valeurCompteeHt).toBe(0);
    expect(resultat.articlesComptes).toBe(0);
  });
});
