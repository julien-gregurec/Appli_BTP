import { describe, expect, it } from "vitest";
import {
  destinatairesAssistance,
  intervenantPublic,
  notificationFermetureAssistance,
  notificationOuvertureAssistance,
  statutHistorique,
} from "./notifications-assistance";
import type { SessionAssistance } from "./session";

const session: SessionAssistance = {
  id: "sess-1",
  acteurId: "uid-plateforme",
  acteurEmail: "julien@elsatia.fr",
  acteurNom: "Julien G.",
  entrepriseId: "ent-1",
  entrepriseNom: "BTP Durand",
  applications: ["gestion_pro", "colors"],
  incidentGlobal: false,
  perimetre: "lecture_seule",
  motifCategorie: "securite",
  motifDetailInterne: "suspicion d’accès frauduleux signalée",
  ticket: null,
  ouverteAt: "2026-09-08T09:50:00.000Z",
  expireAt: "2026-09-08T10:20:00.000Z",
  derniereActiviteAt: "2026-09-08T09:58:00.000Z",
  termineeAt: null,
  termineeMotif: null,
  revoqueeAt: null,
  revoqueePar: null,
};

const destinataires = [
  { utilisateurId: "u1", email: "gerant@durand.fr", qualite: "proprietaire" as const },
];

describe("notification d'ouverture", () => {
  it("annonce l'accès, l'application et la catégorie de motif", () => {
    const n = notificationOuvertureAssistance(session, ["ELSATIA Gestion Pro", "ELSATIA Colors"], destinataires);
    expect(n.type).toBe("assistance_ouverte");
    expect(n.message).toContain("ELSATIA Gestion Pro et ELSATIA Colors");
    expect(n.message).toContain("08/09/2026");
    expect(n.message).toContain("un contrôle de sécurité de la plateforme");
  });

  it("ne divulgue jamais le motif interne", () => {
    const n = notificationOuvertureAssistance(session, ["ELSATIA Gestion Pro"], destinataires);
    expect(n.message).not.toContain("frauduleux");
    expect(n.message).not.toContain("suspicion");
  });

  it("porte la session et l'entreprise pour l'historique", () => {
    const n = notificationOuvertureAssistance(session, ["ELSATIA Gestion Pro"], destinataires);
    expect(n.sessionId).toBe("sess-1");
    expect(n.entrepriseId).toBe("ent-1");
    expect(n.applicationCodes).toEqual(["gestion_pro", "colors"]);
    expect(n.canaux).toContain("centre_securite");
  });
});

describe("notification de fermeture", () => {
  it("annonce l'ouverture et la fin", () => {
    const n = notificationFermetureAssistance(session, "2026-09-08T10:12:00.000Z", destinataires);
    expect(n.type).toBe("assistance_terminee");
    expect(n.message).toContain("ouverte le 08/09/2026");
    expect(n.message).toContain("s’est terminée le 08/09/2026");
  });
});

describe("destinatairesAssistance", () => {
  it("notifie propriétaire, administrateurs et responsables configurés sans doublon", () => {
    const liste = destinatairesAssistance({
      proprietaires: [{ utilisateurId: "u1", email: "a@x.fr" }],
      administrateurs: [
        { utilisateurId: "u1", email: "a@x.fr" },
        { utilisateurId: "u2", email: "b@x.fr" },
      ],
      responsablesConfigures: [{ utilisateurId: "u3", email: null }],
    });
    expect(liste).toHaveLength(3);
    expect(liste[0].qualite).toBe("proprietaire");
    expect(liste.filter((d) => d.utilisateurId === "u1")).toHaveLength(1);
  });
});

describe("historique client", () => {
  it("qualifie le statut sans jamais le laisser ambigu", () => {
    const t = new Date("2026-09-08T10:00:00.000Z");
    expect(statutHistorique(session, t)).toBe("en_cours");
    expect(statutHistorique({ ...session, termineeAt: "2026-09-08T09:59:00.000Z" }, t)).toBe("terminee");
    expect(statutHistorique({ ...session, revoqueeAt: "2026-09-08T09:59:00.000Z" }, t)).toBe("revoquee");
    expect(statutHistorique({ ...session, expireAt: "2026-09-08T09:00:00.000Z" }, t)).toBe("expiree");
  });

  it("présente l'intervenant sans exposer l'email interne", () => {
    expect(intervenantPublic(session)).toBe("Assistance ELSATIA — Julien G.");
    expect(intervenantPublic({ acteurNom: null })).toBe("Assistance ELSATIA");
    expect(intervenantPublic(session)).not.toContain("@");
  });
});
