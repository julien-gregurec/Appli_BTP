import { describe, expect, it } from "vitest";
import {
  cheminRetourSignature,
  estTypeDocumentSignature,
  LIBELLES_DOCUMENT_SIGNATURE,
  serialiserDocumentStable,
  TYPES_DOCUMENT_SIGNATURE,
} from "./signatures-documents";

describe("signatures des documents", () => {
  it("refuse les types de ressources non pris en charge", () => {
    expect(estTypeDocumentSignature("devis")).toBe(true);
    expect(estTypeDocumentSignature("paiement")).toBe(false);
  });

  it("accorde correctement le déterminant de chaque type de document (ELS-REC-001)", () => {
    expect(LIBELLES_DOCUMENT_SIGNATURE.facture).toBe("de la facture");
    expect(LIBELLES_DOCUMENT_SIGNATURE.devis).toBe("du devis");
    expect(LIBELLES_DOCUMENT_SIGNATURE.commande).toBe("du bon de commande");
    expect(LIBELLES_DOCUMENT_SIGNATURE.intervention).toBe("du bon d’intervention");
    expect(LIBELLES_DOCUMENT_SIGNATURE.bon_livraison).toBe("du bon de livraison");
    // Un libellé manquant romprait silencieusement l'affichage : vérifier la couverture complète.
    for (const type of TYPES_DOCUMENT_SIGNATURE) expect(LIBELLES_DOCUMENT_SIGNATURE[type]).toMatch(/^(du|de la) /);
  });

  it("génère uniquement des chemins internes connus", () => {
    expect(cheminRetourSignature("intervention", "abc")).toBe("/interventions");
    expect(cheminRetourSignature("bon_livraison", "abc")).toBe("/interventions");
    expect(cheminRetourSignature("devis", "abc")).toBe("/devis/abc");
  });

  it("stabilise l'ordre des clés avant calcul d'empreinte", () => {
    expect(serialiserDocumentStable({ b: 2, a: { d: 4, c: 3 } }))
      .toBe(serialiserDocumentStable({ a: { c: 3, d: 4 }, b: 2 }));
  });
});
