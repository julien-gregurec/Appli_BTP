import { describe, expect, it } from "vitest";
import {
  cleAccuse,
  dedupliquerAccuses,
  estCommunicationCritique,
  fusionnerAccuse,
  ordonnerResynchronisation,
  reconcilierCacheLocal,
  type AccuseEnAttente,
  type CommunicationLocale,
} from "./offline";
import { evaluerSessionAssistance } from "./session";

const T = new Date("2026-09-12T08:00:00.000Z");

function message(surcharge: Partial<CommunicationLocale>): CommunicationLocale {
  return {
    id: "c1",
    version: 1,
    type: "nouveaute",
    debutAt: "2026-09-01T00:00:00.000Z",
    finAt: null,
    recuAt: "2026-09-01T00:00:00.000Z",
    ...surcharge,
  };
}

describe("cache local", () => {
  it("conserve un message reçu et encore valide", () => {
    const r = reconcilierCacheLocal([message({ id: "vivant", finAt: "2026-09-20T00:00:00.000Z" })], T);
    expect(r.aConserver.map((m) => m.id)).toEqual(["vivant"]);
    expect(r.aPurger).toEqual([]);
  });

  it("purge une ancienne publicité expirée pour qu'elle ne réapparaisse pas", () => {
    const r = reconcilierCacheLocal(
      [message({ id: "pub", type: "commerciale", finAt: "2026-09-05T00:00:00.000Z" })],
      T,
    );
    expect(r.aConserver).toEqual([]);
    expect(r.aPurger.map((m) => m.id)).toEqual(["pub"]);
  });

  it("évalue l'expiration localement, sans attendre le réseau", () => {
    const cache = [
      message({ id: "a", finAt: "2026-09-12T07:59:59.000Z" }),
      message({ id: "b", finAt: "2026-09-12T08:00:01.000Z" }),
    ];
    const r = reconcilierCacheLocal(cache, T);
    expect(r.aPurger.map((m) => m.id)).toEqual(["a"]);
    expect(r.aConserver.map((m) => m.id)).toEqual(["b"]);
  });

  it("resynchronise les messages critiques en premier", () => {
    const ordonne = ordonnerResynchronisation([
      message({ id: "pub", type: "commerciale", debutAt: "2026-09-11T00:00:00.000Z" }),
      message({ id: "incident", type: "incident", debutAt: "2026-09-02T00:00:00.000Z" }),
      message({ id: "secu", type: "securite", debutAt: "2026-09-10T00:00:00.000Z" }),
    ]);
    expect(ordonne.map((m) => m.id)).toEqual(["secu", "incident", "pub"]);
  });

  it("qualifie les types critiques", () => {
    expect(estCommunicationCritique("securite")).toBe(true);
    expect(estCommunicationCritique("commerciale")).toBe(false);
  });
});

describe("accusés hors-ligne", () => {
  const accuse = (surcharge: Partial<AccuseEnAttente>): AccuseEnAttente => {
    const noyau = {
      communicationId: "c1",
      utilisateurId: "u1",
      evenement: "acquittement" as const,
      ...surcharge,
    };
    return { ...noyau, cle: cleAccuse(noyau), produitAt: "2026-09-11T10:00:00.000Z", ...surcharge };
  };

  it("la clé d'idempotence ignore l'appareil et l'horodatage", () => {
    expect(cleAccuse({ communicationId: "c1", utilisateurId: "u1", evenement: "acquittement" })).toBe(
      "c1:u1:acquittement",
    );
  });

  it("déduplique deux acquittements produits sur deux appareils", () => {
    const file = [
      accuse({ produitAt: "2026-09-11T12:00:00.000Z" }),
      accuse({ produitAt: "2026-09-11T10:00:00.000Z" }),
    ];
    const resultat = dedupliquerAccuses(file);
    expect(resultat).toHaveLength(1);
    // La date la plus ancienne fait foi : c'est l'instant réel de l'acquittement.
    expect(resultat[0].produitAt).toBe("2026-09-11T10:00:00.000Z");
  });

  it("conserve les affichages, qui sont un compteur", () => {
    const file = [
      accuse({ evenement: "affichage", produitAt: "2026-09-11T10:00:00.000Z" }),
      accuse({ evenement: "affichage", produitAt: "2026-09-11T11:00:00.000Z" }),
    ];
    expect(dedupliquerAccuses(file)).toHaveLength(2);
  });

  it("la fusion serveur n'écrase pas un acquittement déjà enregistré", () => {
    const gabarit = { communicationId: "c1", utilisateurId: "u1", sessionId: null, appareil: null };
    const distant = fusionnerAccuse(null, accuse({ produitAt: "2026-09-10T09:00:00.000Z" }), gabarit);
    expect(distant.acquitteAt).toBe("2026-09-10T09:00:00.000Z");
    const apres = fusionnerAccuse(distant, accuse({ produitAt: "2026-09-11T10:00:00.000Z" }), gabarit);
    expect(apres.acquitteAt).toBe("2026-09-10T09:00:00.000Z");
    expect(apres.etat).toBe("acquitte");
  });

  it("une double remontée d'affichage incrémente sans dupliquer l'état", () => {
    const gabarit = { communicationId: "c1", utilisateurId: "u1", sessionId: null, appareil: null };
    let etat = fusionnerAccuse(null, accuse({ evenement: "affichage", produitAt: "2026-09-11T10:00:00.000Z" }), gabarit);
    etat = fusionnerAccuse(etat, accuse({ evenement: "affichage", produitAt: "2026-09-11T11:00:00.000Z" }), gabarit);
    expect(etat.affichages).toBe(2);
    expect(etat.dernierAffichageAt).toBe("2026-09-11T11:00:00.000Z");
    expect(etat.etat).toBe("vu");
  });
});

describe("assistance et hors-ligne", () => {
  it("une session d'assistance ne fonctionne jamais hors connexion", () => {
    const session = {
      id: "s1",
      acteurId: "uid",
      acteurEmail: "julien@elsatia.fr",
      acteurNom: null,
      entrepriseId: "ent-1",
      entrepriseNom: "BTP",
      applications: ["reserves"],
      incidentGlobal: false,
      perimetre: "lecture_seule" as const,
      motifCategorie: "demande_client" as const,
      motifDetailInterne: null,
      ticket: null,
      ouverteAt: "2026-09-12T07:50:00.000Z",
      expireAt: "2026-09-12T08:20:00.000Z",
      derniereActiviteAt: "2026-09-12T07:59:00.000Z",
      termineeAt: null,
      termineeMotif: null,
      revoqueeAt: null,
      revoqueePar: null,
    };
    const d = evaluerSessionAssistance(session, {
      entrepriseId: "ent-1",
      applicationCode: "reserves",
      action: { famille: "lire" },
      maintenant: T,
      enLigne: false,
    });
    expect(d).toMatchObject({ autorise: false, raison: "hors_ligne_interdit" });
  });
});
