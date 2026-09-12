import { describe, expect, it } from "vitest";
import { appliquerModele, appliquerVariables, listeAdresses, modelesPour, type ModeleEmail } from "@/lib/email-modeles";

const variables = { numero: "DEV-2026-0007", client: "Dupont Jean", montant_ttc: "1 200,00 €", entreprise: "Toiture Fictive", prenom: "Julien", chantier: null };

describe("modèles d'e-mail", () => {
  it("remplace les variables connues, vide les nulles, laisse les inconnues", () => {
    expect(appliquerVariables("Devis {numero} pour { client } — {chantier} {inconnue}", variables)).toBe("Devis DEV-2026-0007 pour Dupont Jean —  {inconnue}");
  });
  it("applique objet et corps", () => {
    expect(appliquerModele({ objet: " Devis {numero} — {entreprise} ", corps: "Bonjour {client},\n{montant_ttc} TTC.\n{prenom}" }, variables))
      .toEqual({ objet: "Devis DEV-2026-0007 — Toiture Fictive", corps: "Bonjour Dupont Jean,\n1 200,00 € TTC.\nJulien" });
  });
  it("classe les modèles : défaut du type, puis type, puis « tous »", () => {
    const m = (id: string, typeDocument: ModeleEmail["typeDocument"], parDefaut = false): ModeleEmail => ({ id, nom: id, typeDocument, objet: "o", corps: "c", parDefaut });
    const liste = [m("tous-b", "tous"), m("fac", "facture", true), m("dev-2", "devis"), m("dev-1", "devis", true), m("tous-a", "tous", true)];
    expect(modelesPour(liste, "devis").map((x) => x.id)).toEqual(["dev-1", "dev-2", "tous-a", "tous-b"]);
    expect(modelesPour(liste, "facture").map((x) => x.id)).toEqual(["fac", "tous-a", "tous-b"]);
  });
  it("nettoie une liste d'adresses saisie", () => {
    expect(listeAdresses(" A@x.fr, b@y.fr ; A@x.fr\nc@z.fr ,")).toEqual(["a@x.fr", "b@y.fr", "c@z.fr"]);
    expect(listeAdresses("")).toEqual([]);
  });
});
