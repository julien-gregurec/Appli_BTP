import { describe, expect, it } from "vitest";
import {
  permissionsDeConsultation,
  resoudreModeAssistance,
  resoudrePermissionsAssistance,
} from "./mode-assistance";

const CATALOGUE = [
  "acces_clients",
  "acces_chantiers",
  "voir_rentabilite",
  "gerer_devis",
  "gerer_utilisateurs",
  "gerer_paie",
];

describe("posture d’assistance — strict par défaut", () => {
  it("1. variable absente : mode strict", () => {
    for (const valeurBrute of [undefined, null, "", "   "]) {
      expect(resoudreModeAssistance({ valeurBrute, production: false })).toEqual({
        strict: true,
        raison: "defaut_absent",
        avertissement: null,
      });
    }
  });

  it("« 1 » et « true » demandent explicitement le mode strict", () => {
    for (const valeurBrute of ["1", "true", "TRUE", " True "]) {
      expect(resoudreModeAssistance({ valeurBrute, production: false })).toMatchObject({
        strict: true,
        raison: "demande_explicite",
      });
    }
  });

  it("2. valeur invalide : mode strict, avec avertissement", () => {
    for (const valeurBrute of ["oui", "non", "0.0", "strict", "yes", "off", "2", "-1"]) {
      const mode = resoudreModeAssistance({ valeurBrute, production: false });
      expect(mode.strict).toBe(true);
      expect(mode.raison).toBe("valeur_invalide");
      expect(mode.avertissement).toContain("mode strict appliqué par défaut");
    }
  });

  it("3. tentative de désactivation en Production : refusée, strict imposé, avertissement", () => {
    for (const valeurBrute of ["0", "false", "FALSE"]) {
      const mode = resoudreModeAssistance({ valeurBrute, production: true });
      expect(mode.strict).toBe(true);
      expect(mode.raison).toBe("production_verrouillee");
      expect(mode.avertissement).toContain("refusée");
    }
  });

  it("en Production, aucune valeur ne peut désactiver le mode strict", () => {
    const valeurs = [undefined, "", "1", "true", "0", "false", "oui", "n’importe quoi"];
    for (const valeurBrute of valeurs) {
      expect(resoudreModeAssistance({ valeurBrute, production: true }).strict).toBe(true);
    }
  });

  it("4. mode hérité explicitement autorisé hors Production, avec avertissement de sécurité", () => {
    for (const valeurBrute of ["0", "false"]) {
      const mode = resoudreModeAssistance({ valeurBrute, production: false });
      expect(mode.strict).toBe(false);
      expect(mode.raison).toBe("herite_explicite");
      expect(mode.avertissement).toContain("HÉRITÉ");
    }
  });
});

describe("résolution des permissions d’assistance", () => {
  const strict = resoudreModeAssistance({ valeurBrute: undefined, production: false });
  const herite = resoudreModeAssistance({ valeurBrute: "0", production: false });
  const lecture = permissionsDeConsultation(CATALOGUE);

  it("le contrat serveur fait autorité quand il répond", () => {
    expect(
      resoudrePermissionsAssistance({
        perimetreServeur: ["acces_clients", "gerer_devis"],
        mode: herite,
        permissionsLectureSeule: lecture,
      }),
    ).toEqual({ source: "contrat", permissions: ["acces_clients", "gerer_devis"] });
  });

  it("le contrat prime même sur le mode hérité, y compris quand il ne renvoie rien", () => {
    expect(
      resoudrePermissionsAssistance({
        perimetreServeur: null,
        mode: herite,
        permissionsLectureSeule: lecture,
      }),
    ).toEqual({ source: "contrat", permissions: [] });
  });

  it("6. contrat absent et posture stricte : aucune permission de gestion", () => {
    const resolution = resoudrePermissionsAssistance({
      perimetreServeur: undefined,
      mode: strict,
      permissionsLectureSeule: lecture,
    });
    expect(resolution.source).toBe("strict");
    expect(resolution.permissions).toEqual(["acces_clients", "acces_chantiers", "voir_rentabilite"]);
    for (const interdite of ["gerer_devis", "gerer_utilisateurs", "gerer_paie"]) {
      expect(resolution.permissions).not.toContain(interdite);
    }
  });

  it("contrat absent et mode hérité : comportement historique, isolé dans sa propre branche", () => {
    expect(
      resoudrePermissionsAssistance({
        perimetreServeur: undefined,
        mode: herite,
        permissionsLectureSeule: lecture,
      }),
    ).toEqual({ source: "herite", permissions: null });
  });

  it("en Production, contrat absent : jamais « tous les droits »", () => {
    const modeProduction = resoudreModeAssistance({ valeurBrute: "false", production: true });
    const resolution = resoudrePermissionsAssistance({
      perimetreServeur: undefined,
      mode: modeProduction,
      permissionsLectureSeule: lecture,
    });
    expect(resolution.source).toBe("strict");
    expect(resolution.permissions).not.toBeNull();
  });

  it("ne retient que les clés de consultation, sans deviner par absence de préfixe", () => {
    expect(permissionsDeConsultation(["acces_x", "voir_y", "gerer_z", "exporter_w"])).toEqual([
      "acces_x",
      "voir_y",
    ]);
  });
});
