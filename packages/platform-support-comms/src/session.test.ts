import { describe, expect, it } from "vitest";
import {
  construireBandeauAssistance,
  evaluerSessionAssistance,
  formaterTempsRestant,
  sessionReutilisable,
  validerOuvertureAssistance,
  type SessionAssistance,
} from "./session";

const T0 = new Date("2026-09-08T10:00:00.000Z");

function session(surcharge: Partial<SessionAssistance> = {}): SessionAssistance {
  return {
    id: "sess-1",
    acteurId: "uid-plateforme",
    acteurEmail: "julien@elsatia.fr",
    acteurNom: "Julien",
    entrepriseId: "ent-1",
    entrepriseNom: "BTP Durand",
    applications: ["gestion_pro"],
    incidentGlobal: false,
    perimetre: "lecture_seule",
    motifCategorie: "demande_client",
    motifDetailInterne: null,
    ticket: null,
    ouverteAt: "2026-09-08T09:50:00.000Z",
    expireAt: "2026-09-08T10:20:00.000Z",
    derniereActiviteAt: "2026-09-08T09:58:00.000Z",
    termineeAt: null,
    termineeMotif: null,
    revoqueeAt: null,
    revoqueePar: null,
    ...surcharge,
  };
}

const demandeLecture = {
  entrepriseId: "ent-1",
  applicationCode: "gestion_pro",
  action: { famille: "lire" as const },
  maintenant: T0,
  enLigne: true,
};

describe("evaluerSessionAssistance", () => {
  it("autorise une lecture dans le périmètre", () => {
    expect(evaluerSessionAssistance(session(), demandeLecture).autorise).toBe(true);
  });

  it("refuse sans session", () => {
    const d = evaluerSessionAssistance(null, demandeLecture);
    expect(d).toMatchObject({ autorise: false, raison: "aucune_session" });
  });

  it("refuse hors ligne, avant toute autre considération", () => {
    const d = evaluerSessionAssistance(session(), { ...demandeLecture, enLigne: false });
    expect(d).toMatchObject({ autorise: false, raison: "hors_ligne_interdit" });
  });

  it("refuse une session expirée", () => {
    const d = evaluerSessionAssistance(session({ expireAt: "2026-09-08T09:59:00.000Z" }), demandeLecture);
    expect(d).toMatchObject({ autorise: false, raison: "session_expiree" });
  });

  it("refuse une session révoquée avant même de regarder l'expiration", () => {
    const d = evaluerSessionAssistance(
      session({ revoqueeAt: "2026-09-08T09:59:00.000Z", revoqueePar: "uid-autre" }),
      demandeLecture,
    );
    expect(d).toMatchObject({ autorise: false, raison: "session_revoquee" });
  });

  it("refuse une session terminée", () => {
    const d = evaluerSessionAssistance(session({ termineeAt: "2026-09-08T09:59:00.000Z" }), demandeLecture);
    expect(d).toMatchObject({ autorise: false, raison: "session_terminee" });
  });

  it("ferme sur inactivité", () => {
    const d = evaluerSessionAssistance(
      session({ derniereActiviteAt: "2026-09-08T09:40:00.000Z" }),
      demandeLecture,
    );
    expect(d).toMatchObject({ autorise: false, raison: "session_inactive" });
  });

  it("refuse une autre entreprise que celle sélectionnée", () => {
    const d = evaluerSessionAssistance(session(), { ...demandeLecture, entrepriseId: "ent-2" });
    expect(d).toMatchObject({ autorise: false, raison: "entreprise_hors_perimetre" });
  });

  it("refuse une application non sélectionnée : Gestion Pro n'ouvre ni Colors ni Réserves", () => {
    for (const app of ["colors", "reserves"]) {
      const d = evaluerSessionAssistance(session(), { ...demandeLecture, applicationCode: app });
      expect(d).toMatchObject({ autorise: false, raison: "application_hors_perimetre" });
    }
  });

  it("autorise plusieurs applications explicitement cochées", () => {
    const s = session({ applications: ["gestion_pro", "colors"] });
    expect(evaluerSessionAssistance(s, { ...demandeLecture, applicationCode: "colors" }).autorise).toBe(true);
    expect(evaluerSessionAssistance(s, { ...demandeLecture, applicationCode: "reserves" }).autorise).toBe(false);
  });

  it("refuse une action interdite même en assistance étendue", () => {
    const s = session({ perimetre: "assistance_etendue" });
    for (const code of ["afficher_secret", "recuperer_mot_de_passe", "desactiver_audit", "contourner_rls"]) {
      const d = evaluerSessionAssistance(s, {
        ...demandeLecture,
        action: { famille: "lire", code },
      });
      expect(d).toMatchObject({ autorise: false, raison: "action_interdite" });
    }
  });

  it("refuse une écriture en lecture seule", () => {
    const d = evaluerSessionAssistance(session(), {
      ...demandeLecture,
      action: { famille: "corriger" },
    });
    expect(d).toMatchObject({ autorise: false, raison: "perimetre" });
  });

  it("autorise une écriture en correction limitée", () => {
    const d = evaluerSessionAssistance(session({ perimetre: "correction_limitee" }), {
      ...demandeLecture,
      action: { famille: "corriger" },
    });
    expect(d.autorise).toBe(true);
  });
});

