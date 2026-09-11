import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DocumentA4 } from "@/components/documents/DocumentA4";
import { construireVueDocument, type VueDocument } from "@/lib/devis/document-modele";
import { resoudreFiligrane, type Filigrane } from "@/lib/devis/filigrane";
import { paginer } from "@/lib/devis/pagination";
import { euros } from "@/lib/devis";
import { sourceFictive } from "@/lib/devis/fixtures/document-fictif";

const rendre = (vue: VueDocument, mode: "apercu" | "impression" = "impression") =>
  renderToStaticMarkup(createElement(DocumentA4, { vue, mode }));

/** Découpe le HTML rendu en pages, et chaque page en clés de lignes, dans l'ordre. */
function pagesRendues(html: string): string[][] {
  return html.split('<section class="doc-a4__page"').slice(1)
    .map((page) => [...page.matchAll(/data-cle="([^"]+)"/g)].map((m) => m[1]));
}

const avecFiligrane = (document: Partial<Filigrane>, logoUrl: string | null = null, pages = 1) => {
  const source = sourceFictive({ lignesLibres: pages > 1 ? 80 : 2 });
  return construireVueDocument({
    ...source,
    emetteur: { ...source.emetteur, logoUrl },
    filigrane: resoudreFiligrane({ typeDocument: "devis", statut: "brouillon", document }),
  });
};

describe("27–29. aperçu A4 : un seul rendu, les mêmes pages que le paginateur", () => {
  it("dessine exactement les pages et les lignes décidées par paginer(), dans l'ordre", () => {
    const vue = construireVueDocument(sourceFictive({ lignesLibres: 80 }));
    const attendu = paginer(vue).map((p) => p.blocs.flatMap((b) => (b.type === "tableau" ? b.lignes.map((l) => l.cle) : [])));
    const html = rendre(vue);
    expect(attendu.length).toBeGreaterThan(1);
    expect(pagesRendues(html)).toEqual(attendu);
    expect(html).toContain(`data-pages="${attendu.length}"`);
    for (let i = 1; i <= attendu.length; i += 1) expect(html).toContain(`Page ${i} / ${attendu.length}`);
  });
  it("fixe chaque page à 210 × 297 mm et la coupe au même endroit à l'impression", () => {
    const html = rendre(construireVueDocument(sourceFictive()));
    expect(html).toMatch(/width:210mm;height:297mm/);
    expect(html).toMatch(/@page\{size:A4;margin:0;\}/);
    expect(html).toMatch(/break-after:page/);
  });
  it("le mode aperçu et le mode impression rendent les mêmes pages et les mêmes lignes", () => {
    const vue = construireVueDocument(sourceFictive({ lignesLibres: 50 }));
    expect(pagesRendues(rendre(vue, "apercu"))).toEqual(pagesRendues(rendre(vue, "impression")));
  });
  it("imprime chaque montant et les totaux affichés", () => {
    const vue = construireVueDocument(sourceFictive({ mode: "eclate" }));
    const html = rendre(vue);
    const texte = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ");
    for (const l of vue.lignes) if (l.totalHt !== null) expect(texte).toContain(euros(l.totalHt).replace(/ /g, " "));
    expect(texte).toContain(euros(vue.totauxAffiches.totalTtc).replace(/ /g, " "));
  });
  it("n'imprime aucun coût, aucune marge, aucune information interne", () => {
    const html = rendre(construireVueDocument(sourceFictive({ mode: "eclate" })));
    for (const interdit of ["prixAchat", "marge", "DONNÉES FICTIVES", "Consommables (fictif)", "Saisi à la main"]) {
      expect(html, interdit).not.toContain(interdit);
    }
  });
  it("ne montre l'écart base / calcul que dans l'aperçu, jamais sur le document client", () => {
    const vue = construireVueDocument({ ...sourceFictive(), totauxEnregistres: { totalHt: 1, totalTva: 0.2, totalTtc: 1.2 } });
    expect(rendre(vue, "apercu")).toContain("différents du calcul");
    expect(rendre(vue, "impression")).not.toContain("différents du calcul");
  });
});

describe("30–33. filigranes rendus", () => {
  it("30. logo : image dans le calque de filigrane", () => {
    const html = rendre(avecFiligrane({ type: "logo" }, "https://exemple.invalid/logo.png"));
    expect(html).toMatch(/data-testid="filigrane"[^>]*>[\s\S]*<img src="https:\/\/exemple\.invalid\/logo\.png"/);
  });
  it("30. logo absent : aucun calque plutôt qu'un cadre vide", () => {
    expect(rendre(avecFiligrane({ type: "logo" }, null))).not.toContain('data-testid="filigrane"');
  });
  it("31. texte : BROUILLON, masqué aux lecteurs d'écran mais décrit sur le document", () => {
    const html = rendre(avecFiligrane({ type: "texte", preset: "BROUILLON" }));
    expect(html).toMatch(/class="doc-a4__filigrane"[^>]*aria-hidden="true"/);
    expect(html).toContain(">BROUILLON</span>");
    expect(html).toContain('data-filigrane="Filigrane : BROUILLON"');
  });
  it("32. combiné : logo et texte dans le même motif", () => {
    const html = rendre(avecFiligrane({ type: "logo_texte", preset: "A_VALIDER" }, "https://exemple.invalid/logo.png"));
    expect(html).toMatch(/doc-a4__motif[^>]*>[\s\S]*<img[^>]*>[\s\S]*À VALIDER/);
  });
  it("33. sous le contenu, sans fond, à opacité bornée : ne masque jamais un montant", () => {
    const html = rendre(avecFiligrane({ type: "texte", preset: "PAYEE", opacite: 1 }));
    expect(html).toMatch(/\.doc-a4__filigrane\{position:absolute;inset:0;z-index:0;pointer-events:none/);
    expect(html).toMatch(/\.doc-a4__contenu\{position:relative;z-index:1;/);
    const opacite = Number(/data-testid="filigrane" style="opacity:([\d.]+)"/.exec(html)?.[1]);
    expect(opacite).toBeLessThanOrEqual(0.15);
    const calque = /<div class="doc-a4__filigrane"[\s\S]*?<\/div><\/div>/.exec(html)![0];
    expect(calque).not.toMatch(/€/);
  });
  it("première page seulement, ou toutes les pages", () => {
    const toutes = rendre(avecFiligrane({ type: "texte", preset: "COPIE", pages: "toutes" }, null, 3));
    const premiere = rendre(avecFiligrane({ type: "texte", preset: "COPIE", pages: "premiere" }, null, 3));
    const compte = (h: string) => (h.match(/data-testid="filigrane"/g) ?? []).length;
    expect(compte(toutes)).toBe(pagesRendues(toutes).length);
    expect(compte(premiere)).toBe(1);
  });
  it("répète le motif en mosaïque sur demande", () => {
    const html = rendre(avecFiligrane({ type: "texte", preset: "COPIE", repetition: true }));
    const pages = html.split('<section class="doc-a4__page"').slice(1);
    for (const page of pages) expect((page.match(/class="doc-a4__motif"/g) ?? []).length).toBe(6);
  });
});
