import { describe, expect, it } from "vitest";

import {
  DECISIONS_ACCES,
  REGLES_DECISION,
  VERSION_CONTRAT_DECISION_ACCES,
  PORTEE_SUSPENSION,
  decisionCoupeToutesLesApplications,
  decisionDepuisBooleen,
  ecranPourDecision,
  lireDecisionAcces,
  porteeDeconnexionPourDecision,
  regleDecision,
  reponseRefusApi,
  statutRefusApi,
  type DecisionAccesClient,
} from "./index";

/**
 * Tableau des sept situations de la mission « convergence d'accès » : ce que doit voir et
 * recevoir l'utilisateur, dans TOUTES les applications. Un changement de ce tableau est une
 * décision produit, pas un détail de code.
 */
const CAS: {
  situation: string;
  decision: DecisionAccesClient;
  ecran: string;
  http: number;
  deconnexion: "local" | null;
}[] = [
  { situation: "1. pas d'organisation", decision: "sans_organisation", ecran: "sans_organisation", http: 403, deconnexion: "local" },
  { situation: "2. pas d'entitlement (application non incluse)", decision: "application_non_incluse", ecran: "abonnement_requis", http: 403, deconnexion: "local" },
  { situation: "3a. pas de rôle (habilitation désactivée)", decision: "sans_role", ecran: "acces_refuse", http: 403, deconnexion: "local" },
  { situation: "3b. pas d'habilitation (jamais accordée)", decision: "sans_habilitation", ecran: "acces_refuse", http: 403, deconnexion: "local" },
  { situation: "4. suspendu", decision: "abonnement_suspendu", ecran: "abonnement_suspendu", http: 423, deconnexion: "local" },
  { situation: "5. autorisé", decision: "autorise", ecran: "application", http: 200, deconnexion: null },
  { situation: "6. désactivé", decision: "utilisateur_desactive", ecran: "compte_desactive", http: 403, deconnexion: "local" },
  { situation: "7. invitation en attente", decision: "invitation_en_attente", ecran: "invitation", http: 403, deconnexion: null },
  { situation: "8. non connecté", decision: "non_authentifie", ecran: "login", http: 401, deconnexion: null },
  { situation: "8b. suspension plateforme (sécurité)", decision: "suspension_plateforme", ecran: "suspension_plateforme", http: 423, deconnexion: "local" },
  { situation: "9. essai expiré", decision: "essai_expire", ecran: "essai_expire", http: 423, deconnexion: "local" },
  { situation: "10. panne du service de décision", decision: "indisponible", ecran: "erreur_technique", http: 503, deconnexion: null },
];

describe("matrice cible : situation → écran, statut HTTP, déconnexion", () => {
  it.each(CAS)("$situation", ({ decision, ecran, http, deconnexion }) => {
    expect(regleDecision(decision).ecran).toBe(ecran);
    expect(regleDecision(decision).statutHttp).toBe(http);
    expect(porteeDeconnexionPourDecision(decision)).toBe(deconnexion);
  });

  it("chaque décision possible est couverte par une règle", () => {
    for (const d of DECISIONS_ACCES) expect(REGLES_DECISION[d]).toBeDefined();
    expect(REGLES_DECISION.indisponible).toBeDefined();
    expect(REGLES_DECISION.refus_non_qualifie).toBeDefined();
  });
});

describe("invariants du contrat", () => {
  const toutes = Object.keys(REGLES_DECISION) as DecisionAccesClient[];

  it("aucune décision ne prescrit une déconnexion globale ni une redirection 3xx d'API", () => {
    for (const d of toutes) {
      expect([null, "local"]).toContain(porteeDeconnexionPourDecision(d));
      expect(REGLES_DECISION[d].statutHttp).toBeLessThan(600);
      expect(REGLES_DECISION[d].statutHttp === 200 || REGLES_DECISION[d].statutHttp >= 401).toBe(true);
    }
  });

  it("seul `autorise` rend 200", () => {
    expect(toutes.filter((d) => REGLES_DECISION[d].statutHttp === 200)).toEqual(["autorise"]);
  });

  it("une panne n'est jamais un refus : 503, réessayable, sans déconnexion", () => {
    expect(REGLES_DECISION.indisponible).toMatchObject({ statutHttp: 503, reessayable: true, action: "reessayer" });
    expect(porteeDeconnexionPourDecision("indisponible")).toBeNull();
    expect(REGLES_DECISION.erreur_configuration.statutHttp).toBe(500);
  });

  it("aucun écran de refus n'attribue à l'utilisateur une absence d'entreprise pour une panne", () => {
    expect(REGLES_DECISION.indisponible.ecran).not.toBe("sans_organisation");
    expect(REGLES_DECISION.erreur_configuration.ecran).not.toBe("sans_organisation");
  });

  it("l'état d'abonnement d'une entreprise n'est jamais exposé à qui n'en est pas membre", () => {
    for (const d of ["sans_organisation", "non_authentifie", "suspension_plateforme"] as const) {
      expect(REGLES_DECISION[d].nomEntrepriseExposable).toBe(false);
    }
    // Les états personnels précèdent les états d'entreprise dans l'ordre d'évaluation.
    const i = (d: string) => DECISIONS_ACCES.indexOf(d as (typeof DECISIONS_ACCES)[number]);
    for (const perso of ["sans_organisation", "invitation_en_attente", "validation_en_attente", "utilisateur_desactive"]) {
      for (const entreprise of ["abonnement_suspendu", "essai_expire"]) {
        expect(i(perso)).toBeLessThan(i(entreprise));
      }
    }
    // Entreprise avant droit d'usage avant habilitation avant rôle.
    expect(i("abonnement_suspendu")).toBeLessThan(i("application_non_incluse"));
    expect(i("application_non_incluse")).toBeLessThan(i("sans_habilitation"));
    expect(i("sans_habilitation")).toBeLessThan(i("sans_role"));
  });

  it("la suspension plateforme prime sur tout, bypass administrateur compris", () => {
    expect(DECISIONS_ACCES.indexOf("suspension_plateforme")).toBeLessThan(DECISIONS_ACCES.indexOf("autorise"));
    expect(DECISIONS_ACCES.indexOf("non_authentifie")).toBeLessThan(DECISIONS_ACCES.indexOf("suspension_plateforme"));
  });

  it("l'ancienne décision entreprise_inactive n'existe plus dans le contrat figé", () => {
    expect(DECISIONS_ACCES as readonly string[]).not.toContain("entreprise_inactive");
    expect(Object.keys(REGLES_DECISION)).not.toContain("entreprise_inactive");
  });

  it("D3 — une suspension commerciale ne concerne que son application ; seule la suspension plateforme coupe tout", () => {
    expect(PORTEE_SUSPENSION.abonnement_suspendu).toBe("application");
    expect(PORTEE_SUSPENSION.suspension_plateforme).toBe("compte_elsatia");
    expect(decisionCoupeToutesLesApplications("abonnement_suspendu")).toBe(false);
    expect(decisionCoupeToutesLesApplications("suspension_plateforme")).toBe(true);
    for (const d of Object.keys(REGLES_DECISION) as DecisionAccesClient[]) {
      if (d !== "suspension_plateforme") expect(decisionCoupeToutesLesApplications(d)).toBe(false);
    }
  });

  it("l'ordre d'évaluation n'a pas de doublon", () => {
    expect(new Set(DECISIONS_ACCES).size).toBe(DECISIONS_ACCES.length);
  });
});

