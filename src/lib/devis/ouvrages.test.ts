import { describe, expect, it } from "vitest";
import {
  ajouterLigne,
  calculerQuantites,
  comparerAvecVersion,
  instancierOuvrage,
  modifierLigne,
  montantsInstance,
  reappliquerVersion,
  recalculerInstance,
  retirerLigne,
  validerVersion,
  type InstanceOuvrage,
} from "@/lib/devis/ouvrages";
import { plancherChauffantFictif, PLANCHER_CHAUFFANT_FICTIF } from "@/lib/devis/fixtures/plancher-chauffant-fictif";

const SAISIES = { bande: 44 };

function inserer(quantitePrincipale = 120, options?: string[]): InstanceOuvrage {
  const issue = instancierOuvrage(plancherChauffantFictif(), { cle: "i1", ordre: 1, quantitePrincipale, saisies: SAISIES, options });
  if (issue.etat !== "pret") throw new Error(issue.motif);
  return issue.instance;
}

const quantites = (i: InstanceOuvrage) => Object.fromEntries(i.lignes.map((l) => [l.cle, l.quantite]));

describe("12. création d'un ouvrage", () => {
  it("accepte la fixture PC-001", () => {
    expect(validerVersion(PLANCHER_CHAUFFANT_FICTIF)).toEqual([]);
  });
  it("refuse un ouvrage sans nom, sans unité ou sans composant", () => {
    const v = plancherChauffantFictif();
    expect(validerVersion({ ...v, nom: " " })).toContain("L’ouvrage doit porter un nom.");
    expect(validerVersion({ ...v, unitePrincipale: "" })).toContain("L’unité principale est obligatoire.");
    expect(validerVersion({ ...v, composants: [] })).toContain("Un ouvrage compte au moins un composant.");
  });
  it("refuse une perte hors bornes, un pas nul et un composant sans aucun mode de quantité", () => {
    const v = plancherChauffantFictif();
    v.composants[1].pertePct = 120;
    v.composants[2].arrondi = { mode: "superieur", pas: 0 };
    v.composants[5] = { ...v.composants[5], coefficient: null, quantiteFixe: null, saisieRequise: false };
    const erreurs = validerVersion(v).join("\n");
    expect(erreurs).toMatch(/perte doit être comprise/);
    expect(erreurs).toMatch(/pas d’arrondi/);
    expect(erreurs).toMatch(/indiquez un coefficient/);
  });
  it("refuse une dépendance inexistante et une dépendance en boucle", () => {
    const v = plancherChauffantFictif();
    v.composants[2].base = { type: "composant", cle: "fantome" };
    expect(validerVersion(v).join()).toMatch(/inexistant « fantome »/);
    const w = plancherChauffantFictif();
    w.composants.find((c) => c.cle === "tuyau")!.base = { type: "composant", cle: "agrafes" };
    expect(validerVersion(w)).toContain("Les composants dépendent les uns des autres en boucle.");
  });
  it("refuse deux composants de même clé — on ne fusionne jamais", () => {
    const v = plancherChauffantFictif();
    v.composants.push({ ...v.composants[1] });
    expect(validerVersion(v).join()).toMatch(/même clé « isolant »/);
  });
});

