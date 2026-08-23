import { afterEach, describe, expect, it, vi } from "vitest";
import { boutiqueEstActive, cronsSontActifs, iaEstActive } from "./preview-features";

afterEach(() => vi.unstubAllEnvs());

describe("garde-fous Preview", () => {
  it("préserve le comportement existant (fail-open) quand les variables boutique/crons sont absentes", () => {
    expect(boutiqueEstActive({})).toBe(true);
    expect(cronsSontActifs({})).toBe(true);
  });

  it("désactive explicitement chaque fonctionnalité", () => {
    const environnement = {
      FEATURE_BOUTIQUE_ENABLED: "false",
      FEATURE_AI_ENABLED: "false",
      FEATURE_CRONS_ENABLED: "false",
    };
    expect(boutiqueEstActive(environnement)).toBe(false);
    expect(iaEstActive(environnement)).toBe(false);
    expect(cronsSontActifs(environnement)).toBe(false);
  });
});

// AI-LAUNCH-V1B : FEATURE_AI_ENABLED est une fonctionnalité commerciale désactivable, donc
// fail-closed contrairement aux deux autres drapeaux ci-dessus — une variable absente (ex.
// oubliée lors d'un déploiement) ne doit jamais activer l'IA par défaut.
describe("FEATURE_AI_ENABLED — fail-closed", () => {
  it("désactive l'IA quand la variable est absente", () => {
    expect(iaEstActive({})).toBe(false);
  });

  it("active l'IA uniquement quand la variable vaut exactement 'true'", () => {
    expect(iaEstActive({ FEATURE_AI_ENABLED: "true" })).toBe(true);
    expect(iaEstActive({ FEATURE_AI_ENABLED: "TRUE" })).toBe(true);
    expect(iaEstActive({ FEATURE_AI_ENABLED: " true " })).toBe(true);
  });

  it("désactive l'IA pour toute autre valeur, y compris une faute de frappe", () => {
    expect(iaEstActive({ FEATURE_AI_ENABLED: "false" })).toBe(false);
    expect(iaEstActive({ FEATURE_AI_ENABLED: "1" })).toBe(false);
    expect(iaEstActive({ FEATURE_AI_ENABLED: "vrai" })).toBe(false);
    expect(iaEstActive({ FEATURE_AI_ENABLED: "" })).toBe(false);
  });
});
