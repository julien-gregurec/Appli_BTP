import {describe,expect,it} from "vitest";
import {construireLienMailto, contenuEmailDocument, corpsHtmlEmailDocument} from "@/lib/email";

describe("lien e-mail devis et factures",()=>{
  it("encode les espaces et accents sans aucun signe plus",()=>{
    const lien=construireLienMailto({to:"client@example.fr",sujet:"Devis accepté — Électricité",corps:"Bonjour Madame,\n\nPièce jointe à vérifier.",cc:"chef@example.fr; comptable@example.fr"});
    expect(lien).not.toContain("+");
    expect(lien).toContain("%20");
    const params=new URLSearchParams(lien.slice(lien.indexOf("?")+1));
    expect(params.get("subject")).toBe("Devis accepté — Électricité");
    expect(params.get("body")).toBe("Bonjour Madame,\n\nPièce jointe à vérifier.");
    expect(params.get("cc")).toBe("chef@example.fr,comptable@example.fr");
  });
});

describe("corpsHtmlEmailDocument", () => {
  it("convertit les paragraphes et sauts de ligne en HTML", () => {
    const html = corpsHtmlEmailDocument("Bonjour,\n\nVeuillez trouver ci-joint le devis.\n\nCordialement,\nÉlectricité Dupont", null);
    expect(html).toContain("<p style=");
    expect(html).toContain("Bonjour,");
    expect(html).toContain("Veuillez trouver ci-joint le devis.");
  });

  it("ajoute un bouton vers le lien du document quand un lien est fourni", () => {
    const html = corpsHtmlEmailDocument("Bonjour,", "https://app.elsatia.fr/document/abc123");
    expect(html).toContain('href="https://app.elsatia.fr/document/abc123"');
    expect(html).toContain("Consulter le document");
  });

  it("n'ajoute aucun bouton quand le lien est absent", () => {
    const html = corpsHtmlEmailDocument("Bonjour,", null);
    expect(html).not.toContain("Consulter le document");
  });
});

describe("contenuEmailDocument — ELSATIA-EMAILS-METIER-P1-CLOSURE-V1", () => {
  const base = { numero: "REF-2026-0001", client: { nom: "Dupont", prenom: "Jean", societe: null, email: "client@example.fr" }, montantTtc: 1200, entrepriseNom: "Électricité Dupont" };

  it("devis -> \"Devis\"/\"le devis\", jamais \"Facture\" ni \"Avoir\"", () => {
    const email = contenuEmailDocument({ ...base, typeDoc: "devis" });
    expect(email?.sujet).toBe("Devis REF-2026-0001 — Électricité Dupont");
    expect(email?.corps).toContain("le devis REF-2026-0001");
    expect(email?.sujet).not.toMatch(/Facture|Avoir/);
  });

  it("facture -> \"Facture\"/\"la facture\", jamais \"Avoir\"", () => {
    const email = contenuEmailDocument({ ...base, typeDoc: "facture" });
    expect(email?.sujet).toBe("Facture REF-2026-0001 — Électricité Dupont");
    expect(email?.corps).toContain("la facture REF-2026-0001");
    expect(email?.sujet).not.toContain("Avoir");
    expect(email?.corps).not.toContain("Avoir");
  });

  it("avoir -> \"Avoir\"/\"l'avoir\", jamais \"Facture\"", () => {
    const email = contenuEmailDocument({ ...base, typeDoc: "avoir" });
    expect(email?.sujet).toBe("Avoir REF-2026-0001 — Électricité Dupont");
    expect(email?.corps).toContain("l'avoir REF-2026-0001");
    expect(email?.sujet).not.toContain("Facture");
    expect(email?.corps).not.toContain("la facture");
  });
});
