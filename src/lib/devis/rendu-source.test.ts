import { describe, expect, it } from "vitest";
import { construireVueDocument } from "@/lib/devis/document-modele";
import { payloadEnregistrementV2, PAS_ORDRE, type EnteteDevisV2, type PayloadEnregistrementV2 } from "@/lib/devis/enregistrement-v2";
import { modifierLigne, type InstanceOuvrage } from "@/lib/devis/ouvrages";
import { lignesClient, totauxDevis, type ElementDevis } from "@/lib/devis/presentation";
import { proposerPrixGlobal } from "@/lib/devis/prix";
import { elementsDepuisRendu, MoteurNonV2, sourceDepuisRendu, type RenduDocument } from "@/lib/devis/rendu-source";
import { elementsFictifs } from "@/lib/devis/fixtures/document-fictif";

const ENTETE: EnteteDevisV2 = {
  client_id: "cli-1", chantier_id: null, date_emission: "2026-09-11", date_validite: "2026-10-11",
  conditions: "Conditions fictives", notes_client: null, notes_internes: "interne", remise_globale: 5, filigrane: null,
};

/**
 * Ce que la base renverra : les lignes et ouvrages enregistrés, triés par `ordre`, débarrassés des
 * colonnes internes exactement comme `ligne_pour_rendu` / `ouvrage_pour_rendu` (SQL proposé).
 */
function renduCommeLaBase(p: PayloadEnregistrementV2, surcharge: Partial<RenduDocument> = {}): RenduDocument {
  const t = totauxDevis(elementsDepuisRendu({
    ouvrages: p.p_ouvrages as unknown as RenduDocument["ouvrages"],
    lignes: p.p_lignes as unknown as RenduDocument["lignes"],
  }), p.p_devis.remise_globale);
  return {
    version: 1, moteur: 2, type_document: "devis", provenance: "apercu_brouillon", numero: null, statut: "brouillon",
    date_emission: p.p_devis.date_emission, date_validite: p.p_devis.date_validite, remise_globale: p.p_devis.remise_globale,
    montants: { ht: t.totalHt, tva: t.totalTva, ttc: t.totalTtc }, conditions: p.p_devis.conditions, notes_client: p.p_devis.notes_client,
    entreprise: { nom: "Entreprise Fictive", siret: "000", police_documents: "georgia", couleur_documents: "#123456" },
    client: { nom_affiche: "Client Fictif", adresse_facturation: "1 rue", code_postal: "00000", ville: "Ville", siret: null },
    filigrane: { type: "aucun" }, filigrane_document: p.p_devis.filigrane, filigranes_entreprise: null,
    ouvrages: [...p.p_ouvrages].sort((a, b) => a.ordre - b.ordre).map((o) => {
      const { instantane_modele: _m, modifications_manuelles: _mm, options: _o, saisies: _s, ouvrage_id: _i, ...reste } = o;
      void _m; void _mm; void _o; void _s; void _i;
      return reste as unknown as RenduDocument["ouvrages"][number];
    }),
    lignes: [...p.p_lignes].sort((a, b) => a.ordre - b.ordre).map((l) => {
      const { parametres_quantite: _p, detail_calcul: _d, quantite_forcee: _q, source_id: _s, ...reste } = l;
      void _p; void _d; void _q; void _s;
      return reste as unknown as RenduDocument["lignes"][number];
    }),
    ...surcharge,
  };
}

function elementsAvecAjustement(): ElementDevis[] {
  const elements = elementsFictifs({ lignesLibres: 3, mode: "personnalise" });
  const ouvrage = elements.find((e) => e.type === "ouvrage")! as Extract<ElementDevis, { type: "ouvrage" }>;
  let instance: InstanceOuvrage = modifierLigne(ouvrage.instance, "collecteur", { visibleClient: false });
  instance = modifierLigne(instance, "isolant", { afficherPrix: false, descriptionPersonnalisee: "Isolant sous chape" });
  const p = proposerPrixGlobal(instance, 8000, "ajustement", { statutDevis: "brouillon" });
  if (p.etat !== "propose") throw new Error(p.etat);
  return elements.map((e) => (e.type === "ouvrage" ? { ...e, instance: p.instance } : e));
}

