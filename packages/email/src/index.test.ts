import { describe, expect, it } from "vitest";
import { echapperHtml, gabaritEmailElsatia } from "./index";

describe("échappement HTML", () => {
  it("neutralise les cinq caractères qui font du balisage", () => {
    expect(echapperHtml(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
  });

  it("échappe l'esperluette avant tout le reste, sans double échappement", () => {
    // Si `&` était traité en dernier, `&lt;` deviendrait `&amp;lt;` : le texte affiché
    // montrerait l'entité au lieu du chevron.
    expect(echapperHtml("<")).toBe("&lt;");
    expect(echapperHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("gabarit commun ELSATIA", () => {
  it("produit un document autonome, avec le nom de l'application", () => {
    const html = gabaritEmailElsatia({
      application: "ELSATIA Réserves",
      titre: "Titre",
      paragraphes: ["Corps"],
    });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("ELSATIA Réserves");
    expect(html).toContain("Corps");
  });

  it("échappe le titre, qui peut venir d'une donnée saisie", () => {
    const html = gabaritEmailElsatia({ titre: "<b>x</b>", paragraphes: [] });
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("échappe l'URL et le libellé du bouton", () => {
    const html = gabaritEmailElsatia({
      titre: "T",
      paragraphes: [],
      bouton: { libelle: 'Ouvrir"', url: 'https://x/"onmouseover=' },
    });
    expect(html).not.toContain('href="https://x/"onmouseover="');
    expect(html).toContain("&quot;");
  });

  it("n'ajoute ni bouton ni pied de page quand ils ne sont pas demandés", () => {
    const html = gabaritEmailElsatia({ titre: "T", paragraphes: ["P"] });
    expect(html).not.toContain("<a href");
  });

  it("laisse passer le balisage volontaire des paragraphes", () => {
    // Les paragraphes sont composés par l'appelant, qui échappe lui-même ses données :
    // c'est ce qui permet un <strong> sur un nom d'organisation déjà échappé.
    const html = gabaritEmailElsatia({ titre: "T", paragraphes: ["<strong>Gras</strong>"] });
    expect(html).toContain("<strong>Gras</strong>");
  });
});
