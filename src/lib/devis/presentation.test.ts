import { describe, expect, it } from "vitest";
import { instancierOuvrage, modifierLigne, type InstanceOuvrage, type ModePresentation } from "@/lib/devis/ouvrages";
import { lignesClient, lignesClientOuvrage, totauxDevis, type ElementDevis, type LigneClient } from "@/lib/devis/presentation";
import { proposerPrixGlobal } from "@/lib/devis/prix";
import { plancherChauffantFictif } from "@/lib/devis/fixtures/plancher-chauffant-fictif";

function pc001(mode: ModePresentation = "regroupe"): InstanceOuvrage {
  const issue = instancierOuvrage(plancherChauffantFictif(), { cle: "i1", ordre: 2, quantitePrincipale: 120, saisies: { bande: 44 }, mode });
  if (issue.etat !== "pret") throw new Error(issue.motif);
  return issue.instance;
}

const depose: ElementDevis = {
  type: "ligne",
  ordre: 1,
  ligne: { cle: "l1", designation: "Dépose de l’existant", description: null, type: "forfait", quantite: 1, unite: "forfait", prixUnitaireHt: 450, remiseLignePct: 0, tauxTva: 20 },
};
const devis = (instance: InstanceOuvrage): ElementDevis[] => [{ type: "ouvrage", ordre: 2, instance }, depose];

const CLES_AUTORISEES = [
  "cle", "niveau", "enTeteOuvrage", "designation", "description", "quantite", "unite",
  "prixUnitaireHt", "remisePct", "totalHt", "tauxTva", "mentionTva",
].sort();

function sansFuite(lignes: LigneClient[]) {
  for (const l of lignes) expect(Object.keys(l).sort()).toEqual(CLES_AUTORISEES);
  const json = JSON.stringify(lignes);
  for (const interdit of ["prixAchat", "marge", "cout", "detailCalcul", "descriptionInterne", "DONNÉES FICTIVES", "Consommables"]) {
    expect(json, interdit).not.toContain(interdit);
  }
}

describe("19. vue regroupée", () => {
  it("une seule ligne client : Plancher chauffant — 120 m² — montant global", () => {
    const lignes = lignesClient(devis(pc001("regroupe")));
    expect(lignes.map((l) => l.designation)).toEqual(["Dépose de l’existant", "Plancher chauffant"]);
    expect(lignes[1]).toMatchObject({ quantite: 120, unite: "m²", prixUnitaireHt: null, totalHt: 8360, tauxTva: 20, enTeteOuvrage: true });
    sansFuite(lignes);
  });
});

describe("20. vue semi-détaillée", () => {
  it("montre les composants visibles avec quantités et descriptions, et le seul prix global", () => {
    const lignes = lignesClientOuvrage(pc001("semi_detaille"));
    expect(lignes[0]).toMatchObject({ enTeteOuvrage: true, totalHt: 8360 });
    const composants = lignes.slice(1);
    expect(composants).toHaveLength(8); // « consommables » est interne
    expect(composants.every((l) => l.quantite !== null && l.prixUnitaireHt === null && l.totalHt === null)).toBe(true);
    sansFuite(lignes);
  });
});

describe("21. vue éclatée", () => {
  it("chiffre chaque composant visible et agrège les internes : la somme retombe sur l'ouvrage", () => {
    const lignes = lignesClientOuvrage(pc001("eclate"));
    const composants = lignes.slice(1);
    expect(composants.find((l) => l.designation === "Isolant à plots (fictif)")).toMatchObject({ quantite: 130, unite: "m²", prixUnitaireHt: 21, totalHt: 2730, tauxTva: 20 });
    expect(composants.at(-1)).toMatchObject({ designation: "Autres fournitures et prestations de l’ouvrage", quantite: null, totalHt: 45 });
    expect(composants.reduce((s, l) => s + Math.round((l.totalHt ?? 0) * 100), 0)).toBe(Math.round(lignes[0].totalHt! * 100));
    sansFuite(lignes);
  });
  it("montre l'ajustement de prix tel qu'il est, sans le cacher dans les composants", () => {
    const p = proposerPrixGlobal(pc001("eclate"), 8000, "ajustement", { statutDevis: "brouillon" });
    if (p.etat !== "propose") throw new Error(p.etat);
    const lignes = lignesClientOuvrage(p.instance);
    expect(lignes[0].totalHt).toBe(8000);
    expect(lignes.find((l) => l.designation === "Ajustement du prix de l’ouvrage")).toMatchObject({ totalHt: -360, quantite: null });
  });
});

describe("22. visibilité personnalisée", () => {
  it("applique les réglages composant par composant", () => {
    let i = pc001("personnalise");
    i = modifierLigne(i, "main_oeuvre", { afficherPrix: false });
    i = modifierLigne(i, "isolant", { afficherQuantite: false });
    i = modifierLigne(i, "collecteur", { visibleClient: false });
    i = modifierLigne(i, "bande", { descriptionPersonnalisee: "Pose en périphérie des pièces" });
    const lignes = lignesClientOuvrage(i);
    const par = (d: string) => lignes.find((l) => l.designation.startsWith(d));
    expect(par("Main-d’œuvre")).toMatchObject({ quantite: 42, prixUnitaireHt: null, totalHt: null });
    expect(par("Isolant")).toMatchObject({ quantite: null, unite: null, prixUnitaireHt: 21 });
    expect(par("Collecteur")).toBeUndefined();
    expect(par("Bande")?.description).toBe("Pose en périphérie des pièces");
    expect(lignes[0].totalHt).toBe(8360); // le composant masqué reste dans le montant de l'ouvrage
    sansFuite(lignes);
  });
});

describe("le mode de présentation ne modifie jamais les calculs", () => {
  it("les totaux du devis sont identiques dans les quatre modes", () => {
    const totaux = (["regroupe", "semi_detaille", "eclate", "personnalise"] as const).map((m) => totauxDevis(devis(pc001(m)), 5));
    for (const t of totaux) expect(t).toEqual(totaux[0]);
    expect(totaux[0]).toMatchObject({ sousTotalHt: 8810, remiseGlobaleHt: 440.5, totalHt: 8369.5 });
  });
  it("signale plusieurs taux sur l'en-tête plutôt que d'en afficher un faux", () => {
    const i = modifierLigne(pc001("regroupe"), "main_oeuvre", { tauxTva: 10 });
    expect(lignesClientOuvrage(i)[0]).toMatchObject({ tauxTva: null, mentionTva: "Plusieurs taux — voir la ventilation de TVA" });
    expect(totauxDevis(devis(i)).ventilation.map((v) => v.tauxTva)).toEqual([20, 10]);
  });
});
