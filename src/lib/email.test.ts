import {describe,expect,it} from "vitest";
import {construireLienMailto, corpsHtmlEmailDocument} from "@/lib/email";

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
