import { describe, expect, it } from "vitest";
import { etatDepuisBase, type LigneDevisBase, type OuvrageDevisBase } from "@/lib/devis/brouillon-v2";
import { payloadEnregistrementV2, type EnteteDevisV2 } from "@/lib/devis/enregistrement-v2";
import { modifierLigne, type InstanceOuvrage } from "@/lib/devis/ouvrages";
import { lignesClient, totauxDevis, type ElementDevis } from "@/lib/devis/presentation";
import { proposerPrixGlobal } from "@/lib/devis/prix";
import { elementsFictifs } from "@/lib/devis/fixtures/document-fictif";

const ENTETE: EnteteDevisV2 = {
  client_id: "c", chantier_id: null, date_emission: null, date_validite: null, conditions: null,
  notes_client: null, notes_internes: null, remise_globale: 0, filigrane: null,
};

function etatComplet(): { elements: ElementDevis[]; origines: Record<string, { origine: "catalogue"; sourceCatalogue: "prestation"; sourceId: string; referenceInterne: string; referenceFabricant: null; prixAchatHt: number }> } {
  const elements = elementsFictifs({ lignesLibres: 3, mode: "personnalise" });
  const ouvrage = elements.find((e) => e.type === "ouvrage")! as Extract<ElementDevis, { type: "ouvrage" }>;
  let instance: InstanceOuvrage = modifierLigne(ouvrage.instance, "main_oeuvre", { quantite: 45 });
  instance = modifierLigne(instance, "tuyau", { pertePct: 5, afficherPrix: false });
  const p = proposerPrixGlobal(instance, 8200, "ajustement", { statutDevis: "brouillon" });
  if (p.etat !== "propose") throw new Error(p.etat);
  return {
    elements: elements.map((e) => (e.type === "ouvrage" ? { ...e, instance: p.instance } : e)),
    origines: { l1: { origine: "catalogue", sourceCatalogue: "prestation", sourceId: "prest-1", referenceInterne: "BA13-200", referenceFabricant: null, prixAchatHt: 12 } },
  };
}

/** Ce que la base rend après `enregistrer_devis_brouillon_v2` : les lignes et ouvrages tels qu'envoyés. */
function commeEnBase(etat: ReturnType<typeof etatComplet>) {
  const p = payloadEnregistrementV2(ENTETE, etat.elements, { inclureCouts: true, origines: etat.origines });
  const couts = Object.fromEntries(p.p_couts.map((c) => [c.cle_ligne, c.prix_achat_ht]));
  return {
    payload: p,
    lignes: p.p_lignes as unknown as LigneDevisBase[],
    ouvrages: p.p_ouvrages as unknown as OuvrageDevisBase[],
    couts,
  };
}

describe("rouvrir un brouillon enregistré", () => {
  it("rend EXACTEMENT le même appel d'enregistrement : rien ne se perd à la réouverture", () => {
    const base = commeEnBase(etatComplet());
    const rouvert = etatDepuisBase(base.lignes, base.ouvrages, base.couts);
    const renvoye = payloadEnregistrementV2(ENTETE, rouvert.elements, { inclureCouts: true, origines: rouvert.origines });
    expect(renvoye).toEqual(base.payload);
  });
  it("garde les quantités forcées, les paramètres de calcul et les modifications manuelles", () => {
    const base = commeEnBase(etatComplet());
    const rouvert = etatDepuisBase(base.lignes, base.ouvrages, base.couts);
    const ouvrage = rouvert.elements.find((e) => e.type === "ouvrage")! as Extract<ElementDevis, { type: "ouvrage" }>;
    expect(ouvrage.instance.lignes.find((l) => l.cle === "main_oeuvre")).toMatchObject({ quantite: 45, quantiteForcee: true });
    expect(ouvrage.instance.lignes.find((l) => l.cle === "tuyau")).toMatchObject({ pertePct: 5, afficherPrix: false });
    expect(ouvrage.instance.modificationsManuelles.main_oeuvre).toEqual(["quantite"]);
    expect(ouvrage.instance.lignes.find((l) => l.origine === "ajustement")).toMatchObject({ motifAjustement: "ajustement_prix_global", prixAchatHt: null });
  });
  it("rend les mêmes lignes client et les mêmes totaux", () => {
    const etat = etatComplet();
    const base = commeEnBase(etat);
    const rouvert = etatDepuisBase(base.lignes, base.ouvrages, base.couts);
    expect(lignesClient(rouvert.elements)).toEqual(lignesClient(etat.elements));
    expect(totauxDevis(rouvert.elements, 3)).toEqual(totauxDevis(etat.elements, 3));
  });
  it("ne rend aucun coût quand l'utilisateur ne peut pas les voir", () => {
    const base = commeEnBase(etatComplet());
    const rouvert = etatDepuisBase(base.lignes, base.ouvrages, {});
    expect(JSON.stringify(rouvert)).not.toMatch(/"prixAchatHt":\d/);
  });
  it("ouvre un brouillon historique (lignes sans ouvrage ni origine) comme des lignes libres saisies", () => {
    const historique: LigneDevisBase = {
      cle_ligne: "h1", ouvrage_cle: null, ordre: 0, designation: "Ligne historique", description: null, type: "forfait",
      quantite: "2", unite: "u", prix_unitaire_ht: "10.5", remise_ligne: "0", taux_tva: "20", origine_ligne: null,
      source_catalogue: null, source_id: null, reference_interne_instantane: null, reference_fabricant_instantane: null,
      nature: null, parametres_quantite: null, quantite_forcee: null, visible_client: null, afficher_quantite: null,
      afficher_prix: null, description_client_personnalisee: null, motif_ajustement: null, detail_calcul: null,
    };
    const etat = etatDepuisBase([historique], []);
    expect(etat.elements[0]).toMatchObject({ type: "ligne", ordre: 1, ligne: { quantite: 2, prixUnitaireHt: 10.5 } });
    expect(etat.origines.h1.origine).toBe("saisie");
  });
});
