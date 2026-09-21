import { describe, expect, it } from "vitest";
import {
  ACTIONS_INTERDITES,
  DOMAINES_SENSIBLES,
  PERIMETRES_ASSISTANCE,
  estActionInterdite,
  evaluerPerimetre,
  validerDureeAssistance,
} from "./perimetres";

describe("moindre privilège", () => {
  it("lecture seule n'autorise que la lecture", () => {
    expect(evaluerPerimetre("lecture_seule", { famille: "lire" }).autorise).toBe(true);
    for (const famille of ["diagnostiquer", "configurer", "corriger", "exporter", "supprimer"] as const) {
      expect(evaluerPerimetre("lecture_seule", { famille }).autorise).toBe(false);
    }
  });

  it("les périmètres sont strictement croissants", () => {
    const familles = PERIMETRES_ASSISTANCE.map((p) => new Set(p.familles));
    for (let i = 1; i < familles.length; i += 1) {
      for (const f of familles[i - 1]) expect(familles[i].has(f)).toBe(true);
      expect(familles[i].size).toBeGreaterThan(familles[i - 1].size);
    }
  });

  it("l'administration des rôles et de l'abonnement n'est jamais dans un périmètre d'assistance", () => {
    for (const p of PERIMETRES_ASSISTANCE) {
      for (const famille of ["administrer_roles", "modifier_abonnement"] as const) {
        const d = evaluerPerimetre(p.cle, { famille });
        expect(d).toMatchObject({ autorise: false, raison: "famille_hors_assistance" });
      }
    }
  });

  it("la durée maximale décroît quand le périmètre s'élargit", () => {
    const durees = PERIMETRES_ASSISTANCE.map((p) => p.dureeMaximaleMinutes);
    for (let i = 1; i < durees.length; i += 1) {
      expect(durees[i]).toBeLessThanOrEqual(durees[i - 1]);
    }
  });
});

describe("domaines sensibles", () => {
  it("une facture émise n'est jamais modifiable, quel que soit le périmètre", () => {
    for (const p of PERIMETRES_ASSISTANCE) {
      const d = evaluerPerimetre(p.cle, {
        famille: "corriger",
        domaine: "factures",
        confirmationRenforceeFournie: true,
      });
      expect(d.autorise).toBe(false);
    }
  });

  it("les paiements ne sont lisibles qu'en assistance étendue et jamais modifiables", () => {
    expect(
      evaluerPerimetre("correction_limitee", { famille: "lire", domaine: "paiements", confirmationRenforceeFournie: true }).autorise,
    ).toBe(false);
    expect(
      evaluerPerimetre("assistance_etendue", { famille: "lire", domaine: "paiements", confirmationRenforceeFournie: true }).autorise,
    ).toBe(true);
    expect(
      evaluerPerimetre("assistance_etendue", { famille: "corriger", domaine: "paiements", confirmationRenforceeFournie: true }).autorise,
    ).toBe(false);
  });

  it("abonnement, remises, rôles et sécurité ne s'écrivent jamais en assistance", () => {
    for (const domaine of ["abonnement", "remises", "roles", "securite"] as const) {
      const d = evaluerPerimetre("assistance_etendue", {
        famille: "configurer",
        domaine,
        confirmationRenforceeFournie: true,
      });
      expect(d).toMatchObject({ autorise: false, raison: "domaine_ecriture_refusee" });
    }
  });

  it("chaque domaine sensible exige une confirmation renforcée", () => {
    for (const regle of DOMAINES_SENSIBLES) {
      expect(regle.confirmationRenforcee).toBe(true);
      const d = evaluerPerimetre("assistance_etendue", { famille: "lire", domaine: regle.domaine });
      if (!d.autorise) {
        expect(["confirmation_renforcee_requise", "domaine_lecture_refusee"]).toContain(d.raison);
      }
    }
  });

  it("un export de masse exige l'assistance étendue et une confirmation", () => {
    expect(
      evaluerPerimetre("correction_limitee", { famille: "exporter", domaine: "exports", confirmationRenforceeFournie: true }).autorise,
    ).toBe(false);
    expect(
      evaluerPerimetre("assistance_etendue", { famille: "exporter", domaine: "exports" }),
    ).toMatchObject({ autorise: false, raison: "confirmation_renforcee_requise" });
    expect(
      evaluerPerimetre("assistance_etendue", { famille: "exporter", domaine: "exports", confirmationRenforceeFournie: true }).autorise,
    ).toBe(true);
  });
});

describe("actions absolument interdites", () => {
  it("la liste couvre les sept interdits du cahier des charges", () => {
    expect([...ACTIONS_INTERDITES].sort()).toEqual(
      [
        "acceder_autre_entreprise",
        "afficher_secret",
        "contourner_rls",
        "desactiver_audit",
        "modifier_facture_emise",
        "recuperer_mot_de_passe",
        "supprimer_historique_assistance",
      ].sort(),
    );
  });

  it("reconnaît un interdit et ignore le reste", () => {
    expect(estActionInterdite("afficher_secret")).toBe(true);
    expect(estActionInterdite("lire_chantier")).toBe(false);
  });
});

describe("validerDureeAssistance", () => {
  it("accepte les durées proposées", () => {
    for (const minutes of [15, 30, 60]) {
      expect(validerDureeAssistance("lecture_seule", minutes)).toMatchObject({ valide: true });
    }
  });
  it("refuse une durée hors bornes", () => {
    expect(validerDureeAssistance("lecture_seule", 2)).toMatchObject({ valide: false });
    expect(validerDureeAssistance("assistance_etendue", 120)).toMatchObject({ valide: false });
    expect(validerDureeAssistance("lecture_seule", 12.5)).toMatchObject({ valide: false });
  });
  it("accepte une durée personnalisée sous le maximum", () => {
    expect(validerDureeAssistance("lecture_seule", 90)).toMatchObject({ valide: true, minutes: 90 });
  });
});
