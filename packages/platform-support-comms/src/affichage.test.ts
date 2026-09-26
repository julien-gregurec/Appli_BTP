import { describe, expect, it } from "vitest";
import {
  appliquerEvenementLecture,
  evaluerAffichage,
  modeAffichageAutorise,
  type LectureCommunication,
} from "./affichage";
import { evaluerConsentement, PREFERENCES_PAR_DEFAUT, coherenceTypeEtNature } from "./consentement";

const T = new Date("2026-09-10T21:00:00.000Z");

function lecture(surcharge: Partial<LectureCommunication> = {}): LectureCommunication {
  return {
    communicationId: "c1",
    utilisateurId: "u1",
    etat: "non_vu",
    vuAt: null,
    acquitteAt: null,
    cliqueAt: null,
    affichages: 0,
    dernierAffichageAt: null,
    sessionId: null,
    appareil: null,
    ...surcharge,
  };
}

const base = {
  type: "nouveaute" as const,
  mode: "banniere" as const,
  frequence: "une_seule_fois" as const,
  debutAt: "2026-09-10T20:00:00.000Z",
  finAt: "2026-09-11T06:00:00.000Z",
  consentementAccorde: true,
  maintenant: T,
};

describe("mode bloquant", () => {
  it("réservé à sécurité, conditions, interruption et action requise", () => {
    for (const type of ["securite", "conditions", "interruption_planifiee", "action_requise"] as const) {
      expect(modeAffichageAutorise(type, "bloquant")).toBe(true);
    }
    for (const type of ["commerciale", "nouveaute", "conseil", "information", "autre"] as const) {
      expect(modeAffichageAutorise(type, "bloquant")).toBe(false);
    }
  });

  it("une publicité bloquante est rétrogradée en bannière plutôt qu'affichée en modale", () => {
    const d = evaluerAffichage({ ...base, type: "commerciale", mode: "bloquant", lecture: null });
    expect(d).toEqual({ afficher: true, mode: "banniere" });
  });
});

describe("fréquence d'affichage", () => {
  it("un message « une seule fois » ne réapparaît pas à chaque navigation", () => {
    expect(evaluerAffichage({ ...base, lecture: null })).toMatchObject({ afficher: true });
    expect(
      evaluerAffichage({ ...base, lecture: lecture({ affichages: 1, dernierAffichageAt: T.toISOString(), etat: "vu" }) }),
    ).toMatchObject({ afficher: false, raison: "deja_vu" });
  });

  it("un rappel périodique respecte l'intervalle", () => {
    const recent = lecture({ affichages: 1, dernierAffichageAt: "2026-09-10T20:30:00.000Z" });
    expect(
      evaluerAffichage({ ...base, frequence: "rappel_periodique", lecture: recent }),
    ).toMatchObject({ afficher: false, raison: "rappel_trop_recent" });
    const ancien = lecture({ affichages: 1, dernierAffichageAt: "2026-09-09T20:00:00.000Z" });
    expect(
      evaluerAffichage({ ...base, frequence: "rappel_periodique", lecture: ancien }),
    ).toMatchObject({ afficher: true });
  });

  it("« jusqu'à acquittement » insiste tant que l'utilisateur n'a pas confirmé", () => {
    const ignore = lecture({ affichages: 3, etat: "ignore", dernierAffichageAt: T.toISOString() });
    expect(
      evaluerAffichage({ ...base, frequence: "jusqu_a_acquittement", lecture: ignore }),
    ).toMatchObject({ afficher: true });
    const acquitte = lecture({ acquitteAt: "2026-09-10T20:10:00.000Z", etat: "acquitte" });
    expect(
      evaluerAffichage({ ...base, frequence: "jusqu_a_acquittement", lecture: acquitte }),
    ).toMatchObject({ afficher: false, raison: "deja_acquitte" });
  });

  it("n'affiche rien hors de la fenêtre", () => {
    expect(
      evaluerAffichage({ ...base, lecture: null, maintenant: new Date("2026-09-09T00:00:00.000Z") }),
    ).toMatchObject({ afficher: false, raison: "hors_fenetre" });
    expect(
      evaluerAffichage({ ...base, lecture: null, maintenant: new Date("2026-09-12T00:00:00.000Z") }),
    ).toMatchObject({ afficher: false, raison: "hors_fenetre" });
  });

  it("respecte un refus de consentement", () => {
    expect(evaluerAffichage({ ...base, lecture: null, consentementAccorde: false })).toMatchObject({
      afficher: false,
      raison: "consentement_refuse",
    });
  });
});

describe("états de lecture", () => {
  it("suit vu, ignoré, acquitté et cliqué", () => {
    let l = lecture();
    l = appliquerEvenementLecture(l, "affichage", T);
    expect(l).toMatchObject({ etat: "vu", affichages: 1 });
    l = appliquerEvenementLecture(l, "ignore", T);
    expect(l.etat).toBe("ignore");
    l = appliquerEvenementLecture(l, "clic", T);
    expect(l).toMatchObject({ etat: "clique", cliqueAt: T.toISOString() });
    l = appliquerEvenementLecture(l, "acquittement", T);
    expect(l).toMatchObject({ etat: "acquitte", acquitteAt: T.toISOString() });
  });

  it("un acquittement ne se défait pas", () => {
    const acquitte = appliquerEvenementLecture(lecture(), "acquittement", T);
    const apres = appliquerEvenementLecture(acquitte, "ignore", new Date("2026-09-11T00:00:00.000Z"));
    expect(apres.etat).toBe("acquitte");
    expect(apres.acquitteAt).toBe(T.toISOString());
  });
});

describe("consentement", () => {
  it("un message de service passe malgré tous les refus", () => {
    const refusTotal = { accepteCommerciales: false, accepteProduit: false };
    for (const type of ["securite", "incident", "maintenance", "conditions", "action_requise"] as const) {
      expect(evaluerConsentement(type, refusTotal)).toEqual({ autorise: true });
    }
  });

  it("une communication commerciale est bloquée par défaut (opt-in)", () => {
    expect(evaluerConsentement("commerciale", PREFERENCES_PAR_DEFAUT)).toMatchObject({
      autorise: false,
      raison: "refus_commercial",
    });
    expect(
      evaluerConsentement("commerciale", { ...PREFERENCES_PAR_DEFAUT, accepteCommerciales: true }),
    ).toEqual({ autorise: true });
  });

  it("l'information produit se refuse indépendamment du commercial", () => {
    expect(
      evaluerConsentement("nouveaute", { accepteCommerciales: true, accepteProduit: false }),
    ).toMatchObject({ autorise: false, raison: "refus_produit" });
  });

  it("empêche de faire passer une publicité pour un message de service", () => {
    expect(coherenceTypeEtNature("commerciale", "service")).toBe(false);
    expect(coherenceTypeEtNature("securite", "service")).toBe(true);
    expect(coherenceTypeEtNature("nouveaute", "produit")).toBe(true);
  });
});