describe("aller-retour éditeur → base → rendu", () => {
  it("relire un devis enregistré donne EXACTEMENT les mêmes lignes client et les mêmes totaux", () => {
    const elements = elementsAvecAjustement();
    const relus = elementsDepuisRendu(renduCommeLaBase(payloadEnregistrementV2(ENTETE, elements, { inclureCouts: false })));
    expect(lignesClient(relus)).toEqual(lignesClient(elements));
    expect(totauxDevis(relus, 5)).toEqual(totauxDevis(elements, 5));
  });
  it("donne le même document de bout en bout, dans les quatre modes", () => {
    for (const mode of ["regroupe", "semi_detaille", "eclate", "personnalise"] as const) {
      const elements = elementsFictifs({ lignesLibres: 4, mode });
      const rendu = renduCommeLaBase(payloadEnregistrementV2(ENTETE, elements, { inclureCouts: false }));
      const vue = construireVueDocument(sourceDepuisRendu(rendu, { nomProduit: "ELSATIA" }));
      expect(vue.lignes, mode).toEqual(lignesClient(elements));
      expect(vue.ecartTotaux, mode).toBeNull();
    }
  });
});

describe("appel d'enregistrement", () => {
  it("range éléments et composants dans un même espace d'ordre", () => {
    const p = payloadEnregistrementV2(ENTETE, elementsFictifs({ lignesLibres: 2 }), { inclureCouts: false });
    expect(p.p_lignes.filter((l) => !l.ouvrage_cle).map((l) => l.ordre)).toEqual([PAS_ORDRE, 2 * PAS_ORDRE]);
    expect(p.p_ouvrages[0].ordre).toBe(3 * PAS_ORDRE);
    const composants = p.p_lignes.filter((l) => l.ouvrage_cle === "ouv1").map((l) => l.ordre);
    expect(composants[0]).toBe(3 * PAS_ORDRE + 1);
    expect(composants).toEqual([...composants].sort((a, b) => a - b));
  });
  it("garde des clés de ligne STABLES d'un enregistrement à l'autre", () => {
    const elements = elementsFictifs({ lignesLibres: 2 });
    const a = payloadEnregistrementV2(ENTETE, elements, { inclureCouts: false }).p_lignes.map((l) => l.cle_ligne);
    const b = payloadEnregistrementV2(ENTETE, elements, { inclureCouts: false }).p_lignes.map((l) => l.cle_ligne);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
  });
  it("ne transmet les coûts que si l'utilisateur peut les gérer, et jamais pour un ajustement", () => {
    const elements = elementsAvecAjustement();
    expect(payloadEnregistrementV2(ENTETE, elements, { inclureCouts: false }).p_couts).toEqual([]);
    const avec = payloadEnregistrementV2(ENTETE, elements, { inclureCouts: true });
    expect(avec.p_couts.length).toBeGreaterThan(0);
    expect(avec.p_couts.some((c) => c.cle_ligne.includes("ajustement"))).toBe(false);
  });
  it("ne met aucun prix d'achat dans les lignes ni dans l'instantané du modèle", () => {
    const json = JSON.stringify({ ...payloadEnregistrementV2(ENTETE, elementsAvecAjustement(), { inclureCouts: true }), p_couts: [] });
    expect(json).not.toMatch(/prixAchat|prix_achat/);
  });
  it("distingue origine catalogue et saisie libre, avec les deux références figées", () => {
    const elements = elementsFictifs({ lignesLibres: 2, ouvrage: false });
    const p = payloadEnregistrementV2(ENTETE, elements, {
      inclureCouts: false,
      origines: { l1: { sourceCatalogue: "prestation", sourceId: "prest-1", referenceInterne: "BA13-200", referenceFabricant: "PLACO-4521" } },
    });
    expect(p.p_lignes[0]).toMatchObject({ origine_ligne: "catalogue", source_id: "prest-1", reference_interne_instantane: "BA13-200", reference_fabricant_instantane: "PLACO-4521" });
    expect(p.p_lignes[1]).toMatchObject({ origine_ligne: "saisie", source_id: null });
  });
});

