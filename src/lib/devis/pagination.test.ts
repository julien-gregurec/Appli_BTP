import { describe, expect, it } from "vitest";
import { construireVueDocument } from "@/lib/devis/document-modele";
import { CONTENU_HAUTEUR_PX, estimerHauteurs, paginer, type BlocPage, type PageDocument } from "@/lib/devis/pagination";
import { elementsFictifs, sourceFictive } from "@/lib/devis/fixtures/document-fictif";
import type { LigneClient } from "@/lib/devis/presentation";

const lignesDe = (pages: PageDocument[]): LigneClient[] =>
  pages.flatMap((p) => p.blocs.flatMap((b) => (b.type === "tableau" ? b.lignes : [])));
const types = (p: PageDocument) => p.blocs.map((b: BlocPage) => b.type);

describe("27–28. aperçu A4 et pagination réelle", () => {
  it("un devis court tient sur une seule page", () => {
    const pages = paginer(construireVueDocument(sourceFictive({ elements: elementsFictifs({ lignesLibres: 3, ouvrage: false }) })));
    expect(pages).toHaveLength(1);
    expect(types(pages[0])).toEqual(["entete", "destinataire", "tableau", "totaux", "conditions", "bon_pour_accord", "mentions"]);
    expect(pages[0]).toMatchObject({ numero: 1, total: 1, debordement: false });
  });

  it("un long devis se répartit sur plusieurs pages, chaque ligne une seule fois et dans l'ordre", () => {
    const vue = construireVueDocument(sourceFictive({ lignesLibres: 90 }));
    const pages = paginer(vue);
    expect(pages.length).toBeGreaterThan(2);
    expect(lignesDe(pages).map((l) => l.cle)).toEqual(vue.lignes.map((l) => l.cle));
    expect(pages.every((p) => p.total === pages.length)).toBe(true);
  });

  it("ne dépasse jamais la hauteur utile estimée d'une page", () => {
    const pages = paginer(construireVueDocument(sourceFictive({ lignesLibres: 90 })));
    for (const p of pages) {
      expect(p.debordement).toBe(false);
      expect(p.hauteurEstimeePx).toBeLessThanOrEqual(CONTENU_HAUTEUR_PX);
    }
  });

  it("répète l'en-tête du tableau et ouvre les pages suivantes par un rappel", () => {
    const pages = paginer(construireVueDocument(sourceFictive({ lignesLibres: 90 })));
    expect(types(pages[0])[0]).toBe("entete");
    for (const p of pages.slice(1)) expect(types(p)[0]).toBe("rappel");
    const tableaux = pages.flatMap((p) => p.blocs.filter((b): b is Extract<BlocPage, { type: "tableau" }> => b.type === "tableau"));
    expect(tableaux[0].suite).toBe(false);
    expect(tableaux.slice(1).every((t) => t.suite)).toBe(true);
  });

  it("ne laisse jamais l'en-tête d'un ouvrage seul en bas de page", () => {
    for (let n = 0; n < 60; n += 1) {
      const pages = paginer(construireVueDocument(sourceFictive({ lignesLibres: n, mode: "eclate" })));
      for (const p of pages) {
        const tableau = p.blocs.find((b): b is Extract<BlocPage, { type: "tableau" }> => b.type === "tableau");
        const derniere = tableau?.lignes.at(-1);
        expect(derniere?.enTeteOuvrage && p.numero < p.total, `n=${n} page ${p.numero}`).toBeFalsy();
      }
    }
  });

  it("garde les totaux entiers, après toutes les lignes, et les mentions en dernière page", () => {
    const pages = paginer(construireVueDocument(sourceFictive({ lignesLibres: 90 })));
    const pageTotaux = pages.findIndex((p) => types(p).includes("totaux"));
    expect(pages.filter((p) => types(p).includes("totaux"))).toHaveLength(1);
    const derniereLigne = pages.map((p) => types(p).includes("tableau")).lastIndexOf(true);
    expect(pageTotaux).toBeGreaterThanOrEqual(derniereLigne);
    expect(types(pages.at(-1)!).at(-1)).toBe("mentions");
  });

  it("signale un bloc indivisible plus haut qu'une page, sans le perdre", () => {
    const pages = paginer(construireVueDocument(sourceFictive({ notesClient: "Note fictive très longue. ".repeat(900) })));
    const page = pages.find((p) => types(p).includes("notes"))!;
    expect(page.debordement).toBe(true);
  });

  it("est déterministe, et une police plus grande ne réduit jamais le nombre de pages", () => {
    const source = sourceFictive({ lignesLibres: 60 });
    const a = paginer(construireVueDocument(source));
    expect(paginer(construireVueDocument(source))).toEqual(a);
    const grand = paginer(construireVueDocument({ ...source, style: { taillePolice: 16 } }));
    expect(grand.length).toBeGreaterThanOrEqual(a.length);
  });

  it("estime une ligne décrite plus haute qu'une ligne sans description", () => {
    const vue = construireVueDocument(sourceFictive());
    const h = estimerHauteurs(vue);
    const base = vue.lignes.find((l) => !l.description && l.niveau === 0)!;
    expect(h.ligne({ ...base, description: "Une description assez longue pour occuper plusieurs lignes dans la colonne de désignation du tableau." })).toBeGreaterThan(h.ligne(base));
  });
});

describe("GP V1, lot G — annexe CGV", () => {
  it("pose les CGV après les mentions, sur leurs propres pages, coupées entre deux paragraphes", () => {
    const paragraphes = Array.from({ length: 40 }, (_, i) => `Article ${i + 1} — ${"Texte fictif de conditions générales. ".repeat(12).trim()}`);
    const vue = construireVueDocument(sourceFictive({ cgv: paragraphes.join("\n\n") }));
    const pages = paginer(vue);
    const sansCgv = paginer(construireVueDocument(sourceFictive()));
    expect(pages.length).toBeGreaterThan(sansCgv.length + 1);
    // Aucune page ne mélange le document et l'annexe.
    for (const p of pages) {
      const aCgv = p.blocs.some((b) => b.type === "cgv");
      const aDocument = p.blocs.some((b) => ["tableau", "totaux", "mentions", "entete"].includes(b.type));
      expect(aCgv && aDocument).toBe(false);
      expect(p.hauteurEstimeePx).toBeLessThanOrEqual(CONTENU_HAUTEUR_PX);
    }
    const reçus = pages.flatMap((p) => p.blocs.flatMap((b) => (b.type === "cgv" ? b.paragraphes : [])));
    expect(reçus).toEqual(paragraphes);
    const blocsCgv = pages.flatMap((p) => p.blocs.filter((b) => b.type === "cgv"));
    expect(blocsCgv[0].type === "cgv" && blocsCgv[0].suite).toBe(false);
    expect(blocsCgv.slice(1).every((b) => b.type === "cgv" && b.suite)).toBe(true);
  });
});
