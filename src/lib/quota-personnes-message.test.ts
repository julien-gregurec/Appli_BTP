import { describe, expect, it } from "vitest";
import {
  actionsQuotaPersonnes,
  messageDepassementCapacite,
  messageImportCapacite,
  messageLimiteAtteinte,
  type ContexteQuotaPersonnes,
} from "./quota-personnes-message";
import { messageErreurUtilisateur } from "./erreurs-utilisateur";

/**
 * ELSATIA-GP-TRIAL-SOCLE-ACCESS-AND-CAPACITY-FIX-V1 — P0-2 / §7.
 *
 * Le plafond de personnes actives reste celui du trigger DB (inchangé, aucune
 * migration). Ce qui est garanti ici : un message de quota ne propose JAMAIS une
 * action impossible. Sous `ABONNEMENTS_PUBLICS_OUVERTS=false`, « acheter »,
 * « changer d'offre » et « ajouter de la capacité » n'existent pas.
 */

const URL_CONTACT = "https://elsatia.fr/contact";

const ESSAI_COMMERCIALISATION_FERMEE: ContexteQuotaPersonnes = {
  abonnementOffre: null,
  abonnementsOuverts: false,
  capaciteAutogerable: false,
  urlContact: URL_CONTACT,
};

const ABONNE_MINI_AUTOGERE: ContexteQuotaPersonnes = {
  abonnementOffre: "mini",
  abonnementsOuverts: true,
  capaciteAutogerable: true,
  urlContact: URL_CONTACT,
};

/** Formulations d'actions qui n'existent pas quand la souscription est fermée. */
const FAUX_CTA = [
  "acheter", "changez d’offre", "changer d’offre", "choisir une offre",
  "ajoutez de la capacité", "ajouter de la capacité", "compte payant", "payer",
];

function neProposeAucunFauxCta(message: string) {
  const bas = message.toLowerCase();
  for (const cta of FAUX_CTA) expect(bas).not.toContain(cta.toLowerCase());
}

describe("essai, commercialisation fermée : aucune action impossible", () => {
  it("ne propose que des actions réellement disponibles", () => {
    const actions = actionsQuotaPersonnes(ESSAI_COMMERCIALISATION_FERMEE);
    expect(actions.map((a) => a.href)).toEqual(["/employes", URL_CONTACT]);
    expect(actions[0].libelle.toLowerCase()).toContain("archiver");
    expect(actions[1].libelle.toLowerCase()).toContain("contacter");
  });

  it("limite atteinte : message honnête, parlant d'essai et sans faux CTA", () => {
    const message = messageLimiteAtteinte(ESSAI_COMMERCIALISATION_FERMEE);
    expect(message).toContain("essai");
    expect(message).toContain("archiver une personne");
    expect(message).toContain("contacter");
    expect(message).toContain("Aucune donnée n’est supprimée.");
    neProposeAucunFauxCta(message);
  });

  it("dépassement : indique le nombre exact à archiver, sans faux CTA", () => {
    const message = messageDepassementCapacite(ESSAI_COMMERCIALISATION_FERMEE, { actives: 5, totale: 3 });
    expect(message).toContain("Votre essai autorise 3 personnes actives");
    expect(message).toContain("archivez 2 personne(s)");
    neProposeAucunFauxCta(message);
  });

  it("import en lot : refus explicite, sans faux CTA", () => {
    const message = messageImportCapacite(ESSAI_COMMERCIALISATION_FERMEE, {
      totale: 3, actives: 3, restant: 0, demandees: 4,
    });
    expect(message).toContain("Import annulé");
    expect(message).toContain("votre essai autorise 3 personnes actives");
    expect(message).toContain("0 place(s) disponible(s)");
    expect(message).toContain("Réduisez le fichier");
    neProposeAucunFauxCta(message);
  });
});

describe("abonné existant : les chemins réellement ouverts restent proposés", () => {
  it("propose la capacité en libre-service et le changement d'offre", () => {
    const actions = actionsQuotaPersonnes(ABONNE_MINI_AUTOGERE);
    expect(actions.map((a) => a.href)).toEqual(["/employes", "/abonnement#capacite", "/abonnement#choisir-offre"]);
    const message = messageLimiteAtteinte(ABONNE_MINI_AUTOGERE);
    expect(message).toContain("Votre abonnement autorise");
    expect(message.toLowerCase()).toContain("ajouter de la capacité");
    expect(message.toLowerCase()).toContain("changer d’offre");
    // Le contact commercial n'est plus nécessaire quand tout est en libre-service.
    expect(message).not.toContain("contacter");
  });

  it("souscription ouverte mais sans abonnement Stripe : « choisir une offre » + contact", () => {
    const actions = actionsQuotaPersonnes({
      abonnementOffre: null, abonnementsOuverts: true, capaciteAutogerable: false, urlContact: URL_CONTACT,
    });
    expect(actions.map((a) => a.href)).toEqual(["/employes", "/abonnement#choisir-offre", URL_CONTACT]);
  });
});

describe("repli générique (module pur, sans contexte)", () => {
  it("le message d'erreur global ne propose plus d'action potentiellement fermée", () => {
    const message = messageErreurUtilisateur("creerEmployeAction", {
      code: "P0001", message: "CAPACITE_PERSONNES_ATTEINTE",
    });
    expect(message).toContain("personnes actives");
    expect(message).toContain("Archivez une personne");
    expect(message).toContain("contactez le support");
    neProposeAucunFauxCta(message);
  });
});
