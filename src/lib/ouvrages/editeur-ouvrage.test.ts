import { describe, expect, it } from "vitest";
import { validerVersion } from "@/lib/devis/ouvrages";
import { plancherChauffantFictif } from "@/lib/devis/fixtures/plancher-chauffant-fictif";
import {
  cleUnique,
  clesReservees,
  dependantsDirects,
  deplacer,
  formulaireVersVersion,
  lireNombre,
  nouveauComposant,
  optionsBase,
  optionsDeclarees,
  payloadPublication,
  retirerCouts,
  simulerOuvrage,
  slugCle,
  versionVersFormulaire,
  type MetaVersion,
} from "@/lib/ouvrages/editeur-ouvrage";

const meta = (v = plancherChauffantFictif()): MetaVersion => ({
  ouvrageId: v.ouvrageId, entrepriseId: v.entrepriseId, version: v.version, statut: v.statut,
  auteur: v.auteur, creeLe: v.creeLe, modifieLe: v.modifieLe,
});

describe("lireNombre", () => {
  it("accepte la virgule et le point, ignore les espaces", () => {
    expect(lireNombre("6,5")).toBe(6.5);
    expect(lireNombre(" 1 250.75 ")).toBe(1250.75);
    expect(lireNombre("0")).toBe(0);
  });
  it("vide → null ; illisible → NaN (jamais une valeur inventée)", () => {
    expect(lireNombre("")).toBeNull();
    expect(lireNombre("   ")).toBeNull();
    expect(lireNombre("abc")).toBeNaN();
    expect(lireNombre("1,2,3")).toBeNaN();
  });
});

describe("clés de composants", () => {
  it("dérive une clé lisible, sans accents ni ligatures", () => {
    expect(slugCle("Main-d’œuvre de pose")).toBe("main_d_oeuvre_de_pose");
    expect(slugCle("Tube PER 16 (fictif)")).toBe("tube_per_16_fictif");
    expect(slugCle("   ")).toBe("composant");
    expect(slugCle("É".repeat(80)).length).toBeLessThanOrEqual(40);
  });
  it("rend une clé unique dans la version", () => {
    const prises = new Set(["isolant", "isolant_2"]);
    expect(cleUnique("isolant", prises)).toBe("isolant_3");
    expect(cleUnique("tuyau", prises)).toBe("tuyau");
  });
  it("ne réattribue jamais une clé de la version chargée, même retirée", () => {
    const f = versionVersFormulaire(plancherChauffantFictif(), { inclureCouts: true });
    const initiales = f.composants.map((c) => c.cle);
    const restants = f.composants.filter((c) => c.cle !== "isolant");
    const c = nouveauComposant("Isolant", clesReservees(restants, initiales));
    expect(c.cle).toBe("isolant_2");
  });
  it("la clé ne suit pas la désignation une fois le composant créé", () => {
    const f = versionVersFormulaire(plancherChauffantFictif(), { inclureCouts: true });
    f.composants[0] = { ...f.composants[0], designation: "Tout autre libellé" };
    const v = formulaireVersVersion(f, meta(), { inclureCouts: true });
    expect(v.composants[0].cle).toBe("bande");
  });
});