describe("sessionReutilisable", () => {
  it("refuse la réutilisation d'une session expirée", () => {
    expect(sessionReutilisable(session({ expireAt: "2026-09-08T09:00:00.000Z" }), T0)).toBe(false);
  });
  it("refuse la réutilisation d'une session terminée", () => {
    expect(sessionReutilisable(session({ termineeAt: "2026-09-08T09:55:00.000Z" }), T0)).toBe(false);
  });
  it("accepte une session vivante", () => {
    expect(sessionReutilisable(session(), T0)).toBe(true);
  });
});

describe("construireBandeauAssistance", () => {
  it("expose l'application, le motif public, le début et le temps restant", () => {
    const bandeau = construireBandeauAssistance(session(), "ELSATIA Gestion Pro", T0);
    expect(bandeau.titre).toBe("Session d’assistance ELSATIA");
    expect(bandeau.applicationNom).toBe("ELSATIA Gestion Pro");
    expect(bandeau.entrepriseNom).toBe("BTP Durand");
    expect(bandeau.debutIso).toBe("2026-09-08T09:50:00.000Z");
    expect(bandeau.expireIso).toBe("2026-09-08T10:20:00.000Z");
    expect(bandeau.minutesRestantes).toBe(20);
    expect(bandeau.tempsRestantLibelle).toBe("20 min");
    expect(bandeau.actionQuitter).toBe("Quitter l’assistance");
    expect(bandeau.expiree).toBe(false);
  });

  it("n'expose jamais le détail interne du motif", () => {
    const s = session({ motifCategorie: "securite", motifDetailInterne: "suspicion de fraude sur le compte" });
    const bandeau = construireBandeauAssistance(s, "ELSATIA Gestion Pro", T0);
    expect(bandeau.motif).not.toContain("fraude");
    expect(bandeau.motif).toBe("un contrôle de sécurité de la plateforme");
  });

  it("ne descend jamais sous zéro minute", () => {
    const bandeau = construireBandeauAssistance(session({ expireAt: "2026-09-08T09:00:00.000Z" }), "GP", T0);
    expect(bandeau.minutesRestantes).toBe(0);
    expect(bandeau.expiree).toBe(true);
    expect(bandeau.tempsRestantLibelle).toBe("expirée");
  });
});

describe("formaterTempsRestant", () => {
  it("formate minutes et heures", () => {
    expect(formaterTempsRestant(0)).toBe("expirée");
    expect(formaterTempsRestant(14.2)).toBe("15 min");
    expect(formaterTempsRestant(60)).toBe("1 h");
    expect(formaterTempsRestant(95)).toBe("1 h 35");
  });
});

describe("validerOuvertureAssistance", () => {
  const base = {
    entrepriseId: "ent-1",
    applications: ["gestion_pro"],
    applicationsAbonnees: ["gestion_pro", "colors"],
    incidentGlobal: false,
    perimetre: "lecture_seule",
    dureeMinutes: 30,
    aal: "aal2",
    confirmationRenforcee: false,
  };

  it("accepte une ouverture nominale", () => {
    expect(validerOuvertureAssistance(base)).toMatchObject({ valide: true, dureeMinutes: 30 });
  });

  it("exige AAL2", () => {
    const r = validerOuvertureAssistance({ ...base, aal: "aal1" });
    expect(r).toMatchObject({ valide: false });
    expect(r.valide === false && r.erreur).toContain("MFA");
  });

  it("refuse une application à laquelle l'entreprise n'est pas abonnée", () => {
    const r = validerOuvertureAssistance({ ...base, applications: ["reserves"] });
    expect(r).toMatchObject({ valide: false });
  });

  it("refuse aucune application", () => {
    expect(validerOuvertureAssistance({ ...base, applications: [] })).toMatchObject({ valide: false });
  });

  it("exige le drapeau incident global pour sélectionner toutes les applications", () => {
    const r = validerOuvertureAssistance({ ...base, applications: ["gestion_pro", "colors"] });
    expect(r).toMatchObject({ valide: false });
    expect(r.valide === false && r.erreur).toContain("incident global");
  });

  it("exige la confirmation renforcée pour un incident global", () => {
    const r = validerOuvertureAssistance({
      ...base,
      applications: ["gestion_pro", "colors"],
      incidentGlobal: true,
    });
    expect(r).toMatchObject({ valide: false });
    expect(r.valide === false && r.erreur).toContain("Confirmation renforcée");
  });

  it("accepte un incident global confirmé", () => {
    const r = validerOuvertureAssistance({
      ...base,
      applications: ["gestion_pro", "colors"],
      incidentGlobal: true,
      confirmationRenforcee: true,
    });
    expect(r).toMatchObject({ valide: true, applications: ["colors", "gestion_pro"] });
  });

  it("exige la confirmation renforcée pour l'assistance étendue", () => {
    const r = validerOuvertureAssistance({ ...base, perimetre: "assistance_etendue" });
    expect(r).toMatchObject({ valide: false });
  });

  it("borne la durée par le périmètre", () => {
    const r = validerOuvertureAssistance({ ...base, perimetre: "correction_limitee", dureeMinutes: 240 });
    expect(r).toMatchObject({ valide: false });
    expect(r.valide === false && r.erreur).toContain("60 minutes");
  });
});

