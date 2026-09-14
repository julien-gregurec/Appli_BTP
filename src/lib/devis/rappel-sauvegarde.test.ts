import { describe, expect, it } from "vitest";
import { delaiRappelMs, doitRappeler, type EtatRappel } from "./rappel-sauvegarde";

const min = 60_000;
const base = (patch: Partial<EtatRappel> = {}): EtatRappel => ({ actif: true, minutes: 10, modifie: true, derniereSauvegardeReussieA: 0, dernierRappelA: null, ignorePourCeDevis: false, dejaAffiche: false, ...patch });

describe("rappel de sauvegarde — décision pure", () => {
  it("désactivé : jamais", () => { expect(doitRappeler(base({ actif: false }), 99 * min)).toBe(false); });
  it("devis inchangé : jamais, même après longtemps", () => { expect(doitRappeler(base({ modifie: false }), 999 * min)).toBe(false); });
  it("fréquences 2, 5, 10, 15, 30 et personnalisée (7) : rappel à l'échéance, pas avant", () => {
    for (const m of [2, 5, 10, 15, 30, 7]) {
      expect(doitRappeler(base({ minutes: m }), m * min - 1)).toBe(false);
      expect(doitRappeler(base({ minutes: m }), m * min)).toBe(true);
    }
    expect(delaiRappelMs(0.05)).toBe(3_000);
    expect(delaiRappelMs(0.001)).toBe(1_000);
  });
  it("devis modifié après une sauvegarde réussie : le compteur repart de cette sauvegarde", () => {
    expect(doitRappeler(base({ derniereSauvegardeReussieA: 30 * min }), 39 * min)).toBe(false);
    expect(doitRappeler(base({ derniereSauvegardeReussieA: 30 * min }), 40 * min)).toBe(true);
  });
  it("une sauvegarde échouée ne remet pas le compteur à zéro (la référence reste l'ancienne réussite)", () => {
    // Échec à 35 min : rien n'est enregistré, le rappel tombe à 40 min comme prévu.
    expect(doitRappeler(base({ derniereSauvegardeReussieA: 30 * min }), 40 * min)).toBe(true);
  });
  it("autosauvegarde réussie = vraie persistance : compteur remis à zéro", () => {
    expect(doitRappeler(base({ derniereSauvegardeReussieA: 39 * min, modifie: false }), 40 * min)).toBe(false);
    expect(doitRappeler(base({ derniereSauvegardeReussieA: 39 * min, modifie: true }), 48 * min)).toBe(false);
    expect(doitRappeler(base({ derniereSauvegardeReussieA: 39 * min, modifie: true }), 49 * min)).toBe(true);
  });
  it("plusieurs modifications : un seul rappel à la fois, « Plus tard » repousse d'une fréquence", () => {
    expect(doitRappeler(base({ dejaAffiche: true }), 99 * min)).toBe(false);
    expect(doitRappeler(base({ dernierRappelA: 10 * min }), 19 * min)).toBe(false);
    expect(doitRappeler(base({ dernierRappelA: 10 * min }), 20 * min)).toBe(true);
  });
  it("« ne plus me le rappeler pour ce devis » : jamais", () => { expect(doitRappeler(base({ ignorePourCeDevis: true }), 99 * min)).toBe(false); });
});