describe("13–14. calcul des composants, pertes, minimum et arrondis", () => {
  it("calcule les quantités de PC-001 pour 120 m², base par base", () => {
    expect(quantites(inserer())).toEqual({
      bande: 50, // 44 saisis + 5 % = 46,2 → multiple sup. de 25
      isolant: 130, // 120 × 1 + 5 % = 126 → multiple sup. de 10
      tuyau: 900, // 120 × 6,5 = 780 + 3 % = 803,4 → multiple sup. de 100
      agrafes: 2000, // 900 ml de tube × 2 = 1800 → multiple sup. de 250
      collecteur: 1, // option cochée par défaut
      chape: 6.5, // 120 × 0,05 = 6 + 8 % = 6,48 → multiple le plus proche de 0,5
      main_oeuvre: 42, // 120 × 0,35 = 42
      consommables: 1,
      melangeur: 1, // 120 ≥ seuil 80
    });
  });
  it("calcule un composant à partir d'un autre, dans le bon ordre même s'il est listé avant", () => {
    const ordre = PLANCHER_CHAUFFANT_FICTIF.composants.map((c) => c.cle);
    expect(ordre.indexOf("agrafes")).toBeLessThan(ordre.indexOf("tuyau"));
    expect(inserer().lignes.find((l) => l.cle === "agrafes")!.quantite).toBe(2000);
  });
  it("applique le minimum AVANT l'arrondi, pour rester un multiple du conditionnement", () => {
    const v = plancherChauffantFictif();
    v.composants.find((c) => c.cle === "agrafes")!.quantiteMin = 2900;
    const q = calculerQuantites(v.composants, 120, new Set(), SAISIES);
    expect(q.get("agrafes")!.quantite).toBe(3000);
  });
  it("explique chaque étape du calcul", () => {
    const detail = inserer().lignes.find((l) => l.cle === "isolant")!.detailCalcul;
    expect(detail).toMatch(/120 × 1/);
    expect(detail).toMatch(/5 % de perte/);
    expect(detail).toMatch(/multiple supérieur de 10/);
    expect(detail).toMatch(/130 m²$/);
  });
  it("respecte les conditions d'inclusion : seuil et options", () => {
    const petit = inserer(60);
    expect(petit.lignes.map((l) => l.cle)).not.toContain("melangeur");
    expect(inserer(120, ["collecteur", "mise_en_chauffe"]).lignes.map((l) => l.cle)).toContain("mise_en_chauffe");
    expect(inserer(120, []).lignes.map((l) => l.cle)).not.toContain("collecteur");
    const q = calculerQuantites(PLANCHER_CHAUFFANT_FICTIF.composants, 60, new Set(), SAISIES);
    expect(q.get("melangeur")!.motifExclusion).toMatch(/à partir de 80/);
  });
  it("signale une saisie attendue et non faite, sans inventer de valeur", () => {
    const issue = instancierOuvrage(plancherChauffantFictif(), { cle: "i", ordre: 1, quantitePrincipale: 120 });
    if (issue.etat !== "pret") throw new Error(issue.motif);
    expect(issue.saisiesManquantes).toEqual(["bande"]);
    expect(issue.instance.lignes.find((l) => l.cle === "bande")!.quantite).toBe(0);
  });
});

describe("15. modification d'un composant dans le devis", () => {
  it("une quantité saisie à la main est forcée et survit au recalcul", () => {
    const i = modifierLigne(inserer(), "isolant", { quantite: 128 });
    expect(i.lignes.find((l) => l.cle === "isolant")).toMatchObject({ quantite: 128, quantiteForcee: true });
    const j = recalculerInstance(i, { quantitePrincipale: 200 });
    expect(j.lignes.find((l) => l.cle === "isolant")!.quantite).toBe(128);
    expect(j.lignes.find((l) => l.cle === "main_oeuvre")!.quantite).toBe(70);
  });
  it("modifier un coefficient relance le calcul, y compris des composants qui en dépendent", () => {
    const i = modifierLigne(inserer(), "tuyau", { coefficient: 8 });
    // 120 × 8 = 960 + 3 % = 988,8 → 1000 ml ; agrafes 1000 × 2 = 2000 → 2000
    expect(quantites(i)).toMatchObject({ tuyau: 1000, agrafes: 2000 });
    const j = modifierLigne(inserer(), "isolant", { pertePct: 0 });
    expect(quantites(j).isolant).toBe(120);
  });
  it("ajoute et retire des composants ; refuse de retirer une base dont un autre dépend", () => {
    let i = ajouterLigne(inserer(), { cle: "sonde", designation: "Sonde (fictif)", unite: "u", nature: "materiel", quantite: 2, prixVenteHt: 35, tauxTva: 20 });
    expect(i.lignes.find((l) => l.cle === "sonde")).toMatchObject({ origine: "ajout_manuel", quantite: 2, type: "fourniture" });
    i = retirerLigne(i, "consommables");
    expect(i.lignes.map((l) => l.cle)).not.toContain("consommables");
    expect(() => retirerLigne(i, "tuyau")).toThrow(/calculé à partir de ce composant/);
  });
  it("ne modifie jamais l'instance d'origine en place", () => {
    const i = inserer();
    const avant = JSON.stringify(i);
    modifierLigne(i, "isolant", { quantite: 1, prixVenteHt: 1 });
    ajouterLigne(i, { cle: "x", designation: "X", unite: "u", nature: "libre", quantite: 1, prixVenteHt: 1, tauxTva: 20 });
    expect(JSON.stringify(i)).toBe(avant);
  });
});

