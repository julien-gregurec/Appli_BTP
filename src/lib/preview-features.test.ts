import { afterEach, describe, expect, it, vi } from "vitest";
import { boutiqueEstActive, cronsSontActifs, iaEstActive } from "./preview-features";

afterEach(() => vi.unstubAllEnvs());

describe("garde-fous Preview", () => {
  it("préserve le comportement existant quand les variables sont absentes", () => {
    expect(boutiqueEstActive({})).toBe(true);
    expect(iaEstActive({})).toBe(true);
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
