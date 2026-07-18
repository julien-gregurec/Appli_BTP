import { describe, expect, it } from "vitest";
import { cheminRetourSignature, estTypeDocumentSignature, serialiserDocumentStable } from "./signatures-documents";

describe("signatures des documents", () => {
  it("refuse les types de ressources non pris en charge", () => {
    expect(estTypeDocumentSignature("devis")).toBe(true);
    expect(estTypeDocumentSignature("paiement")).toBe(false);
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
