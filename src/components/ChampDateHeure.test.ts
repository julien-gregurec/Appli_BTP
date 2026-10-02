import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChampDateHeure } from "./ChampDateHeure";

// V9-01 / V9-02 (post-V9) : rendu serveur du champ (avant hydratation, ou sans JavaScript).

const rendre = (props: Parameters<typeof ChampDateHeure>[0]) => renderToStaticMarkup(createElement(ChampDateHeure, props));

describe("ChampDateHeure — rendu serveur", () => {
  it("affiche l'instant stocké dans le fuseau de référence et transmet ce fuseau", () => {
    const html = rendre({ name: "valide_du", label: "Valide à partir de", valeurIso: "2026-07-15T07:00:00.000Z" });
    expect(html).toContain('type="datetime-local"');
    expect(html).toContain('value="2026-07-15T09:00"');
    expect(html).toContain('name="valide_du__fuseau" value="Europe/Paris"');
    expect(html.toLowerCase()).toContain('autocomplete="off"');
  });

  it("V9-02 : option explicite « Sans date de fin », cochée quand aucune date n'est enregistrée", () => {
    const html = rendre({ name: "valide_jusqu_au", label: "Valide jusqu’au", valeurIso: null, libelleSansValeur: "Sans date de fin" });
    expect(html).toContain("Sans date de fin");
    const caseACocher = /<input type="checkbox"[^>]*>/.exec(html)?.[0] ?? "";
    expect(caseACocher).toContain('name="valide_jusqu_au__aucune"');
    expect(caseACocher).toContain('value="1"');
    expect(caseACocher).toContain('checked=""');
    expect(html).toMatch(/type="datetime-local"[^>]*disabled=""/);
  });

  it("V9-02 : décochée quand une date de fin existe (modification, réouverture)", () => {
    const html = rendre({ name: "valide_jusqu_au", label: "Valide jusqu’au", valeurIso: "2026-12-31T17:00:00.000Z", libelleSansValeur: "Sans date de fin" });
    expect(/<input type="checkbox"[^>]*>/.exec(html)?.[0]).not.toContain("checked");
    expect(html).toContain('value="2026-12-31T18:00"');
    expect(html).not.toMatch(/type="datetime-local"[^>]*disabled=""/);
  });

  it("le libellé est associé au champ (accessibilité)", () => {
    const html = rendre({ name: "date_limite", label: "Date et heure limite" });
    const id = /<input id="([^"]+)" type="datetime-local"/.exec(html)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
    expect(html).toContain(`aria-describedby="${id}-fuseau"`);
  });
});
