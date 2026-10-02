import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions/planning", () => ({ modifierAffectationFormAction: async () => undefined }));

import { ChantiersPlanningProvider, FormulaireAffectation, ModifierAffectationDiffere } from "./ModifierAffectationDiffere";

// Baseline performance V1 : le planning ne doit plus recopier la liste des chantiers dans
// chaque affectation. Fermé, le formulaire n'émet AUCUNE option de chantier ; déplié, il porte
// exactement les champs du formulaire d'origine.
// Heavy pages V1 : chaque bouton « Modifier » ne porte que l'identifiant ; données, lots et
// chantiers sont fournis une fois par le contexte.
const chantiers = Array.from({ length: 300 }, (_, i) => ({ id: `c${i}`, nom: `Chantier ${i}` }));
const donnees = {
  typeActivite: "chantier",
  chantierId: "c7",
  lieuActivite: null,
  date: "2026-09-29",
  heures: 7,
  tache: "Pose",
  lot: "L1",
};
const edition = {
  chantiers,
  retour: "2026-09-28",
  affectations: { a1: donnees, a2: { ...donnees } },
  lots: { L1: [{ id: "a1", libelle: "Paul Martin" }, { id: "a2", libelle: "Jean Dupont" }] },
};

describe("ModifierAffectationDiffere", () => {
  it("fermé : seul le résumé est rendu, sans la liste des chantiers", () => {
    const html = renderToStaticMarkup(createElement(ChantiersPlanningProvider, edition,
      createElement(ModifierAffectationDiffere, { affectationId: "a1" })));
    expect(html).toContain("<summary");
    expect(html).toContain("Modifier");
    expect(html).not.toContain("<option");
    expect(html).not.toContain("Chantier 299");
    expect(html.length).toBeLessThan(400);
  });

  it("identifiant inconnu (pas de droit de gestion) : rien n'est rendu", () => {
    const html = renderToStaticMarkup(createElement(ChantiersPlanningProvider, { ...edition, affectations: {} },
      createElement(ModifierAffectationDiffere, { affectationId: "a1" })));
    expect(html).toBe("");
  });

  it("déplié : mêmes champs que le formulaire d'origine, chantier courant présélectionné", () => {
    const html = renderToStaticMarkup(createElement(FormulaireAffectation, {
      ...donnees, affectationId: "a1", retour: edition.retour, chantiers, autresMemeLot: [{ id: "a2", libelle: "Jean Dupont" }],
    }));
    for (const nom of ["affectation_id", "retour", "type_activite", "chantier_id", "lieu_activite", "date", "heures", "tache", "ids_supplementaires"]) {
      expect(html).toContain(`name="${nom}"`);
    }
    expect(html).toContain('name="affectation_id" value="a1"');
    expect(html).toContain('<option value="c7" selected="">Chantier 7</option>');
    expect((html.match(/<option value="c\d+"/g) ?? []).length).toBe(300);
    // Les 7 types d'activité, dans l'ordre d'origine.
    expect((html.match(/<option value="(chantier|bureau|depot|visite_medicale|formation|conge|autre)"/g) ?? []).length).toBe(7);
    expect(html).toContain("Jean Dupont");
  });
});