describe("16–17. insertion complète et instantané", () => {
  it("insère tout l'ouvrage en une opération, avec ses montants", () => {
    const i = inserer();
    expect(i.lignes).toHaveLength(9);
    expect(montantsInstance(i)).toMatchObject({ venteHt: 8360, achatHt: 4734, lignesSansPrixAchat: [] });
  });
  it("l'instantané garde TOUS les composants du modèle mais AUCUN prix d'achat", () => {
    const i = inserer();
    expect(i.modele.composants).toHaveLength(10);
    const json = JSON.stringify(i.modele);
    expect(json).not.toMatch(/prixAchat/);
    expect(json).not.toContain('"4734"');
  });
  it("un prix d'achat masqué rend le coût inconnu, sans jamais l'inventer", () => {
    const i = modifierLigne(inserer(), "isolant", { prixAchatHt: null });
    expect(montantsInstance(i)).toMatchObject({ achatHt: null, lignesSansPrixAchat: ["isolant"] });
  });
  it("refuse un ouvrage archivé sans confirmation explicite", () => {
    const v = { ...plancherChauffantFictif(), statut: "archive" as const };
    expect(instancierOuvrage(v, { cle: "i", ordre: 1, quantitePrincipale: 10, saisies: SAISIES }).etat).toBe("refuse");
    expect(instancierOuvrage(v, { cle: "i", ordre: 1, quantitePrincipale: 10, saisies: SAISIES, confirmeArchive: true }).etat).toBe("pret");
  });
});

describe("18. modification ultérieure du modèle", () => {
  it("modifier la bibliothèque ne modifie JAMAIS un devis existant", () => {
    const modele = plancherChauffantFictif();
    const issue = instancierOuvrage(modele, { cle: "i", ordre: 1, quantitePrincipale: 120, saisies: SAISIES });
    if (issue.etat !== "pret") throw new Error(issue.motif);
    const avant = JSON.stringify(issue.instance);
    modele.nom = "Plancher chauffant v2";
    modele.composants[1].prixVenteHt = 999;
    modele.composants[1].coefficient = 3;
    modele.composants.pop();
    expect(JSON.stringify(issue.instance)).toBe(avant);
  });
  it("compare l'instance à une nouvelle version, sans rien modifier", () => {
    const i = modifierLigne(inserer(), "main_oeuvre", { quantite: 45 });
    const v2 = { ...plancherChauffantFictif(), version: 2 };
    v2.composants.find((c) => c.cle === "isolant")!.prixVenteHt = 23;
    v2.composants = v2.composants.filter((c) => c.cle !== "consommables");
    v2.composants.push({ ...v2.composants[0], cle: "film", ordre: 11, designation: "Film (fictif)", saisieRequise: false, coefficient: 1 });
    const avant = JSON.stringify(i);
    const cmp = comparerAvecVersion(i, v2);
    expect(JSON.stringify(i)).toBe(avant);
    expect(cmp.ajoutes.map((a) => a.cle)).toEqual(["film"]);
    expect(cmp.retires.map((r) => r.cle)).toEqual(["consommables"]);
    expect(cmp.modifies).toEqual([{ cle: "isolant", designation: "Isolant à plots (fictif)", changements: [{ champ: "prixVenteHt", avant: 21, apres: 23 }] }]);
    expect(cmp.modificationsManuelles).toEqual([{ cle: "main_oeuvre", champs: ["quantite"] }]);
    expect(cmp.venteHtApres).not.toBe(cmp.venteHtAvant);
  });
  it("ne réapplique qu'un devis en brouillon, et seulement sur confirmation", () => {
    const i = inserer();
    const v2 = { ...plancherChauffantFictif(), version: 2 };
    expect(reappliquerVersion(i, v2, { statutDevis: "envoye", confirmer: true, conserverModificationsManuelles: false }).etat).toBe("refuse");
    expect(reappliquerVersion(i, v2, { statutDevis: "brouillon", confirmer: false, conserverModificationsManuelles: false }).etat).toBe("refuse");
    const r = reappliquerVersion(i, v2, { statutDevis: "brouillon", confirmer: true, conserverModificationsManuelles: false });
    expect(r.etat).toBe("reapplique");
    if (r.etat === "reapplique") expect(r.instance.version).toBe(2);
  });
  it("conserve les modifications manuelles quand on le demande, les remplace sinon", () => {
    const i = modifierLigne(inserer(), "main_oeuvre", { quantite: 45 });
    const v2 = { ...plancherChauffantFictif(), version: 2 };
    const garde = reappliquerVersion(i, v2, { statutDevis: "brouillon", confirmer: true, conserverModificationsManuelles: true });
    const remplace = reappliquerVersion(i, v2, { statutDevis: "brouillon", confirmer: true, conserverModificationsManuelles: false });
    if (garde.etat !== "reapplique" || remplace.etat !== "reapplique") throw new Error("réapplication refusée");
    expect(quantites(garde.instance).main_oeuvre).toBe(45);
    expect(quantites(remplace.instance).main_oeuvre).toBe(42);
  });
  it("refuse de réappliquer un autre ouvrage", () => {
    const autre = { ...plancherChauffantFictif(), ouvrageId: "autre", version: 2 };
    expect(reappliquerVersion(inserer(), autre, { statutDevis: "brouillon", confirmer: true, conserverModificationsManuelles: false }).etat).toBe("refuse");
  });
});