describe("source v2 depuis le rendu de la base", () => {
  const base = () => renduCommeLaBase(payloadEnregistrementV2(ENTETE, elementsFictifs({ lignesLibres: 2 }), { inclureCouts: false }));

  it("refuse un document du moteur v1, rendu par le chemin historique", () => {
    expect(() => sourceDepuisRendu({ ...base(), moteur: 1 }, { nomProduit: "X" })).toThrow(MoteurNonV2);
  });
  it("brouillon : applique le filigrane du document, puis le réglage « brouillon » de l'entreprise", () => {
    const doc = sourceDepuisRendu({ ...base(), filigrane_document: { type: "texte", preset: "BROUILLON" } }, { nomProduit: "X" });
    expect(doc.filigrane).toMatchObject({ texte: "BROUILLON", origine: "document" });
    const ent = sourceDepuisRendu({ ...base(), filigranes_entreprise: { defaut: null, brouillon: { type: "texte", preset: "PROVISOIRE" } } }, { nomProduit: "X" });
    expect(ent.filigrane).toMatchObject({ texte: "PROVISOIRE", origine: "entreprise_brouillon" });
  });
  it("document émis : n'utilise QUE le filigrane figé, quels que soient les réglages courants", () => {
    const doc = sourceDepuisRendu({
      ...base(), statut: "envoye", numero: "DEV-2026-001", provenance: "emission",
      filigrane: { type: "texte", preset: "COPIE" },
      filigrane_document: { type: "texte", preset: "BROUILLON" },
      filigranes_entreprise: { defaut: { type: "logo" }, brouillon: null },
    }, { nomProduit: "X" });
    expect(doc.filigrane).toMatchObject({ texte: "COPIE", origine: "fige" });
  });
  it("facture émise : titre selon le type, duplicata annoncé, original inchangé", () => {
    const facture: RenduDocument = { ...base(), type_document: "facture", type_facture: "acompte", statut: "payee", numero: "FAC-2026-009", provenance: "emission", filigrane: { type: "texte", preset: "PAYEE" } };
    const original = sourceDepuisRendu(facture, { nomProduit: "X" });
    expect(original.titre).toMatch(/^Facture — /);
    expect(original.filigrane).toMatchObject({ texte: "PAYÉE" });
    expect(original.duplicata).toBeNull();
    const duplicata = sourceDepuisRendu(facture, { nomProduit: "X", estDuplicata: true });
    expect(duplicata.filigrane).toMatchObject({ texte: "DUPLICATA", origine: "duplicata" });
    expect(duplicata.duplicata).toEqual({ numeroOriginal: "FAC-2026-009", dateEmissionOriginal: "2026-09-11" });
    expect(sourceDepuisRendu({ ...facture, statut: "brouillon" }, { nomProduit: "X", estDuplicata: true }).duplicata).toBeNull();
  });
  it("reprend l'identité émettrice et le style figés, et le destinataire de l'instantané client", () => {
    const doc = sourceDepuisRendu(base(), { nomProduit: "X" });
    expect(doc.emetteur).toMatchObject({ nom: "Entreprise Fictive", siret: "000" });
    expect(doc.style).toMatchObject({ police: "georgia", couleur: "#123456" });
    expect(doc.destinataire).toMatchObject({ nomAffiche: "Client Fictif", ville: "Ville" });
    expect(doc.totauxEnregistres).toEqual({ totalHt: base().montants.ht, totalTva: base().montants.tva, totalTtc: base().montants.ttc });
  });
});
