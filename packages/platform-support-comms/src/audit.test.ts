import { describe, expect, it } from "vitest";
import { construireEvenementAudit, construireEvenementRefus, detecterAnomalies } from "./audit";
import type { SessionAssistance } from "./session";

const session: SessionAssistance = {
  id: "sess-1",
  acteurId: "uid-plateforme",
  acteurEmail: "julien@elsatia.fr",
  acteurNom: "Julien",
  entrepriseId: "ent-1",
  entrepriseNom: "BTP Durand",
  applications: ["gestion_pro"],
  incidentGlobal: false,
  perimetre: "correction_limitee",
  motifCategorie: "recuperation_correction",
  motifDetailInterne: "devis 2026-114 dupliqué à l’import",
  ticket: "SUP-4211",
  ouverteAt: "2026-09-08T09:50:00.000Z",
  expireAt: "2026-09-08T10:20:00.000Z",
  derniereActiviteAt: "2026-09-08T09:58:00.000Z",
  termineeAt: null,
  termineeMotif: null,
  revoqueeAt: null,
  revoqueePar: null,
};

describe("construireEvenementAudit", () => {
  it("porte l'acteur réel, jamais le client", () => {
    const e = construireEvenementAudit({
      session,
      applicationCode: "gestion_pro",
      action: "devis.corriger",
      objetType: "devis",
      objetId: "devis-1",
      utilisateurAssisteId: "uid-client",
      avant: { total: 100 },
      apres: { total: 120 },
      resultat: "succes",
      survenuAt: new Date("2026-09-08T10:00:00.000Z"),
    });
    expect(e.acteurId).toBe("uid-plateforme");
    expect(e.acteurEmail).toBe("julien@elsatia.fr");
    expect(e.utilisateurAssisteId).toBe("uid-client");
    expect(e.sessionId).toBe("sess-1");
    expect(e.entrepriseId).toBe("ent-1");
    expect(e.applicationCode).toBe("gestion_pro");
    expect(e.avant).toEqual({ total: 100 });
    expect(e.apres).toEqual({ total: 120 });
    expect(e.ticket).toBe("SUP-4211");
    expect(e.survenuAt).toBe("2026-09-08T10:00:00.000Z");
  });

  it("conserve le motif interne complet dans l'audit", () => {
    const e = construireEvenementAudit({
      session,
      applicationCode: "gestion_pro",
      action: "devis.lire",
      objetType: "devis",
      resultat: "succes",
      survenuAt: new Date("2026-09-08T10:00:00.000Z"),
    });
    expect(e.motifInterne).toContain("2026-114");
  });

  it("n'enregistre pas un avant/après identique", () => {
    const e = construireEvenementAudit({
      session,
      applicationCode: "gestion_pro",
      action: "devis.enregistrer",
      objetType: "devis",
      avant: { total: 100 },
      apres: { total: 100 },
      resultat: "succes",
      survenuAt: new Date("2026-09-08T10:00:00.000Z"),
    });
    expect(e.avant).toBeNull();
    expect(e.apres).toBeNull();
  });

  it("journalise le contexte technique quand il est disponible, sans l'inventer", () => {
    const avec = construireEvenementAudit({
      session,
      applicationCode: "gestion_pro",
      action: "devis.lire",
      objetType: "devis",
      resultat: "succes",
      contexteTechnique: { adresseIp: "203.0.113.7" },
      survenuAt: new Date("2026-09-08T10:00:00.000Z"),
    });
    expect(avec.contexteTechnique).toEqual({ adresseIp: "203.0.113.7", agent: null, origine: null });
  });

  it("journalise aussi les refus", () => {
    const e = construireEvenementRefus({
      session,
      applicationCode: "colors",
      action: "colors.lire",
      objetType: "colors_seau",
      raison: "application_hors_perimetre",
      survenuAt: new Date("2026-09-08T10:00:00.000Z"),
    });
    expect(e.resultat).toBe("refus");
    expect(e.apres).toEqual({ refus: "application_hors_perimetre" });
    expect(e.acteurId).toBe("uid-plateforme");
  });
});

describe("detecterAnomalies", () => {
  const t = (minutes: number) => new Date(Date.UTC(2026, 8, 8, 10, minutes)).toISOString();
  const maintenant = new Date(Date.UTC(2026, 8, 8, 10, 59));

  it("ne signale rien sur une activité normale", () => {
    const evenements = [
      { acteurId: "a", entrepriseId: "e1", sessionId: "s1", resultat: "succes" as const, survenuAt: t(1) },
      { acteurId: "a", entrepriseId: "e1", sessionId: "s1", resultat: "succes" as const, survenuAt: t(2) },
    ];
    expect(detecterAnomalies(evenements, maintenant)).toEqual([]);
  });

  it("signale un balayage d'entreprises", () => {
    const evenements = Array.from({ length: 9 }, (_, i) => ({
      acteurId: "a",
      entrepriseId: `e${i}`,
      sessionId: `s${i}`,
      resultat: "succes" as const,
      survenuAt: t(i),
    }));
    const anomalies = detecterAnomalies(evenements, maintenant);
    expect(anomalies.map((a) => a.code)).toContain("balayage_entreprises");
  });

  it("signale des refus répétés sur une même session", () => {
    const evenements = Array.from({ length: 6 }, (_, i) => ({
      acteurId: "a",
      entrepriseId: "e1",
      sessionId: "s1",
      resultat: "refus" as const,
      survenuAt: t(i),
    }));
    expect(detecterAnomalies(evenements, maintenant).map((a) => a.code)).toContain("refus_repetes");
  });

  it("ignore ce qui sort de la fenêtre", () => {
    const vieux = Array.from({ length: 20 }, (_, i) => ({
      acteurId: "a",
      entrepriseId: `e${i}`,
      sessionId: `s${i}`,
      resultat: "refus" as const,
      survenuAt: new Date(Date.UTC(2026, 8, 8, 5, i)).toISOString(),
    }));
    expect(detecterAnomalies(vieux, maintenant)).toEqual([]);
  });
});
