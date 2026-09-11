import { describe, expect, it } from "vitest";
import type { LigneDevisBase, OuvrageDevisBase } from "@/lib/devis/brouillon-v2";
import type { PrestationBase } from "@/lib/devis/catalogue-base";
import { catalogueCsvDepuisBase, droitsExportDevis, lignesDevisCsvDepuisBase, nomFichierCsv } from "@/lib/devis/exports-csv";
import type { InstantaneModele } from "@/lib/devis/ouvrages";

// Toutes les données sont FICTIVES.

/** Lecteur minimal du format de `csv()` : BOM, `;`, guillemets doublés, fins de ligne CRLF. */
function enregistrements(texte: string): Record<string, string>[] {
  expect(texte.startsWith("\uFEFF")).toBe(true);
  const t = texte.slice(1);
  const lignes: string[][] = [];
  let champ = "";
  let ligne: string[] = [];
  let guillemets = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guillemets) {
      if (c === '"' && t[i + 1] === '"') { champ += '"'; i++; }
      else if (c === '"') guillemets = false;
      else champ += c;
    } else if (c === '"') guillemets = true;
    else if (c === ";") { ligne.push(champ); champ = ""; }
    else if (c === "\r" && t[i + 1] === "\n") { i++; ligne.push(champ); lignes.push(ligne); ligne = []; champ = ""; }
    else champ += c;
  }
  const [entete, ...corps] = lignes;
  return corps.map((l) => Object.fromEntries(entete.map((e, i) => [e, l[i]])));
}