// ── Correction P0 : assistance stricte, isolation et refus par défaut ──────────

describe("refus par défaut : session, application, justification, durée", () => {
  const demande = {
    entrepriseId: "ent-1",
    applicationCode: "gestion_pro",
    action: { famille: "lire" as const },
    maintenant: T0,
    enLigne: true,
  };

  it("5. isolation entre applications : une autorisation Gestion Pro n’ouvre rien d’autre", () => {
    const s = session({ applications: ["gestion_pro"] });
    for (const autre of ["colors", "reserves", "tools", "drone", "appli_future"]) {
      const d = evaluerSessionAssistance(s, { ...demande, applicationCode: autre });
      expect(d).toMatchObject({ autorise: false, raison: "application_hors_perimetre" });
    }
    expect(evaluerSessionAssistance(s, demande).autorise).toBe(true);
  });

  it("aucune application future n’hérite d’un droit support global", () => {
    // Le contrat ne connaît aucune liste d'applications : il compare à ce qui a été
    // coché à l'ouverture. Une application inventée à l'instant est donc refusée sans
    // qu'aucun code n'ait eu à la déclarer.
    const s = session({ applications: ["gestion_pro", "colors"] });
    for (const future of ["drone", "scan", "compta", "n_importe_quoi"]) {
      expect(
        evaluerSessionAssistance(s, { ...demande, applicationCode: future }).autorise,
      ).toBe(false);
    }
  });

  it("6. absence de permission : le périmètre ne s’étend jamais par défaut", () => {
    const s = session({ perimetre: "lecture_seule" });
    for (const famille of ["configurer", "corriger", "exporter", "supprimer"] as const) {
      expect(evaluerSessionAssistance(s, { ...demande, action: { famille } }).autorise).toBe(false);
    }
  });

  it("7. session expirée : accès refusé", () => {
    const s = session({ expireAt: "2026-09-08T09:59:59.000Z" });
    expect(evaluerSessionAssistance(s, demande)).toMatchObject({
      autorise: false,
      raison: "session_expiree",
    });
  });

  it("8. session révoquée : accès refusé, avant même l’expiration", () => {
    const s = session({ revoqueeAt: "2026-09-08T09:55:00.000Z", revoqueePar: "uid-autre" });
    expect(evaluerSessionAssistance(s, demande)).toMatchObject({
      autorise: false,
      raison: "session_revoquee",
    });
  });

  it("justification absente ou insuffisante : accès refusé", () => {
    // Catégorie inconnue.
    expect(
      evaluerSessionAssistance(
        session({ motifCategorie: "curiosite" as never }),
        demande,
      ),
    ).toMatchObject({ autorise: false, raison: "justification_absente" });

    // Catégorie exigeant un détail, sans détail exploitable.
    for (const detail of [null, "", "   ", "ok"]) {
      expect(
        evaluerSessionAssistance(
          session({ motifCategorie: "securite", motifDetailInterne: detail }),
          demande,
        ),
      ).toMatchObject({ autorise: false, raison: "justification_absente" });
    }

    // La même catégorie, correctement justifiée, passe.
    expect(
      evaluerSessionAssistance(
        session({ motifCategorie: "securite", motifDetailInterne: "contrôle après alerte MFA" }),
        demande,
      ).autorise,
    ).toBe(true);
  });

  it("durée invalide : accès refusé", () => {
    for (const surcharge of [
      { expireAt: "2026-09-08T09:50:00.000Z" },
      { expireAt: "2026-09-08T09:40:00.000Z" },
      { expireAt: "pas-une-date" },
      { ouverteAt: "pas-une-date" },
    ]) {
      const d = evaluerSessionAssistance(session(surcharge), demande);
      expect(d.autorise).toBe(false);
      if (!d.autorise) expect(["fenetre_invalide", "session_expiree"]).toContain(d.raison);
    }
  });
});