describe("formulaire ↔ version", () => {
  it("un aller-retour sans modification redonne la même version (ordre compris)", () => {
    const source = plancherChauffantFictif();
    const v = formulaireVersVersion(versionVersFormulaire(source, { inclureCouts: true }), meta(source), { inclureCouts: true });
    const tri = [...source.composants].sort((a, b) => a.ordre - b.ordre).map((c, i) => ({ ...c, ordre: i + 1 }));
    expect(v.composants).toEqual(tri);
    expect(v.nom).toBe(source.nom);
    expect(v.quantitePrincipale).toBe(100);
    expect(validerVersion(v)).toEqual([]);
  });
  it("retirerCouts vide chaque prix d'achat sans toucher au reste ni à l'original", () => {
    const source = plancherChauffantFictif();
    const v = retirerCouts(source);
    expect(v.composants.every((c) => c.prixAchatHt === null)).toBe(true);
    expect(v.composants.map((c) => c.prixVenteHt)).toEqual(source.composants.map((c) => c.prixVenteHt));
    expect(source.composants[0].prixAchatHt).toBe(0.9);
  });
  it("sans droit de lecture des coûts, aucun prix d'achat n'entre dans le formulaire", () => {
    const f = versionVersFormulaire(plancherChauffantFictif(), { inclureCouts: false });
    expect(f.composants.every((c) => c.prixAchatHt === "")).toBe(true);
  });
  it("sans droit de gérer les coûts, la publication ne transporte aucun prix d'achat", () => {
    const f = versionVersFormulaire(plancherChauffantFictif(), { inclureCouts: true });
    const v = formulaireVersVersion(f, meta(), { inclureCouts: false });
    expect(v.composants.every((c) => c.prixAchatHt === null)).toBe(true);
    expect(Object.keys(payloadPublication(v)).sort()).toEqual(
      ["categorie", "composants", "descriptionClient", "descriptionInterne", "nom", "quantitePrincipale", "referenceInterne", "unitePrincipale"],
    );
  });
  it("garde les trois références et les textes distincts ; vide → null", () => {
    const f = versionVersFormulaire(null, { inclureCouts: false });
    const c = { ...nouveauComposant("Colle", new Set()), referenceInterne: " RI-1 ", referenceFabricant: "", fabricant: "  " };
    const v = formulaireVersVersion({ ...f, nom: "Test", unitePrincipale: "m²", composants: [c] }, meta(), { inclureCouts: false });
    expect(v.composants[0].referenceInterne).toBe("RI-1");
    expect(v.composants[0].referenceFabricant).toBeNull();
    expect(v.composants[0].fabricant).toBeNull();
  });
  it("une saisie invalide reste invalide et est signalée par validerVersion", () => {
    const f = versionVersFormulaire(plancherChauffantFictif(), { inclureCouts: true });
    f.composants[1] = { ...f.composants[1], coefficient: "un et demi" };
    f.quantitePrincipale = "";
    const erreurs = validerVersion(formulaireVersVersion(f, meta(), { inclureCouts: true }));
    expect(erreurs).toContain("La quantité principale doit être strictement positive.");
    expect(erreurs.some((e) => e.includes("coefficient invalide"))).toBe(true);
  });
  it("option sans clé : la clé est déduite du libellé", () => {
    const f = versionVersFormulaire(null, { inclureCouts: false });
    const c = { ...nouveauComposant("Collecteur", new Set()), conditionType: "option" as const, optionCle: "", optionLibelle: "Collecteur fourni" };
    const v = formulaireVersVersion({ ...f, nom: "T", unitePrincipale: "u", composants: [c] }, meta(), { inclureCouts: false });
    expect(v.composants[0].condition).toEqual({ type: "option", cle: "collecteur_fourni", libelle: "Collecteur fourni", parDefaut: true });
  });
});