const entete = (texte: string) => texte.slice(1).split("\r\n")[0].split(";").map((c) => c.replace(/"/g, ""));

describe("nomFichierCsv", () => {
  it("ne garde que des caractères sûrs pour Content-Disposition", () => {
    expect(nomFichierCsv("devis-DEV/2026 «001»-lignes")).toBe("devis-DEV-2026-001-lignes.csv");
    expect(nomFichierCsv("catalogue Électricité")).toBe("catalogue-Electricite.csv");
    expect(nomFichierCsv('a"b\r\nc')).toBe("a-b-c.csv");
  });

  it("jamais vide ni démesuré", () => {
    expect(nomFichierCsv("")).toBe("export.csv");
    expect(nomFichierCsv("«»")).toBe("export.csv");
    expect(nomFichierCsv("x".repeat(300))).toBe(`${"x".repeat(80)}.csv`);
  });
});

describe("droitsExportDevis", () => {
  it("les coûts exigent voir_couts_devis ET l'accès aux devis", () => {
    expect(droitsExportDevis(null)).toEqual({ acces: true, voirCouts: true });
    expect(droitsExportDevis(["acces_devis"])).toEqual({ acces: true, voirCouts: false });
    expect(droitsExportDevis(["voir_couts_devis"])).toEqual({ acces: false, voirCouts: false });
    expect(droitsExportDevis(["acces_devis", "voir_couts_devis"])).toEqual({ acces: true, voirCouts: true });
  });
});

const prestation = (p: Partial<PrestationBase> & { id: string; designation: string }): PrestationBase => ({
  description: null, unite: "u", prix_unitaire_ht: "10.00", taux_tva: "20.00", actif: true, reference_interne: null,
  reference_fabricant: null, code_barres: null, fabricant: null, fournisseur_id: null, categorie: null, ...p,
});

describe("catalogueCsvDepuisBase", () => {
  const prestations = [
    prestation({ id: "p2", designation: "Vis (fictif)", reference_interne: "VIS", fournisseur_id: "f1" }),
    prestation({ id: "p1", designation: "Étai (fictif)", reference_interne: "ETAI", actif: false }),
  ];
  const fournisseurs = [{ id: "f1", nom: "Négoce (fictif)", reference: "FRN-001" }];
  const couts = [{ prestation_id: "p2", prix_achat_ht: "4.5" }];

  it("sans le droit, la colonne du prix d'achat n'existe pas, même si des coûts sont fournis", () => {
    const texte = catalogueCsvDepuisBase(prestations, fournisseurs, couts, { inclurePrixAchat: false });
    expect(entete(texte)).not.toContain("prix_achat_ht");
    expect(texte).not.toContain("4,50");
  });

  it("avec le droit, le prix d'achat vient en dernier ; fournisseur par son nom ; tri par désignation", () => {
    const texte = catalogueCsvDepuisBase(prestations, fournisseurs, couts, { inclurePrixAchat: true });
    expect(entete(texte).at(-1)).toBe("prix_achat_ht");
    const lignes = enregistrements(texte);
    expect(lignes.map((l) => l.reference_interne)).toEqual(["ETAI", "VIS"]);
    expect(lignes[1]).toMatchObject({ fournisseur: "Négoce (fictif)", prix_achat_ht: "4,50", actif: "oui" });
    expect(lignes[0]).toMatchObject({ prix_achat_ht: "", actif: "non" });
  });
});

const ligne = (p: Partial<LigneDevisBase> & { cle_ligne: string; designation: string }): LigneDevisBase => ({
  ouvrage_cle: null, ordre: 1, description: null, type: "fourniture", quantite: "1", unite: "u", prix_unitaire_ht: "10",
  remise_ligne: "0", taux_tva: "20", origine_ligne: "saisie", source_catalogue: null, source_id: null,
  reference_interne_instantane: null, reference_fabricant_instantane: null, nature: null, parametres_quantite: null,
  quantite_forcee: null, visible_client: null, afficher_quantite: null, afficher_prix: null,
  description_client_personnalisee: null, motif_ajustement: null, detail_calcul: null, ...p,
});

describe("lignesDevisCsvDepuisBase", () => {
  const lignes: LigneDevisBase[] = [
    ligne({ cle_ligne: "L1", ordre: 1, designation: "Déplacement (fictif)", type: "deplacement", unite: "forfait", prix_unitaire_ht: "45" }),
    ligne({
      cle_ligne: "O1:c1", ouvrage_cle: "O1", ordre: 1, designation: "Tube PER (fictif)", quantite: "22", unite: "ml",
      prix_unitaire_ht: "3.5", origine_ligne: "modele", source_catalogue: "prestation", source_id: "p1",
      reference_interne_instantane: "PER-16", reference_fabricant_instantane: "FAB-PER16",
    }),
  ];
  const ouvrages: OuvrageDevisBase[] = [{
    cle: "O1", ordre: 2, ouvrage_id: "ov1", ouvrage_version: 3, ouvrage_reference: "OUV-PLC", ouvrage_nom: "Plancher chauffant (fictif)",
    categorie: null, unite_principale: "m²", quantite_principale: "20", options: [], saisies: {}, libelle_client: "Plancher chauffant",
    description_client: null, mode_presentation: "regroupe", instantane_modele: {} as unknown as InstantaneModele, modifications_manuelles: {},
  }];
  const couts = [{ cle_ligne: "O1:c1", prix_achat_ht: "1.2" }];

  it("exporte lignes libres et composants avec la référence, le nom et la version de l'ouvrage", () => {
    const texte = lignesDevisCsvDepuisBase(lignes, ouvrages, couts, { inclureCouts: false });
    expect(entete(texte)).toEqual(expect.arrayContaining(["ouvrage_reference", "ouvrage_nom", "ouvrage_version"]));
    expect(entete(texte)).not.toContain("prix_achat_ht");
    const [libre, composant] = enregistrements(texte);
    expect(libre).toMatchObject({ ordre: "1", ouvrage_reference: "", designation: "Déplacement (fictif)", total_ht: "45,00" });
    expect(composant).toMatchObject({
      ordre: "2", ouvrage_reference: "OUV-PLC", ouvrage_nom: "Plancher chauffant (fictif)", ouvrage_version: "3",
      reference_interne: "PER-16", reference_fabricant: "FAB-PER16", quantite: "22,00", total_ht: "77,00",
    });
  });

  it("les coûts n'apparaissent qu'avec le droit ; vides pour une ligne libre", () => {
    const [libre, composant] = enregistrements(lignesDevisCsvDepuisBase(lignes, ouvrages, couts, { inclureCouts: true }));
    expect(composant.prix_achat_ht).toBe("1,20");
    expect(libre.prix_achat_ht).toBe("");
  });
});
