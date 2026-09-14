import { describe, expect, it } from "vitest";
import {
  CONTRASTE_FILIGRANE_MAX,
  CONTRASTE_TEXTE_MIN,
  descriptionAccessible,
  filigraneModifiable,
  lisibilite,
  normaliserFiligrane,
  OPACITE_MAX,
  resoudreFiligrane,
} from "@/lib/devis/filigrane";

describe("30–32. filigrane logo, texte et combiné", () => {
  it("accepte les quatre types et les préréglages", () => {
    expect(normaliserFiligrane({ type: "logo" }).type).toBe("logo");
    expect(normaliserFiligrane({ type: "texte", preset: "PAYEE" })).toMatchObject({ type: "texte", texte: "PAYÉE" });
    expect(normaliserFiligrane({ type: "logo_texte", preset: "A_VALIDER" })).toMatchObject({ type: "logo_texte", texte: "À VALIDER" });
    expect(normaliserFiligrane({ type: "texte", texte: "  Copie   client  " }).texte).toBe("Copie client");
  });
  it("retombe sur un type cohérent quand le texte manque", () => {
    expect(normaliserFiligrane({ type: "texte", texte: "  " }).type).toBe("aucun");
    expect(normaliserFiligrane({ type: "logo_texte", texte: null }).type).toBe("logo");
  });
  it("borne tous les réglages au lieu de les refuser", () => {
    expect(normaliserFiligrane({ type: "texte", texte: "X", opacite: 0.9, taillePct: 300, rotationDeg: 95 })).toMatchObject({
      opacite: OPACITE_MAX, taillePct: 80, rotationDeg: 60,
    });
    expect(normaliserFiligrane({ type: "texte", texte: "X", opacite: 0, couleur: "rouge" })).toMatchObject({ opacite: 0.03, couleur: "#1f2937" });
    expect(normaliserFiligrane({ type: "texte", texte: "x".repeat(99) }).texte).toHaveLength(40);
  });
  it("décrit le filigrane pour l'accessibilité et les propriétés du PDF", () => {
    expect(descriptionAccessible(normaliserFiligrane({ type: "logo_texte", preset: "BROUILLON" }))).toBe("Filigrane : logo de l’entreprise et BROUILLON");
    expect(descriptionAccessible(normaliserFiligrane(null))).toBeNull();
  });
});

describe("33. lisibilité mesurée", () => {
  it("reste pâle et laisse le texte lisible, quelle que soit la couleur, à l'opacité maximale", () => {
    for (const couleur of ["#000000", "#ff0000", "#0000ff", "#c9a24a", "#0d1b2a", "#22c55e"]) {
      const l = lisibilite(normaliserFiligrane({ type: "texte", texte: "PAYÉE", couleur, opacite: 1 }));
      expect(l.contrasteFiligrane, couleur).toBeLessThanOrEqual(CONTRASTE_FILIGRANE_MAX);
      expect(l.contrasteTexte, couleur).toBeGreaterThanOrEqual(CONTRASTE_TEXTE_MIN);
      expect(l.lisible).toBe(true);
    }
  });
  it("détecterait un filigrane trop marqué si les bornes étaient contournées", () => {
    const force = { ...normaliserFiligrane({ type: "texte", texte: "X", couleur: "#000000" }), opacite: 0.6 };
    expect(lisibilite(force).lisible).toBe(false);
  });
});

describe("résolution et figement", () => {
  const entreprise = { defaut: { type: "logo" as const }, brouillon: { type: "texte" as const, preset: "BROUILLON" as const } };

  it("un brouillon prend le filigrane « brouillon » de l'entreprise, sinon son défaut", () => {
    expect(resoudreFiligrane({ typeDocument: "devis", statut: "brouillon", entreprise })).toMatchObject({ texte: "BROUILLON", origine: "entreprise_brouillon" });
    expect(resoudreFiligrane({ typeDocument: "devis", statut: "brouillon", entreprise: { defaut: entreprise.defaut, brouillon: null } }))
      .toMatchObject({ type: "logo", origine: "entreprise" });
    expect(resoudreFiligrane({ typeDocument: "devis", statut: "brouillon" })).toMatchObject({ type: "aucun", origine: "aucun" });
  });
  it("le réglage propre au document l'emporte sur l'entreprise, y compris « aucun »", () => {
    expect(resoudreFiligrane({ typeDocument: "facture", statut: "brouillon", entreprise, document: { type: "aucun" } }))
      .toMatchObject({ type: "aucun", origine: "document" });
  });
  it("une facture émise garde le filigrane FIGÉ, même si l'entreprise change ses réglages", () => {
    const fige = { type: "texte" as const, preset: "PAYEE" as const };
    const r = resoudreFiligrane({ typeDocument: "facture", statut: "payee", fige, entreprise: { defaut: { type: "logo" }, brouillon: null }, document: { type: "aucun" } });
    expect(r).toMatchObject({ texte: "PAYÉE", origine: "fige" });
  });
  it("un duplicata porte DUPLICATA sans rien changer au filigrane figé de l'original", () => {
    const fige = { type: "texte" as const, preset: "PAYEE" as const };
    expect(resoudreFiligrane({ typeDocument: "facture", statut: "payee", fige, estDuplicata: true })).toMatchObject({ texte: "DUPLICATA", origine: "duplicata" });
    expect(resoudreFiligrane({ typeDocument: "facture", statut: "payee", fige })).toMatchObject({ texte: "PAYÉE" });
    expect(resoudreFiligrane({ typeDocument: "facture", statut: "brouillon", estDuplicata: true }).origine).not.toBe("duplicata");
  });
  it("seul un brouillon peut changer de filigrane", () => {
    expect(filigraneModifiable("brouillon")).toBe(true);
    for (const s of ["envoyee", "payee", "annulee", "envoye", "accepte"]) expect(filigraneModifiable(s)).toBe(false);
  });
});
