import { describe, expect, it } from "vitest";
import type { PrioriteReserve, StatutReserve } from "@/lib/workflow";
import {
  appliquerVue, decrireSelection, filtresBase, lireOptionsExport,
  nomFichierExport, parametresExport, suffixeExport, VUES_EXPORT,
} from "./options";

function ligne(statut: StatutReserve, echeance: string | null = null) {
  return { statut, echeance };
}

const LOT = [
  ligne("emise"),
  ligne("assignee", "2026-01-01"),
  ligne("acceptee"),
  ligne("levee_demandee"),
  ligne("levee", "2026-01-01"),
  ligne("annulee", "2026-01-01"),
  ligne("levee_refusee", "2026-01-01"),
];
const AUJOURDHUI = new Date("2026-06-01T12:00:00Z");

describe("lecture des options", () => {
  it("retient des valeurs par défaut sûres quand l'URL est vide", () => {
    const o = lireOptionsExport({});
    expect(o).toMatchObject({
      intervenantId: null, vue: "toutes", statut: null, priorite: null,
      echeanceAvant: null, format: "synthetique", orientation: "portrait",
      photos: true, historique: true, plans: true,
    });
  });

  it("rejette toute valeur hors du contrat plutôt que de la propager", () => {
    const o = lireOptionsExport({
      vue: "tout-voir", statut: "inexistant", priorite: "critique",
      format: "csv", orientation: "diagonale", echeance: "hier",
    });
    expect(o.vue).toBe("toutes");
    expect(o.statut).toBeNull();
    expect(o.priorite).toBeNull();
    expect(o.format).toBe("synthetique");
    expect(o.orientation).toBe("portrait");
    expect(o.echeanceAvant).toBeNull();
  });

  it("accepte une échéance ISO et refuse une date mal formée", () => {
    expect(lireOptionsExport({ echeance: "2026-03-04" }).echeanceAvant).toBe("2026-03-04");
    expect(lireOptionsExport({ echeance: "04/03/2026" }).echeanceAvant).toBeNull();
  });

  it("ignore les paramètres répétés, qui n'ont pas de sens pour un document", () => {
    expect(lireOptionsExport({ vue: ["retard", "levees"] }).vue).toBe("toutes");
  });
});

describe("aller-retour URL", () => {
  it("ne sérialise que ce qui s'écarte du défaut", () => {
    expect(parametresExport(lireOptionsExport({})).toString()).toBe("");
    expect(suffixeExport(lireOptionsExport({}))).toBe("");
  });

  it("conserve la sélection à l'identique", () => {
    const depart = {
      entreprise: "e2000000-0000-0000-0000-00000000000b",
      vue: "retard", format: "detaillee", orientation: "paysage",
      priorite: "haute", echeance: "2026-03-04", photos: "0",
    };
    const options = lireOptionsExport(depart);
    const relu = lireOptionsExport(
      Object.fromEntries(parametresExport(options).entries()),
    );
    expect(relu).toEqual(options);
  });
});

describe("vues métier", () => {
  it("« ouvertes » exclut les réserves levées et annulées", () => {
    const r = appliquerVue(LOT, "ouvertes", AUJOURDHUI).map((l) => l.statut);
    expect(r).not.toContain("levee");
    expect(r).not.toContain("annulee");
    expect(r).toContain("emise");
    expect(r).toContain("levee_refusee");
  });

  it("« en attente de levée » ne retient que la demande en cours", () => {
    expect(appliquerVue(LOT, "attente_levee", AUJOURDHUI).map((l) => l.statut))
      .toEqual(["levee_demandee"]);
  });

  it("« levées » ne retient que les réserves levées", () => {
    expect(appliquerVue(LOT, "levees", AUJOURDHUI).map((l) => l.statut)).toEqual(["levee"]);
  });

  it("« en retard » ignore les réserves closes, même à échéance dépassée", () => {
    const r = appliquerVue(LOT, "retard", AUJOURDHUI).map((l) => l.statut);
    expect(r).toEqual(["assignee", "levee_refusee"]);
  });

  it("« toutes » ne retire rien", () => {
    expect(appliquerVue(LOT, "toutes", AUJOURDHUI)).toHaveLength(LOT.length);
  });

  it("aucune vue n'invente de ligne absente de l'ensemble autorisé", () => {
    for (const vue of VUES_EXPORT) {
      for (const l of appliquerVue(LOT, vue, AUJOURDHUI)) expect(LOT).toContain(l);
    }
  });
});

describe("filtres délégués à la base", () => {
  it("réclame les levées seulement quand le document peut en contenir", () => {
    expect(filtresBase(lireOptionsExport({})).inclureLevees).toBe(true);
    expect(filtresBase(lireOptionsExport({ vue: "levees" })).inclureLevees).toBe(true);
    expect(filtresBase(lireOptionsExport({ vue: "ouvertes" })).inclureLevees).toBe(false);
    expect(filtresBase(lireOptionsExport({ vue: "retard" })).inclureLevees).toBe(false);
    expect(filtresBase(lireOptionsExport({ vue: "attente_levee" })).inclureLevees).toBe(false);
  });
});

describe("description de la sélection", () => {
  it("reste vide pour un document complet", () => {
    expect(decrireSelection(lireOptionsExport({}), null)).toEqual([]);
  });

  it("énonce l'entreprise et la vue, qui déterminent ce que le tirage NE contient pas", () => {
    const d = decrireSelection(lireOptionsExport({ vue: "retard" }), "Étanchéité B");
    expect(d).toContain("entreprise : Étanchéité B");
    expect(d.join(" ")).toContain("en retard");
  });

  it("nomme les filtres de statut et de priorité en clair", () => {
    const o = lireOptionsExport({ statut: "levee_demandee", priorite: "bloquante" });
    expect(decrireSelection(o, null)).toEqual([
      "statut : Levée demandée",
      "priorité : Bloquante",
    ]);
  });
});

describe("nom de fichier", () => {
  it("n'emporte ni accent ni séparateur venu d'une saisie", () => {
    const nom = nomFichierExport(
      "Groupe scolaire / Été 2026", "Étanchéité B", lireOptionsExport({ vue: "retard" }),
    );
    expect(nom).toMatch(/^[a-zA-Z0-9-]+\.pdf$/);
    expect(nom).toContain("Groupe-scolaire-Ete-2026");
    expect(nom).toContain("Etancheite-B");
  });

  it("distingue le tirage détaillé du tirage synthétique", () => {
    const chantier = "Chantier";
    expect(nomFichierExport(chantier, null, lireOptionsExport({ format: "detaillee" })))
      .toContain("detaille");
    expect(nomFichierExport(chantier, null, lireOptionsExport({})))
      .not.toContain("detaille");
  });

  it("reste un nom valide même si le chantier n'a que des caractères exotiques", () => {
    const priorite: PrioriteReserve = "haute";
    expect(priorite).toBe("haute");
    expect(nomFichierExport("«»—", null, lireOptionsExport({}))).toBe("reserves-document.pdf");
  });
});
