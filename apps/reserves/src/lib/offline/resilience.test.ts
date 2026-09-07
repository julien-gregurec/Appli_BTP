import { describe, expect, it } from "vitest";
import {
  ecrasementAutorise, estCleIdempotence, ETATS_SYNCHRO, LIBELLES_ETAT_SYNCHRO,
  nouvelleCleIdempotence, peutReessayer, politiquePour, POLITIQUES_CONFLIT,
} from "./resilience";

describe("clé d'idempotence", () => {
  it("produit une clé au format attendu par la base", () => {
    expect(estCleIdempotence(nouvelleCleIdempotence())).toBe(true);
  });

  it("ne produit jamais deux fois la même clé", () => {
    const clefs = new Set(Array.from({ length: 500 }, nouvelleCleIdempotence));
    expect(clefs.size).toBe(500);
  });

  it("refuse tout ce qui n'est pas une clé, plutôt que de le transmettre", () => {
    for (const valeur of ["", "  ", "abc", "1234", null, undefined, 42, {}, [],
                          "e5000000-0000-0000-0000-00000000010", // trop court
                          "zzzzzzzz-0000-0000-0000-000000000000"]) {
      expect(estCleIdempotence(valeur)).toBe(false);
    }
  });

  it("accepte une clé valide quelle que soit sa casse", () => {
    const cle = nouvelleCleIdempotence();
    expect(estCleIdempotence(cle.toUpperCase())).toBe(true);
  });
});

describe("états de synchronisation", () => {
  it("nomme chacun des quatre états", () => {
    expect(ETATS_SYNCHRO).toEqual(["en_attente", "en_cours", "synchronise", "echec"]);
    for (const etat of ETATS_SYNCHRO) expect(LIBELLES_ETAT_SYNCHRO[etat]).toBeTruthy();
  });

  it("ne propose la reprise que sur un échec — jamais sur un envoi en cours", () => {
    expect(peutReessayer("echec")).toBe(true);
    expect(peutReessayer("en_attente")).toBe(false);
    expect(peutReessayer("en_cours")).toBe(false);
    expect(peutReessayer("synchronise")).toBe(false);
  });
});

describe("politique de conflit", () => {
  it("laisse le workflow et l'historique à la base", () => {
    expect(politiquePour("statut_reserve")).toBe("serveur_gagne");
    expect(politiquePour("historique")).toBe("serveur_gagne");
  });

  it("fait confiance au terrain pour le constat et les photos", () => {
    expect(politiquePour("description_saisie_terrain")).toBe("client_gagne");
    expect(politiquePour("photo")).toBe("client_gagne");
  });

  it("exige un arbitrage humain sur une levée validée", () => {
    expect(politiquePour("levee_validee")).toBe("conflit_manuel");
  });

  it("n'admet que les trois stratégies du contrat", () => {
    for (const politique of Object.values(POLITIQUES_CONFLIT)) {
      expect(["serveur_gagne", "client_gagne", "conflit_manuel"]).toContain(politique);
    }
  });
});

describe("garde-fou d'écrasement", () => {
  it("n'écrase JAMAIS une réserve levée, quelle que soit la nature de la donnée", () => {
    for (const nature of Object.keys(POLITIQUES_CONFLIT) as (keyof typeof POLITIQUES_CONFLIT)[]) {
      expect(ecrasementAutorise(nature, "levee")).toBe(false);
    }
  });

  it("n'autorise la reprise locale que là où le terrain fait foi", () => {
    expect(ecrasementAutorise("description_saisie_terrain", "assignee")).toBe(true);
    expect(ecrasementAutorise("photo", "acceptee")).toBe(true);
    expect(ecrasementAutorise("statut_reserve", "assignee")).toBe(false);
    expect(ecrasementAutorise("levee_validee", "levee_demandee")).toBe(false);
    expect(ecrasementAutorise("historique", "emise")).toBe(false);
  });
});
