import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ rpc: async () => ({ data: null, error: null }) }),
}));

const { assistanceStricteActive, estDeploiementProduction, modeAssistance } = await import(
  "./assistance-server"
);

/**
 * Ces tests portent sur la LECTURE de l'environnement — la règle elle-même est prouvée
 * dans `mode-assistance.test.ts`. Ce qui se joue ici est le point d'intégration : c'est
 * lui qui décide, en vrai, si un déploiement est en Production.
 */
describe("posture d’assistance lue depuis l’environnement", () => {
  beforeEach(() => {
    vi.stubEnv("ELSATIA_ASSISTANCE_STRICTE", undefined);
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("ELSATIA_ENV", undefined);
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("1. variable absente : mode strict", () => {
    expect(modeAssistance()).toMatchObject({ strict: true, raison: "defaut_absent" });
    expect(assistanceStricteActive()).toBe(true);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("2. valeur invalide : mode strict et avertissement journalisé", () => {
    vi.stubEnv("ELSATIA_ASSISTANCE_STRICTE", "oui");
    expect(modeAssistance()).toMatchObject({ strict: true, raison: "valeur_invalide" });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("[securite][assistance]"));
  });

  it("3. désactivation refusée sur chaque signal de Production", () => {
    for (const [cle, valeur] of [
      ["NODE_ENV", "production"],
      ["VERCEL_ENV", "production"],
      ["ELSATIA_ENV", "production"],
    ] as const) {
      vi.stubEnv("NODE_ENV", "test");
      vi.stubEnv("VERCEL_ENV", undefined);
      vi.stubEnv("ELSATIA_ENV", undefined);
      vi.stubEnv(cle, valeur);
      vi.stubEnv("ELSATIA_ASSISTANCE_STRICTE", "0");

      expect(estDeploiementProduction()).toBe(true);
      const mode = modeAssistance();
      expect(mode.strict).toBe(true);
      expect(mode.raison).toBe("production_verrouillee");
      expect(mode.avertissement).toContain("refusée");
    }
  });

  it("4. mode hérité possible hors Production, et seulement là", () => {
    vi.stubEnv("ELSATIA_ASSISTANCE_STRICTE", "0");
    expect(estDeploiementProduction()).toBe(false);
    const mode = modeAssistance();
    expect(mode.strict).toBe(false);
    expect(mode.raison).toBe("herite_explicite");
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("HÉRITÉ"));
  });

  it("« 1 » reste accepté comme demande explicite de mode strict", () => {
    vi.stubEnv("ELSATIA_ASSISTANCE_STRICTE", "1");
    expect(modeAssistance()).toMatchObject({ strict: true, raison: "demande_explicite" });
  });

  it("un environnement de Production sans variable reste strict, sans bruit", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(modeAssistance()).toMatchObject({ strict: true, raison: "defaut_absent" });
    expect(console.warn).not.toHaveBeenCalled();
  });
});
