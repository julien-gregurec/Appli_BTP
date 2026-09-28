import { describe, expect, it } from "vitest";
import { contenuEmailPaiementEchoue } from "./email-abonnement";
import { contenuEmailReponseSupport } from "./email-support";
import { corpsHtmlEmailDocument } from "./email";

const LIGNE_LEGALE = "Julien GREGUREC, EI, 850 559 873 R.C.S. Strasbourg";
const ADRESSE_PERSONNELLE = /Rhinau|Maréchal Leclerc|67860/i;

describe("identité légale des e-mails ELSATIA → client", () => {
  const abonnement = contenuEmailPaiementEchoue({
    entrepriseNom: "Durand <img src=x onerror=alert(1)>",
    offre: "pro",
    periodicite: "mensuel",
    montantTtc: 118.8,
    devise: "eur",
    dateEvenementIso: "2026-09-05T08:30:00.000Z",
    numeroFacture: "ELS-0042",
    lienFacture: "https://invoice.stripe.com/i/acct_x/test_y",
    emailSupport: "support@elsatia.fr",
  });
  const support = contenuEmailReponseSupport({
    prenom: "Camille", nom: "Durand", entrepriseNom: "SARL Test", reference: "SUP-A0000000",
    sujet: "Export", extrait: "Corrigé.", lienSupport: "https://app.elsatia.fr/aide", emailSupport: "support@elsatia.fr",
  });

  it.each([["abonnement", abonnement], ["support", support]])("%s : ligne légale, sans adresse personnelle", (_n, contenu) => {
    expect(contenu.texte).toContain(LIGNE_LEGALE);
    expect(contenu.html).toContain(LIGNE_LEGALE);
    expect(contenu.texte + contenu.html).not.toMatch(ADRESSE_PERSONNELLE);
  });

  it("abonnement : le nom d'entreprise saisi est échappé", () => {
    expect(abonnement.html).not.toContain("<img");
    expect(abonnement.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("abonnement : un lien de facture non HTTPS n'est pas rendu", () => {
    const html = contenuEmailPaiementEchoue({ entrepriseNom: "X", lienFacture: "javascript:alert(1)" } as Parameters<typeof contenuEmailPaiementEchoue>[0]).html;
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<a href");
  });
});

describe("e-mail de document (client → son client)", () => {
  it("échappe le texte saisi et le lien", () => {
    const html = corpsHtmlEmailDocument("Bonjour <b>Client</b>,\n\nSociété \"A&B\"", 'https://app.elsatia.fr/document/t"onmouseover="x');
    expect(html).not.toContain("<b>Client</b>");
    expect(html).toContain("&lt;b&gt;Client&lt;/b&gt;");
    expect(html).toContain("A&amp;B");
    expect(html).not.toContain('t"onmouseover');
  });

  it("n'émet aucun bouton vers un schéma non http(s)", () => {
    expect(corpsHtmlEmailDocument("Bonjour", "javascript:alert(1)")).not.toContain("<a href");
  });

  it("ne porte PAS la ligne légale ELSATIA : l'émetteur est l'entreprise cliente", () => {
    expect(corpsHtmlEmailDocument("Bonjour", null)).not.toContain("850 559 873");
  });
});
