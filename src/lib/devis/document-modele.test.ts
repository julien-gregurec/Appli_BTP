import { describe, expect, it } from "vitest";
import { construireVueDocument, dateFr, normaliserStyle, MOTEUR_PRESENTATION_VERSION } from "@/lib/devis/document-modele";
import { resoudreFiligrane } from "@/lib/devis/filigrane";
import { lignesClient, totauxDevis } from "@/lib/devis/presentation";
import { sourceFictive } from "@/lib/devis/fixtures/document-fictif";

describe("modèle de présentation unique (moteur v2)", () => {
  it("construit la vue d'un devis brouillon à partir des éléments, sans second calcul", () => {
    const source = sourceFictive();
    const vue = construireVueDocument(source);
    expect(vue.moteurVersion).toBe(MOTEUR_PRESENTATION_VERSION);
    expect(vue.numero).toBe("BROUILLON");
    expect(vue.dateEmission).toBe("11/09/2026");
    expect(vue.dateSecondaire).toEqual({ libelle: "Valable jusqu’au", valeur: "11/10/2026" });
    expect(vue.lignes).toEqual(lignesClient(source.elements));
    expect(vue.totaux).toEqual(totauxDevis(source.elements, 0));
    expect(vue.bonPourAccord).toBe(true);
    expect(vue.mentions.join()).not.toMatch(/Pénalités/);
  });
  it("porte les mentions de facture et le bon pour accord seulement sur un devis", () => {
    const vue = construireVueDocument(sourceFictive({ typeDocument: "facture", statut: "envoyee", numero: "FAC-2026-001" }));
    expect(vue.mentions.join()).toMatch(/Pénalités de retard : 3× le taux d'intérêt légal · Indemnité forfaitaire de recouvrement : 40 €/);
    expect(vue.bonPourAccord).toBe(false);
  });
  it("imprime les montants ENREGISTRÉS et signale toute divergence au lieu de la masquer", () => {
    const source = sourceFictive();
    const calcules = totauxDevis(source.elements, 0);
    const fideles = construireVueDocument({ ...source, totauxEnregistres: { totalHt: calcules.totalHt, totalTva: calcules.totalTva, totalTtc: calcules.totalTtc } });
    expect(fideles.ecartTotaux).toBeNull();
    const faux = construireVueDocument({ ...source, totauxEnregistres: { totalHt: 1, totalTva: 0.2, totalTtc: 1.2 } });
    expect(faux.totauxAffiches.totalTtc).toBe(1.2);
    expect(faux.ecartTotaux).toMatch(/différents du calcul/);
  });
  it("décrit le document et son filigrane pour l'accessibilité", () => {
    const filigrane = resoudreFiligrane({ typeDocument: "devis", statut: "brouillon", document: { type: "texte", preset: "BROUILLON" } });
    expect(construireVueDocument(sourceFictive({ filigrane })).resumeAccessible).toMatch(/^Devis BROUILLON — Entreprise Fictive BTP — destinataire Client Fictif — total .* TTC — Filigrane : BROUILLON$/);
  });
  it("annonce un duplicata comme tel, en tête des mentions", () => {
    const vue = construireVueDocument(sourceFictive({
      typeDocument: "facture", statut: "payee", numero: "FAC-2026-004",
      duplicata: { numeroOriginal: "FAC-2026-004", dateEmissionOriginal: "2026-09-01" },
    }));
    expect(vue.mentions[0]).toBe("Duplicata de la facture n° FAC-2026-004 émise le 01/09/2026. L’original n’est pas modifié.");
  });
  it("n'expose ni coût, ni marge, ni information interne", () => {
    const json = JSON.stringify(construireVueDocument(sourceFictive({ mode: "eclate" })));
    for (const interdit of ["prixAchat", "marge", "detailCalcul", "descriptionInterne", "DONNÉES FICTIVES", "modificationsManuelles"]) {
      expect(json, interdit).not.toContain(interdit);
    }
  });
  it("assainit le style avec les valeurs par défaut du moteur v1", () => {
    expect(normaliserStyle(null)).toMatchObject({ police: "arial", taillePolice: 13, couleur: "#0d1b2a", couleurSecondaire: "#c9a24a", miseEnPage: "classique" });
    expect(normaliserStyle({ taillePolice: 40, couleur: "rouge", police: "comic" as never })).toMatchObject({ taillePolice: 13, couleur: "#0d1b2a", police: "arial" });
  });
  it("formate une date sans fuseau horaire, et laisse passer une valeur inattendue", () => {
    expect(dateFr("2026-01-02T23:30:00Z")).toBe("02/01/2026");
    expect(dateFr(null)).toBe("");
    expect(dateFr("demain")).toBe("demain");
  });
});

describe("GP V1, lot G — références et CGV", () => {
  it("imprime les références du document en en-tête, seulement celles qui existent", () => {
    const vue = construireVueDocument(sourceFictive({ references: { interne: "DEV-0007", client: null, chantierNom: "Maison Dupont", chantierReference: "CH-0003", chantierAdresse: "12 rue des Lilas 00000 Ville" } }));
    expect(vue.references).toEqual([
      { libelle: "Réf. interne", valeur: "DEV-0007" },
      { libelle: "Chantier", valeur: "CH-0003 — Maison Dupont" },
      { libelle: "Adresse du chantier", valeur: "12 rue des Lilas 00000 Ville" },
    ]);
    expect(construireVueDocument(sourceFictive()).references).toEqual([]);
  });
  it("découpe les CGV en paragraphes sur un devis, jamais sur une facture", () => {
    const cgv = "Article 1\nObjet.\n\n\nArticle 2 — Prix.\r\n\r\n  ";
    expect(construireVueDocument(sourceFictive({ cgv })).cgv).toEqual(["Article 1\nObjet.", "Article 2 — Prix."]);
    expect(construireVueDocument(sourceFictive({ typeDocument: "facture", titre: "Facture", cgv })).cgv).toEqual([]);
  });
  it("les références des lignes ne s'impriment que si l'entreprise le demande (faux par défaut)", () => {
    expect(construireVueDocument(sourceFictive()).style.afficherReferences).toBe(false);
    expect(construireVueDocument(sourceFictive({ style: { afficherReferences: true } })).style.afficherReferences).toBe(true);
  });
});
