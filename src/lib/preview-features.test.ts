import { afterEach, describe, expect, it, vi } from "vitest";
import { boutiqueEstActive, cronsSontActifs, iaEstActive, iaDevisEstActive } from "./preview-features";

afterEach(() => vi.unstubAllEnvs());

describe("garde-fous Preview", () => {
  it("laisse les crons actifs par défaut, mais jamais la boutique", () => {
    expect(cronsSontActifs({})).toBe(true);
    expect(boutiqueEstActive({})).toBe(false);
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

// IA-DEVIS-PROD-ACTIVATION-V1 §6 : sous-flag de FEATURE_AI_ENABLED, même exigence fail-closed
// — une variable absente ou mal orthographiée ne doit jamais exposer les outils IA devis.
describe("FEATURE_AI_DEVIS_ENABLED — fail-closed", () => {
  it("désactive l'IA devis quand la variable est absente", () => {
    expect(iaDevisEstActive({})).toBe(false);
  });

  it("désactive l'IA devis quand la variable vaut explicitement 'false'", () => {
    expect(iaDevisEstActive({ FEATURE_AI_DEVIS_ENABLED: "false" })).toBe(false);
  });

  it("active l'IA devis uniquement quand la variable vaut exactement 'true'", () => {
    expect(iaDevisEstActive({ FEATURE_AI_DEVIS_ENABLED: "true" })).toBe(true);
    expect(iaDevisEstActive({ FEATURE_AI_DEVIS_ENABLED: "TRUE" })).toBe(true);
    expect(iaDevisEstActive({ FEATURE_AI_DEVIS_ENABLED: " true " })).toBe(true);
  });

  it("désactive l'IA devis pour toute autre valeur, y compris une faute de frappe", () => {
    expect(iaDevisEstActive({ FEATURE_AI_DEVIS_ENABLED: "1" })).toBe(false);
    expect(iaDevisEstActive({ FEATURE_AI_DEVIS_ENABLED: "vrai" })).toBe(false);
    expect(iaDevisEstActive({ FEATURE_AI_DEVIS_ENABLED: "" })).toBe(false);
  });

  it("reste indépendant de FEATURE_AI_ENABLED : l'IA générale active seule n'expose pas l'IA devis", () => {
    expect(iaDevisEstActive({ FEATURE_AI_ENABLED: "true" })).toBe(false);
  });
});

// P0 de l'audit Boutique : `boutiqueEstActive()` était fail-open — toute valeur
// autre que « false » ouvrait la boutique, y compris l'absence de variable. Une
// surface qui encaisse ne doit jamais s'ouvrir par défaut d'oubli.
describe("FEATURE_BOUTIQUE_ENABLED — fail-closed", () => {
  it("ferme la boutique quand la variable est absente, vide ou invalide", () => {
    expect(boutiqueEstActive({})).toBe(false);
    expect(boutiqueEstActive({ FEATURE_BOUTIQUE_ENABLED: "" })).toBe(false);
    expect(boutiqueEstActive({ FEATURE_BOUTIQUE_ENABLED: "   " })).toBe(false);
    expect(boutiqueEstActive({ FEATURE_BOUTIQUE_ENABLED: "oui" })).toBe(false);
    expect(boutiqueEstActive({ FEATURE_BOUTIQUE_ENABLED: "1" })).toBe(false);
    expect(boutiqueEstActive({ FEATURE_BOUTIQUE_ENABLED: "enabled" })).toBe(false);
    expect(boutiqueEstActive({ FEATURE_BOUTIQUE_ENABLED: "false" })).toBe(false);
  });

  it("n'ouvre la boutique que sur un « true » explicite", () => {
    expect(boutiqueEstActive({ FEATURE_BOUTIQUE_ENABLED: "true" })).toBe(true);
    expect(boutiqueEstActive({ FEATURE_BOUTIQUE_ENABLED: "TRUE" })).toBe(true);
    expect(boutiqueEstActive({ FEATURE_BOUTIQUE_ENABLED: " true " })).toBe(true);
  });

  it("ne s'ouvre pas davantage en Production : aucun environnement n'est une exception", () => {
    for (const environnement of ["production", "preview", "development"]) {
      expect(boutiqueEstActive({ NODE_ENV: environnement, VERCEL_ENV: environnement })).toBe(false);
    }
    // Il n'existe aucun chemin d'activation implicite : seule la variable compte.
    expect(boutiqueEstActive({ NODE_ENV: "production", FEATURE_BOUTIQUE_ENABLED: "true" })).toBe(true);
  });
});