describe("liste des composants", () => {
  it("déplace vers le haut et vers le bas, sans sortir des bornes", () => {
    expect(deplacer(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(deplacer(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(deplacer(["a", "b", "c"], 0, -1)).toEqual(["a", "b", "c"]);
    expect(deplacer(["a", "b", "c"], 2, 1)).toEqual(["a", "b", "c"]);
  });
  it("les bases proposées excluent le composant et ceux qui dépendent de lui", () => {
    const f = versionVersFormulaire(plancherChauffantFictif(), { inclureCouts: false });
    const pourTuyau = optionsBase(f.composants, "tuyau").map((o) => o.valeur);
    expect(pourTuyau[0]).toBeNull();
    expect(pourTuyau).not.toContain("tuyau");
    expect(pourTuyau).not.toContain("agrafes");
    expect(pourTuyau).toContain("isolant");
    expect(optionsBase(f.composants, "agrafes").map((o) => o.valeur)).toContain("tuyau");
    expect(optionsBase(f.composants, "agrafes").find((o) => o.valeur === "tuyau")?.libelle).toContain("Tube PER 16");
  });
  it("repère les composants calculés à partir d'un autre", () => {
    const f = versionVersFormulaire(plancherChauffantFictif(), { inclureCouts: false });
    expect(dependantsDirects(f.composants, "tuyau").map((c) => c.cle)).toEqual(["agrafes"]);
    expect(dependantsDirects(f.composants, "isolant")).toEqual([]);
  });
  it("liste les options déclarées une seule fois", () => {
    expect(optionsDeclarees(plancherChauffantFictif())).toEqual([
      { cle: "collecteur", libelle: "Collecteur fourni", parDefaut: true },
      { cle: "mise_en_chauffe", libelle: "Mise en chauffe", parDefaut: false },
    ]);
  });
});

describe("simulation", () => {
  const entree = { quantitePrincipale: 100, options: ["collecteur"], saisies: { bande: 40 } };

  it("calcule chaque composant avec son détail, et les inclus/exclus", () => {
    const r = simulerOuvrage(plancherChauffantFictif(), entree, { peutVoirCouts: true });
    if (r.etat !== "calcule") throw new Error("simulation refusée");
    const parCle = new Map(r.lignes.map((l) => [l.cle, l]));
    expect(parCle.get("isolant")!.quantite).toBe(110);
    expect(parCle.get("isolant")!.detail).toContain("5 % de perte");
    expect(parCle.get("tuyau")!.quantite).toBe(700);
    expect(parCle.get("agrafes")!.quantite).toBe(1500);
    expect(parCle.get("mise_en_chauffe")!.inclus).toBe(false);
    expect(parCle.get("mise_en_chauffe")!.venteHt).toBeNull();
    expect(parCle.get("isolant")!.venteHt).toBe(2310);
    expect(r.saisiesManquantes).toEqual([]);
    expect(r.indicateurs.coutAchatHt).not.toBeNull();
    expect(r.indicateurs.tauxMarquePct).not.toBeNull();
  });
  it("signale une saisie attendue non faite", () => {
    const r = simulerOuvrage(plancherChauffantFictif(), { ...entree, saisies: {} }, { peutVoirCouts: true });
    expect(r.etat === "calcule" && r.saisiesManquantes).toEqual(["bande"]);
  });
  it("sans droit de voir les coûts : ni coût, ni marge, ni avertissement sur les coûts", () => {
    const r = simulerOuvrage(plancherChauffantFictif(), entree, { peutVoirCouts: false, seuilTauxMarquePct: 99 });
    if (r.etat !== "calcule") throw new Error("simulation refusée");
    expect(r.indicateurs.coutAchatHt).toBeNull();
    expect(r.indicateurs.margeHt).toBeNull();
    expect(r.indicateurs.tauxMargePct).toBeNull();
    expect(r.indicateurs.tauxMarquePct).toBeNull();
    expect(r.avertissements.map((a) => a.code)).not.toContain("cout_inconnu");
    expect(r.avertissements.map((a) => a.code)).not.toContain("marge_sous_seuil");
    expect(r.indicateurs.prixVenteRetenuHt).toBeGreaterThan(0);
  });
  it("avertit sous le seuil de taux de marque configuré", () => {
    const r = simulerOuvrage(plancherChauffantFictif(), entree, { peutVoirCouts: true, seuilTauxMarquePct: 99 });
    expect(r.etat === "calcule" && r.avertissements.map((a) => a.code)).toContain("marge_sous_seuil");
  });
  it("une version invalide n'est pas simulée : ses erreurs sont rendues", () => {
    const v = { ...plancherChauffantFictif(), nom: " " };
    const r = simulerOuvrage(v, entree, { peutVoirCouts: true });
    expect(r).toEqual({ etat: "invalide", erreurs: ["L’ouvrage doit porter un nom."] });
  });
  it("une boucle de dépendances est refusée sans exception", () => {
    const v = plancherChauffantFictif();
    v.composants = v.composants.map((c) => (c.cle === "tuyau" ? { ...c, base: { type: "composant", cle: "agrafes" } } : c));
    const r = simulerOuvrage(v, entree, { peutVoirCouts: true });
    expect(r.etat).toBe("invalide");
  });
});
