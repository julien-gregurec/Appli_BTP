import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChantiersPlanningProvider, FormulaireAffectation, ModifierAffectationDiffere } from "./ModifierAffectationDiffere";

// Baseline performance V1 : le planning ne doit plus recopier la liste des chantiers dans
// chaque affectation. Fermé, le formulaire n'émet AUCUNE option de chantier ; déplié, il porte
// exactement les champs du formulaire d'origine.
const chantiers = Array.from({ length: 300 }, (_, i) => ({ id: `c${i}`, nom: `Chantier ${i}` }));
const proprietes = {
  action: async () => undefined,
  retour: "2026-09-28",
  activites: [["chantier", "Chantier"], ["bureau", "Bureau"]] as [string, string][],
  typeActivite: "chantier",
  chantierId: "c7",
  lieuActivite: null,
  date: "2026-09-29",
  heures: 7,
  tache: "Pose",
  autresMemeLot: [{ id: "a2", libelle: "Jean Dupont" }],
};

describe("ModifierAffectationDiffere", () => {
  it("fermé : seul le résumé est rendu, sans la liste des chantiers", () => {
    const html = renderToStaticMarkup(createElement(ChantiersPlanningProvider, { chantiers },
      createElement(ModifierAffectationDiffere, proprietes)));
    expect(html).toContain("<summary");
    expect(html).toContain("Modifier");
    expect(html).not.toContain("<option");
    expect(html).not.toContain("Chantier 299");
    expect(html.length).toBeLessThan(400);
  });

  it("déplié : mêmes champs que le formulaire d'origine, chantier courant présélectionné", () => {
    const html = renderToStaticMarkup(createElement(FormulaireAffectation, { ...proprietes, chantiers }));
    for (const nom of ["retour", "type_activite", "chantier_id", "lieu_activite", "date", "heures", "tache", "ids_supplementaires"]) {
      expect(html).toContain(`name="${nom}"`);
    }
    expect(html).toContain('<option value="c7" selected="">Chantier 7</option>');
    expect((html.match(/<option value="c\d+"/g) ?? []).length).toBe(300);
    expect(html).toContain("Jean Dupont");
  });
});
