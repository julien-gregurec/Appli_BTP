import { describe, expect, it } from "vitest";
import { rangCorrespondance, rechercherArticles, type ArticleCatalogue } from "@/lib/devis/recherche-articles";

// GP V1, lot B : codes distributeurs et famille dans le classement — miroir de rechercher_articles_devis.

const A = "ent-a";
function article(p: Partial<ArticleCatalogue> & { id: string }): ArticleCatalogue {
  return {
    entrepriseId: A, source: "prestation", referenceInterne: null, referenceFabricant: null,
    designation: "Article", description: null, fabricant: null, fournisseur: null, codeBarres: null,
    unite: "u", prixAchatHt: null, prixVenteHt: 20, tauxTva: 20, stockDisponible: null, actif: true, ...p,
  };
}

const plaque = article({
  id: "p1", referenceInterne: "ART-00012", designation: "Plaque BA13", codesFournisseurs: ["DIS-9001", "PT-77"],
  famille: "Plâtrerie › Plaques",
});

describe("codes distributeurs", () => {
  it("un code exact se classe comme une référence fabricant exacte (rang 2)", () => {
    expect(rangCorrespondance(plaque, "dis 9001")).toBe(2);
    expect(rangCorrespondance(plaque, "pt77")).toBe(2);
  });

  it("un début de code au rang 4, une partie de code au rang 6", () => {
    expect(rangCorrespondance(plaque, "DIS-90")).toBe(4);
    expect(rangCorrespondance(plaque, "9001")).toBe(6);
  });

  it("la référence interne exacte reste devant", () => {
    const jumeau = article({ id: "p2", referenceInterne: "DIS-9001", designation: "Autre" });
    expect(rechercherArticles([plaque, jumeau], "DIS-9001", A).map((a) => a.id)).toEqual(["p2", "p1"]);
  });

  it("sans codes, rien ne change", () => {
    expect(rangCorrespondance(article({ id: "x", referenceInterne: "ART-1" }), "dis")).toBeNull();
  });
});

describe("famille", () => {
  it("se recherche au dernier niveau, avec la désignation", () => {
    expect(rangCorrespondance(plaque, "plaques")).toBe(7);
    expect(rangCorrespondance(plaque, "platrerie")).toBe(7);
  });
});