describe("Gestion Pro seule propose de créer une entreprise", () => {
  it("sans organisation : onboarding dans GP, compte ELSATIA ailleurs", () => {
    expect(ecranPourDecision("sans_organisation", "gestion_pro").action).toBe("creer_ou_rejoindre_entreprise");
    for (const app of ["colors", "reserves", "tools", "studio"]) {
      expect(ecranPourDecision("sans_organisation", app).action).toBe("ouvrir_compte_elsatia");
    }
  });
});

describe("lireDecisionAcces — lecture fail-closed de la RPC", () => {
  const ok = { version: VERSION_CONTRAT_DECISION_ACCES, decision: "autorise", role_code: "colors_consultation", entreprise: { id: "e1", nom: "Entreprise A" } };

  it("lit une décision valide", () => {
    expect(lireDecisionAcces(ok, "colors")).toEqual({
      version: 1, decision: "autorise", applicationCode: "colors", roleCode: "colors_consultation", entreprise: { id: "e1", nom: "Entreprise A" },
    });
  });

  it.each([
    ["null", null],
    ["chaîne", "autorise"],
    ["objet vide", {}],
    ["code inconnu", { ...ok, decision: "ok_bypass" }],
    ["version ultérieure", { ...ok, version: 2 }],
    ["booléen brut de l'ancienne RPC", true],
  ])("%s → erreur_configuration, jamais autorise", (_nom, entree) => {
    expect(lireDecisionAcces(entree, "colors").decision).toBe("erreur_configuration");
  });

  it("n'expose ni nom d'entreprise ni rôle quand la décision ne le permet pas", () => {
    const refus = lireDecisionAcces({ ...ok, decision: "sans_organisation" }, "colors");
    expect(refus.entreprise).toBeNull();
    expect(refus.roleCode).toBeNull();
  });

  it("le rôle n'est rendu que pour `autorise`", () => {
    expect(lireDecisionAcces({ ...ok, decision: "sans_role" }, "colors").roleCode).toBeNull();
  });
});

describe("décision depuis le booléen de l'ancienne RPC", () => {
  it("true → autorise ; false → refus non qualifié (jamais un motif inventé)", () => {
    expect(decisionDepuisBooleen(true, "colors").decision).toBe("autorise");
    expect(decisionDepuisBooleen(false, "colors").decision).toBe("refus_non_qualifie");
  });
});

describe("réponse d'API : JSON et statut selon le code", () => {
  it.each([
    ["non_authentifie", 401],
    ["sans_organisation", 403],
    ["sans_role", 403],
    ["abonnement_suspendu", 423],
    ["essai_expire", 423],
    ["indisponible", 503],
    ["erreur_configuration", 500],
    ["conflit_etat", 409],
    ["trop_de_requetes", 429],
    ["session_expiree", 401],
  ] as const)("%s → %i", async (code, statut) => {
    expect(statutRefusApi(code)).toBe(statut);
    const reponse = reponseRefusApi(code);
    expect(reponse.status).toBe(statut);
    expect(reponse.headers.get("content-type")).toContain("application/json");
    expect(reponse.headers.get("cache-control")).toBe("private, no-store");
    expect(await reponse.json()).toMatchObject({ code });
  });

  it("respecte le champ message de chaque application et pose Retry-After sur 503/429", async () => {
    const colors = reponseRefusApi("sans_role", { champMessage: "erreur", message: "Habilitation requise." });
    expect(await colors.json()).toEqual({ erreur: "Habilitation requise.", code: "sans_role" });
    expect(reponseRefusApi("indisponible", { retryAfterSecondes: 30 }).headers.get("retry-after")).toBe("30");
    expect(reponseRefusApi("sans_role", { retryAfterSecondes: 30 }).headers.get("retry-after")).toBeNull();
  });
});
