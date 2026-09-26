import { describe, expect, it } from "vitest";
import { contenuEmailPaiementEchoue } from "./email-abonnement";

const BASE = {
  entrepriseNom: "Maçonnerie Durand",
  offre: "pro",
  periodicite: "mensuel",
  montantTtc: 118.8,
  devise: "eur",
  dateEvenementIso: "2026-09-05T08:30:00.000Z",
  numeroFacture: "ELS-0042",
  lienFacture: "https://invoice.stripe.com/i/acct_x/test_y",
  emailSupport: "support@elsatia.fr",
};

describe("contenuEmailPaiementEchoue", () => {
  it("récapitule entreprise, offre, montant, date, numéro et statut", () => {
    const { sujet, texte } = contenuEmailPaiementEchoue(BASE);
    expect(sujet).toContain("ELSATIA");
    expect(texte).toContain("Maçonnerie Durand");
    expect(texte).toContain("Pro");
    expect(texte).toContain("mensuel");
    expect(texte).toContain("ELS-0042");
    expect(texte).toContain("118,80");
    expect(texte).toContain("05 septembre 2026");
    expect(texte).toContain("Statut : paiement non abouti");
    expect(texte).toContain("support@elsatia.fr");
  });

  it("place le lien de régularisation Stripe reçu, et lui seul", () => {
    const { html } = contenuEmailPaiementEchoue(BASE);
    expect(html).toContain(BASE.lienFacture);
    expect(html).toContain("Régulariser le paiement");
  });

  it("n'annonce aucun délai de suspension ni aucune donnée bancaire", () => {
    const { sujet, texte, html } = contenuEmailPaiementEchoue(BASE);
    const tout = `${sujet}\n${texte}\n${html}`.toLowerCase();
    for (const interdit of ["suspension", "suspendu", "résilié", "jours", "carte", "iban", "cvv", "rib", "•••", "****"]) {
      expect(tout).not.toContain(interdit);
    }
  });

  it("reste valide sans offre, sans montant, sans numéro et sans lien", () => {
    const { texte, html } = contenuEmailPaiementEchoue({ entrepriseNom: "SARL Test" });
    expect(texte).toContain("SARL Test");
    expect(texte).toContain("Statut : paiement non abouti");
    expect(texte).not.toContain("Offre :");
    expect(texte).not.toContain("Montant :");
    expect(texte).not.toContain("Facture :");
    expect(html).not.toContain("Régulariser le paiement");
  });

  it("ignore une date invalide plutôt que d'écrire « Invalid Date »", () => {
    const { texte } = contenuEmailPaiementEchoue({ entrepriseNom: "SARL Test", dateEvenementIso: "pas-une-date" });
    expect(texte).not.toContain("Invalid");
    expect(texte).not.toContain("Date :");
  });

  it("affiche une devise non euro sans la convertir", () => {
    const { texte } = contenuEmailPaiementEchoue({ entrepriseNom: "SARL Test", montantTtc: 120, devise: "chf" });
    expect(texte).toContain("120,00 CHF TTC");
  });
});
