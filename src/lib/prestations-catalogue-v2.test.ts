import { describe, expect, it } from "vitest";
import { correspondRecherche, lireChampsCatalogueV2, lirePrixAchat } from "@/lib/prestations-catalogue-v2";

const formulaire = (valeurs: Record<string, string>) => (nom: string) => valeurs[nom] ?? null;

describe("lireChampsCatalogueV2", () => {
  it("rogne, vide → null, et garde les trois références strictement séparées", () => {
    const r = lireChampsCatalogueV2(formulaire({
      reference_interne: "  RI-001 ",
      reference_fabricant: "",
      code_barres: " 3760000000017 ",
      fabricant: "   ",
      categorie: "Plâtrerie",
    }));
    expect(r).toEqual({
      valeurs: {
        reference_interne: "RI-001",
        reference_fabricant: null,
        code_barres: "3760000000017",
        fabricant: null,
        fournisseur_id: null,
        categorie: "Plâtrerie",
        famille_id: null,
        notes_internes: null,
      },
    });
  });
  it("lit la famille et les notes internes (GP V1, lot B)", () => {
    const famille = "0b9f2c1e-8d7a-4c3b-9e2f-1a2b3c4d5e6f";
    const r = lireChampsCatalogueV2(formulaire({ famille_id: famille, notes_internes: "  À commander 48 h avant  " }));
    expect("valeurs" in r && r.valeurs.famille_id).toBe(famille);
    expect("valeurs" in r && r.valeurs.notes_internes).toBe("À commander 48 h avant");
    expect(lireChampsCatalogueV2(formulaire({ famille_id: "pas-un-uuid" }))).toEqual({ erreur: "Famille invalide." });
    expect(lireChampsCatalogueV2(formulaire({ notes_internes: "n".repeat(2001) }))).toEqual({ erreur: "Les notes internes dépassent 2000 caractères." });
  });
  it("ne recopie jamais une référence dans une autre", () => {
    const r = lireChampsCatalogueV2(formulaire({ reference_fabricant: "FAB-1" }));
    expect("valeurs" in r && r.valeurs.reference_interne).toBeNull();
    expect("valeurs" in r && r.valeurs.code_barres).toBeNull();
    expect("valeurs" in r && r.valeurs.reference_fabricant).toBe("FAB-1");
  });
  it("refuse les longueurs excessives (120, code-barres 64) en caractères", () => {
    expect(lireChampsCatalogueV2(formulaire({ reference_interne: "é".repeat(120) }))).toHaveProperty("valeurs");
    expect(lireChampsCatalogueV2(formulaire({ reference_interne: "x".repeat(121) }))).toEqual({ erreur: "La référence interne dépasse 120 caractères." });
    expect(lireChampsCatalogueV2(formulaire({ code_barres: "1".repeat(65) }))).toEqual({ erreur: "Le code-barres dépasse 64 caractères." });
    expect(lireChampsCatalogueV2(formulaire({ fabricant: "f".repeat(121) }))).toHaveProperty("erreur");
  });
  it("n'accepte qu'un identifiant de fournisseur bien formé", () => {
    expect(lireChampsCatalogueV2(formulaire({ fournisseur_id: "1; drop table" }))).toEqual({ erreur: "Fournisseur invalide." });
    const id = "0b9f2c1e-8d7a-4c3b-9e2f-1a2b3c4d5e6f";
    const r = lireChampsCatalogueV2(formulaire({ fournisseur_id: id }));
    expect("valeurs" in r && r.valeurs.fournisseur_id).toBe(id);
  });
  it("ignore une valeur qui n'est pas du texte (fichier, absent)", () => {
    const r = lireChampsCatalogueV2(() => ({ name: "fichier" }));
    expect("valeurs" in r && Object.values(r.valeurs).every((v) => v === null)).toBe(true);
  });
});

describe("lirePrixAchat", () => {
  it("vide → null (aucune écriture)", () => {
    expect(lirePrixAchat("")).toEqual({ valeur: null });
    expect(lirePrixAchat(null)).toEqual({ valeur: null });
  });
  it("accepte la virgule, arrondit à 4 décimales", () => {
    expect(lirePrixAchat("12,5")).toEqual({ valeur: 12.5 });
    expect(lirePrixAchat("0.123456")).toEqual({ valeur: 0.1235 });
  });
  it("refuse négatif, texte et dépassement", () => {
    expect(lirePrixAchat("-1")).toHaveProperty("erreur");
    expect(lirePrixAchat("douze")).toHaveProperty("erreur");
    expect(lirePrixAchat("100000000")).toHaveProperty("erreur");
  });
});

describe("correspondRecherche", () => {
  const ligne = { referenceInterne: "BA-13.200", referenceFabricant: "PLACO-BA13", designation: "Plaque de plâtre BA13", fabricant: "Placoplâtre" };
  it("recherche vide : tout correspond", () => expect(correspondRecherche(ligne, "  ")).toBe(true));
  it("références comparées sans casse, accents ni séparateurs", () => {
    expect(correspondRecherche(ligne, "ba 13 200")).toBe(true);
    expect(correspondRecherche(ligne, "placo-ba13")).toBe(true);
  });
  it("désignation et fabricant, sans accents", () => {
    expect(correspondRecherche(ligne, "platre")).toBe(true);
    expect(correspondRecherche(ligne, "PLACOPLATRE")).toBe(true);
  });
  it("plusieurs mots : chacun doit se trouver quelque part", () => {
    expect(correspondRecherche(ligne, "plaque placoplatre")).toBe(true);
    expect(correspondRecherche(ligne, "plaque carrelage")).toBe(false);
  });
  it("ne cherche pas ailleurs (description, prix)", () => {
    expect(correspondRecherche(ligne, "carrelage")).toBe(false);
  });
});
