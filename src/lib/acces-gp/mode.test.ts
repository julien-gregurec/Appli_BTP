import { describe, expect, it } from "vitest";
import {
  AVERTISSEMENT_ENFORCE_NON_IMPLEMENTE,
  ECHANTILLON_PAR_DEFAUT,
  lireEchantillonAccesGp,
  lireModeAccesGp,
} from "./mode";

describe("lireModeAccesGp — off par défaut, enforce n'existe pas", () => {
  it.each([undefined, null, "", "   ", "off", "OFF", " Off "])("%j → off sans avertissement", (valeur) => {
    expect(lireModeAccesGp(valeur)).toEqual({ mode: "off", avertissement: null });
  });

  it.each(["observe", "OBSERVE", "  observe\n"])("%j → observe", (valeur) => {
    expect(lireModeAccesGp(valeur)).toEqual({ mode: "observe", avertissement: null });
  });

  it.each(["enforce", "ENFORCE", " Enforce "])("%j est rétrogradé en observe avec l'avertissement explicite", (valeur) => {
    const lecture = lireModeAccesGp(valeur);
    expect(lecture.mode).toBe("observe");
    expect(lecture.avertissement).toBe(AVERTISSEMENT_ENFORCE_NON_IMPLEMENTE);
    expect(lecture.avertissement).toContain("enforcement non implémenté : qualification du backfill requise");
  });

  it.each(["1", "true", "on", "enforced", "observe,enforce", "block"])("valeur inconnue %j → off (une faute de frappe n'active rien)", (valeur) => {
    const lecture = lireModeAccesGp(valeur);
    expect(lecture.mode).toBe("off");
    expect(lecture.avertissement).toContain("valeur inconnue");
  });

  it("n'expose aucun mode actif nommé enforce, quelle que soit l'entrée", () => {
    for (const v of ["enforce", "observe", "off", "x", undefined]) {
      expect(["off", "observe"]).toContain(lireModeAccesGp(v as string | undefined).mode);
    }
  });
});

describe("lireEchantillonAccesGp — défaut 1 %, borné à [0, 1]", () => {
  it.each([undefined, null, "", "  ", "abc", "NaN", "Infinity"])("%j → défaut", (valeur) => {
    expect(lireEchantillonAccesGp(valeur)).toBe(ECHANTILLON_PAR_DEFAUT);
    expect(ECHANTILLON_PAR_DEFAUT).toBe(0.01);
  });
  it.each([
    ["0", 0],
    ["1", 1],
    ["0.25", 0.25],
    ["0,5", 0.5],
    ["2", 1],
    ["-3", 0],
    ["1e-3", 0.001],
  ])("%j → %d", (valeur, attendu) => {
    expect(lireEchantillonAccesGp(valeur)).toBe(attendu);
  });
});
